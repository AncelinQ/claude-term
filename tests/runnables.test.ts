import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { TempDir } from './helpers'
import { detectRunnables, runnablesTree } from '../src/shared/runnables'

const fsApi = { exists: (p: string) => existsSync(p), read: (p: string) => readFileSync(p, 'utf8'), list: (p: string) => { try { return readdirSync(p, { withFileTypes: true }).map((d) => ({ name: d.name, dir: d.isDirectory() })) } catch { return [] } } }

describe('runnables: detection', () => {
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
    const groups = detectRunnables(fsApi, t.path)
    const byLabel = Object.fromEntries(groups.map((g: any) => [g.label.split(' ·')[0], g]))
    expect(byLabel.root.children.map((c: any) => c.label)).toEqual(['dev', 'test', 'zeta'])
    expect(byLabel.root.children[0].command).toBe('pnpm run dev')
    expect(byLabel.web.children[0]).toMatchObject({ label: 'start', command: 'npm run start', cwd: join(t.path, 'apps', 'web') })
    expect(byLabel.Makefile.children.map((c: any) => c.label)).toEqual(['all', 'build'])
    expect(byLabel.Cargo.children[0].command).toBe('cargo run')
    expect(byLabel.Go.children[2].command).toBe('go test ./...')
    expect(byLabel.Python.children.map((c: any) => c.label)).toEqual(['serve', 'pytest'])
    expect(byLabel['Scripts shell'].children[0].command).toBe('./deploy.sh')
    expect(detectRunnables(fsApi, join(t.path, 'nothing-here'))).toEqual([])
    t.dispose()
  })
})


describe('runnables: running commands', () => {
  const groups = [
    { id: 'npm:/p', label: 'web · npm', children: [{ id: 'npm:/p:dev', label: 'dev', cwd: '/p', command: 'npm run dev', actions: [{ id: 'run' }] }, { id: 'npm:/p:build', label: 'build', cwd: '/p', command: 'npm run build', actions: [{ id: 'run' }] }] },
    { id: 'make:/p', label: 'Makefile', children: [{ id: 'make:/p:all', label: 'all', cwd: '/p', command: 'make all' }] },
  ]
  it('lists what runs first, marks the script, offers stop and show; groups closed unless alone', () => {
    const running = [{ runId: 'r1', itemId: 'npm:/p:dev', command: 'npm run dev', started: true }, { runId: 'r9', label: 'npm install', command: 'npm install', started: false }]
    const items = runnablesTree(groups as any, running)
    expect(items[0]).toMatchObject({ id: 'g:running', label: 'En cours · 2', expanded: true })
    expect(items[0].children!.map((c) => [c.id, c.label, c.detail, c.badges])).toEqual([['run:r1', 'dev', 'web', []], ['run:r9', 'npm install', 'npm install', ['démarrage']]])
    expect(items[0].children![0].actions!.map((a) => a.id)).toEqual(['stop', 'show'])
    expect(items[1].children![0]).toMatchObject({ badges: ['en cours'] })
    expect(items[1].children![0].actions!.map((a) => a.id)).toEqual(['stop', 'show'])
    expect(items[1].children![1].actions!.map((a) => a.id)).toEqual(['run'])
    expect(items.slice(1).map((g) => g.expanded)).toEqual([false, false])
    expect(runnablesTree([groups[0]] as any, [])[0].expanded).toBe(true)
  })
})


describe('runnables: workspace spellings', () => {
  it('"./packages/*" names the same folders as "packages/*"', () => {
    const t = new TempDir()
    t.write('package.json', JSON.stringify({ name: 'root', workspaces: ['./packages/*'] }))
    t.write('packages/a/package.json', JSON.stringify({ name: 'a', scripts: { build: 'tsc' } }))
    const groups = detectRunnables(fsApi, t.path)
    expect(groups.map((g: any) => g.id)).toEqual(['npm:' + t.path, 'npm:' + join(t.path, 'packages', 'a')])
    expect(groups[1].children[0].id).toBe('npm:' + join(t.path, 'packages', 'a') + ':build')
    t.dispose()
  })
})
