import { describe, it, expect } from 'vitest'
import { symlinkSync, mkdirSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { TempDir } from './helpers'
import { fsError, inside, netError, permissionError, type PolicyCtx } from '../src/main/services/plugin-policy'

const ctx = (o: Partial<PolicyCtx> = {}): PolicyCtx => ({ builtin: false, permissions: new Set(), pluginDir: '/data/plugins/x', hosts: [], projectRoot: '/work/proj', home: '/home/me', real: (p) => p, ...o })

describe('plugin policy', () => {
  it('requires "process" for exec and terminal runs of user plugins', () => {
    expect(permissionError('process.exec', ctx())).toMatch(/"process"/)
    expect(permissionError('terminal.run', ctx())).toMatch(/"process"/)
    expect(permissionError('process.exec', ctx({ permissions: new Set(['process']) }))).toBeNull()
    expect(permissionError('process.exec', ctx({ builtin: true }))).toBeNull()
    expect(permissionError('ui.viewSet', ctx())).toBeNull()
    // opening a project widens fs, a URL can carry data out
    expect(permissionError('workspace.openProject', ctx())).toMatch(/"process"/)
    expect(permissionError('workspace.openUrl', ctx())).toMatch(/"process"/)
    expect(permissionError('workspace.openUrl', ctx({ permissions: new Set(['process']) }))).toBeNull()
    expect(permissionError('ui.projectDecoration', ctx())).toBeNull()
    expect(permissionError('workspace.projects', ctx())).toBeNull()
  })

  it('limits fs to the plugin folder and the project, the home folder with fs:home', () => {
    expect(fsError('/work/proj/src/a.ts', ctx())).toBeNull()
    expect(fsError('/work/proj', ctx())).toBeNull()
    expect(fsError('/data/plugins/x/lib.js', ctx())).toBeNull()
    expect(fsError('/work/proj/../other/secret', ctx())).toMatch(/fs:home/)
    expect(fsError('/work/project-2/a', ctx())).toMatch(/fs:home/)
    expect(fsError('/home/me/.ssh/id_rsa', ctx())).toMatch(/fs:home/)
    expect(fsError('/home/me/.ssh/id_rsa', ctx({ permissions: new Set(['fs:home']) }))).toBeNull()
    expect(fsError('/etc/passwd', ctx({ permissions: new Set(['fs:home']) }))).toMatch(/fs:home/)
    expect(fsError('/work/proj/a', ctx({ projectRoot: null }))).toMatch(/fs:home/)
    expect(fsError('relative/a', ctx())).toMatch(/absolute/)
    expect(fsError('', ctx())).toMatch(/invalid/)
    expect(fsError(42, ctx())).toMatch(/invalid/)
    expect(fsError('/anything', ctx({ builtin: true }))).toBeNull()
  })

  it('follows symlinks: a link in the project to outside is refused', () => {
    const t = new TempDir()
    const proj = join(t.path, 'proj'), secret = join(t.path, 'secret')
    mkdirSync(proj); mkdirSync(secret); t.write('secret/key', 'k'); t.write('proj/ok.txt', 'x')
    symlinkSync(secret, join(proj, 'link'), 'junction')   // a junction: Windows needs no privilege for it, others ignore the type
    const c = ctx({ projectRoot: proj, pluginDir: join(t.path, 'plug'), home: '/nowhere', real: realpathSync })
    expect(fsError(join(proj, 'ok.txt'), c)).toBeNull()
    expect(fsError(join(proj, 'link', 'key'), c)).toMatch(/fs:home/)
    expect(fsError(join(proj, 'new-file'), c)).toBeNull()
    t.dispose()
  })

  it('requires "network" to fetch, and "secrets" for secrets; fetches reach the declared hosts only, built-ins included', () => {
    for (const m of ['net.fetch', 'secrets.get', 'secrets.set', 'secrets.delete']) expect(permissionError(m, ctx())).toMatch(/"(network|secrets)"/)
    expect(permissionError('net.fetch', ctx({ permissions: new Set(['network']) }))).toBeNull()
    expect(permissionError('secrets.get', ctx({ permissions: new Set(['network']) }))).toMatch(/"secrets"/)
    expect(permissionError('secrets.get', ctx({ permissions: new Set(['secrets']) }))).toBeNull()
    const hosts = ['api.linear.app']
    expect(netError('https://api.linear.app/graphql', ctx({ hosts }))).toBeNull()
    expect(netError('https://example.com/', ctx({ hosts }))).toMatch(/hosts/)
    expect(netError('https://example.com/', ctx({ builtin: true }))).toMatch(/hosts/)
    expect(netError(undefined, ctx({ hosts }))).toMatch(/url/)
  })

  it('inside', () => {
    expect(inside('/a/b', '/a')).toBe(true)
    expect(inside('/a', '/a')).toBe(true)
    expect(inside('/ab', '/a')).toBe(false)
    expect(inside('/', '/a')).toBe(false)
  })
})
