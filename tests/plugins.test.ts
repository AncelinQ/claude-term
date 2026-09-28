import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { TempDir } from './helpers'
import { validateManifest, filterItems } from '../src/shared/plugins'
import { existsSync, readFileSync, readdirSync } from 'node:fs'

const require = createRequire(import.meta.url)
const { detect } = require('../resources/plugins/runnables/detect.js')
const fsApi = { exists: (p: string) => existsSync(p), read: (p: string) => readFileSync(p, 'utf8'), list: (p: string) => { try { return readdirSync(p, { withFileTypes: true }).map((d) => ({ name: d.name, dir: d.isDirectory() })) } catch { return [] } } }

describe('plugin manifests', () => {
  it('validates ids, main and contributions', () => {
    expect(validateManifest({ id: 'x.y', name: 'X', main: 'main.js' })).toBeNull()
    expect(validateManifest({ id: 'Bad Id', name: 'X', main: 'main.js' })).toMatch(/id/)
    expect(validateManifest({ id: 'x', name: 'X' })).toMatch(/main/)
    expect(validateManifest({ id: 'x', name: 'X', main: 'm.js', contributes: { activity: [{ id: 'a', title: 'A', side: 'top' }] } })).toMatch(/activity/)
  })
})

describe('runnables detection', () => {
  it('finds npm scripts (favorites first, workspaces), make targets, cargo, go, python and shell scripts', () => {
    const t = new TempDir()
    t.write('package.json', JSON.stringify({ name: 'root', scripts: { zeta: 'z', dev: 'vite', test: 'vitest' }, workspaces: ['apps/*'] }))
    t.write('pnpm-lock.yaml', '')
    t.write('apps/web/package.json', JSON.stringify({ name: 'web', scripts: { start: 'next' } }))
    t.write('Makefile', 'all: build\n\tgo\n.PHONY: all\nbuild:\n\techo\nVAR := 1\n')
    t.write('Cargo.toml', '[package]\nname = "x"\n')
    t.write('go.mod', 'module x\n')
    t.write('pyproject.toml', '[project.scripts]\nserve = "x:main"\n\n[tool.pytest.ini_options]\n')
    t.write('deploy.sh', '#!/bin/sh\n')
    const groups = detect(fsApi, t.path)
    const byLabel = Object.fromEntries(groups.map((g: any) => [g.label.split(' ·')[0], g]))
    expect(byLabel.root.children.map((c: any) => c.label)).toEqual(['dev', 'test', 'zeta'])
    expect(byLabel.root.children[0].command).toBe('pnpm run dev')
    expect(byLabel.web.children[0]).toMatchObject({ label: 'start', command: 'npm run start', cwd: join(t.path, 'apps', 'web') })
    expect(byLabel.Makefile.children.map((c: any) => c.label)).toEqual(['all', 'build'])
    expect(byLabel.Cargo.children[0].command).toBe('cargo run')
    expect(byLabel.Go.children[2].command).toBe('go test ./...')
    expect(byLabel.Python.children.map((c: any) => c.label)).toEqual(['serve', 'pytest'])
    expect(byLabel['Scripts shell'].children[0].command).toBe('./deploy.sh')
    expect(detect(fsApi, join(t.path, 'nothing-here'))).toEqual([])
    t.dispose()
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

describe('runnables: running commands', () => {
  const { withRuns, runOf } = require('../resources/plugins/runnables/runs.js')
  const groups = [
    { id: 'npm:/p', label: 'web · npm', children: [{ id: 'npm:/p:dev', label: 'dev', actions: [{ id: 'run' }] }, { id: 'npm:/p:build', label: 'build', actions: [{ id: 'run' }] }] },
  ]
  it('lists what runs first, marks the script, offers stop and show', () => {
    const launched = new Map([['runnables:1', 'npm:/p:dev']])
    const runs = [{ id: 'runnables:1', tabId: 't2', cwd: '/p', command: 'npm run dev', started: true }, { id: 'runnables:9', tabId: 't3', cwd: '/q', command: 'make x', label: 'x', started: false }]
    const items = withRuns(groups, runs, launched)
    expect(items[0]).toMatchObject({ id: 'g:running', label: 'En cours · 2', expanded: true })
    expect(items[0].children.map((c: any) => [c.id, c.label, c.detail, c.badges])).toEqual([['run:runnables:1', 'dev', 'web', []], ['run:runnables:9', 'x', 'make x', ['démarrage']]])
    expect(items[0].children[0].actions.map((a: any) => a.id)).toEqual(['stop', 'show'])
    expect(items[1].children[0]).toMatchObject({ badges: ['en cours'] })
    expect(items[1].children[0].actions.map((a: any) => a.id)).toEqual(['stop', 'show'])
    expect(items[1].children[1].actions.map((a: any) => a.id)).toEqual(['run'])
    expect(withRuns(groups, [], new Map())).toEqual(groups)
    expect(runOf('run:runnables:9', runs, launched)).toBe('runnables:9')
    expect(runOf('npm:/p:dev', runs, launched)).toBe('runnables:1')
    expect(runOf('npm:/p:build', runs, launched)).toBeNull()
  })
})
