import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { TempDir } from './helpers'
import { validateManifest } from '../src/shared/plugins'
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
