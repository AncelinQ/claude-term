import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { TempDir } from './helpers'
import { validateManifest, filterItems, grantsOf, hostAllowed, pendingPermissions, type PluginPermission } from '../src/shared/plugins'
import { existsSync, readFileSync, readdirSync } from 'node:fs'

const require = createRequire(import.meta.url)
const fsApi = { exists: (p: string) => existsSync(p), read: (p: string) => readFileSync(p, 'utf8'), list: (p: string) => { try { return readdirSync(p, { withFileTypes: true }).map((d) => ({ name: d.name, dir: d.isDirectory() })) } catch { return [] } } }

describe('plugin manifests', () => {
  it('validates ids, main and contributions', () => {
    expect(validateManifest({ id: 'x.y', name: 'X', main: 'main.js' })).toBeNull()
    expect(validateManifest({ id: 'Bad Id', name: 'X', main: 'main.js' })).toMatch(/id/)
    expect(validateManifest({ id: 'x', name: 'X' })).toMatch(/main/)
    expect(validateManifest({ id: 'x', name: 'X', main: 'm.js', contributes: { activity: [{ id: 'a', title: 'A', side: 'top' }] } })).toMatch(/activity/)
  })

  it('wants the hosts of "network": lowercase domains, a wildcard for subdomains', () => {
    const m = (o: object) => validateManifest({ id: 'x', name: 'X', main: 'm.js', ...o })
    expect(m({ permissions: ['network'], hosts: ['api.linear.app', '*.linear.app', 'xn--bcher-kva.example'] })).toBeNull()
    expect(m({ permissions: ['network'] })).toMatch(/hosts/)
    expect(m({ permissions: ['network'], hosts: [] })).toMatch(/hosts/)
    for (const bad of ['https://api.linear.app', 'API.linear.app', 'localhost', '127.0.0.1', 'linear.app:8443', '*', '*.app.*', 'a..b', '-a.com', 'api.linear.app/'])
      expect(m({ permissions: ['network'], hosts: [bad] }), bad).toMatch(/hosts invalides/)
    expect(m({ hosts: 'api.linear.app' })).toMatch(/hosts invalides/)
  })

  it('grants the hosts with "network", and asks again for a new one', () => {
    const m = { permissions: ['network', 'secrets'] as PluginPermission[], hosts: ['api.linear.app'] }
    expect(grantsOf(m)).toEqual(['network', 'secrets', 'network:api.linear.app'])
    expect(grantsOf({ permissions: ['process'], hosts: ['api.linear.app'] })).toEqual(['process'])
    expect(grantsOf({})).toEqual([])
    expect(pendingPermissions(m, grantsOf(m))).toEqual([])
    expect(pendingPermissions(m, undefined)).toEqual(['network', 'secrets'])
    // approved before the hosts existed, or with fewer of them
    expect(pendingPermissions(m, ['network', 'secrets'])).toEqual(['network'])
    expect(pendingPermissions({ ...m, hosts: ['api.linear.app', 'uploads.linear.app'] }, grantsOf(m))).toEqual(['network'])
    expect(pendingPermissions({ permissions: ['secrets'] }, grantsOf(m))).toEqual([])
  })

  it('lets a URL through on https to a declared host only', () => {
    const hosts = ['api.linear.app', '*.cdn.acme.dev']
    expect(hostAllowed('https://api.linear.app/graphql', hosts)).toBe(true)
    expect(hostAllowed('https://API.Linear.app/graphql?x=1', hosts)).toBe(true)
    expect(hostAllowed('https://a.cdn.acme.dev/x', hosts)).toBe(true)
    expect(hostAllowed('https://a.b.cdn.acme.dev/x', hosts)).toBe(true)
    expect(hostAllowed('https://cdn.acme.dev/x', hosts)).toBe(false)
    expect(hostAllowed('https://evilcdn.acme.dev/x', hosts)).toBe(false)
    expect(hostAllowed('http://api.linear.app/graphql', hosts)).toBe(false)
    expect(hostAllowed('https://api.linear.app:8443/graphql', hosts)).toBe(false)
    expect(hostAllowed('https://user:pw@api.linear.app/', hosts)).toBe(false)
    expect(hostAllowed('https://api.linear.app.evil.com/', hosts)).toBe(false)
    expect(hostAllowed('https://evil.com/?u=https://api.linear.app', hosts)).toBe(false)
    expect(hostAllowed('https://api.linear.app./', hosts)).toBe(false)
    expect(hostAllowed('wss://api.linear.app/', hosts)).toBe(false)
    expect(hostAllowed('not a url', hosts)).toBe(false)
  })
})

describe('view search', () => {
  const items = [
    { id: 'g1', label: 'devgen · npm', children: [{ id: 'a', label: 'start', detail: 'tsx src/server.ts' }, { id: 'b', label: 'gen', detail: 'tsx src/cli.ts' }] },
    { id: 'g2', label: 'mobile · npm', children: [{ id: 'c', label: 'dev', detail: 'expo start' }] },
  ]
  it('finds commands by name or command line, folders by name with all their commands', () => {
    expect(filterItems(items, 'gen').map((g) => [g.label, g.children?.map((c) => c.label)])).toEqual([['devgen · npm', ['start', 'gen']]])
    expect(filterItems(items, 'dev').map((g) => [g.label, g.children?.map((c) => c.label)])).toEqual([['devgen · npm', ['start', 'gen']], ['mobile · npm', ['dev']]])
    expect(filterItems(items, 'expo').map((g) => [g.label, g.children?.map((c) => c.label)])).toEqual([['mobile · npm', ['dev']]])
    expect(filterItems(items, 'cli')[0].children?.map((c) => c.label)).toEqual(['gen'])
    expect(filterItems(items, 'zzz')).toEqual([])
    expect(filterItems(items, 'expo')[0].expanded).toBe(true)
  })
})

