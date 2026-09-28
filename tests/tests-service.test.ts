import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { TempDir } from './helpers'
import { TestsService } from '../src/main/services/tests'
import { testKey } from '../src/shared/tests'

const fsApi = { exists: (p: string) => existsSync(p), read: (p: string) => readFileSync(p, 'utf8'), list: (p: string) => { try { return readdirSync(p, { withFileTypes: true }).map((d) => ({ name: d.name, dir: d.isDirectory() })) } catch { return [] } } }

describe('tests discovery', () => {
  it('finds suites (root and workspaces), gives each test file to its deepest suite, skips node_modules', () => {
    const t = new TempDir()
    t.write('package.json', JSON.stringify({ name: 'root', devDependencies: { vitest: '3' }, workspaces: ['apps/*'] }))
    t.write('pnpm-lock.yaml', '')
    t.write('tests/a.test.ts', "describe('a', () => { it('x', () => {}) })")
    t.write('apps/web/package.json', JSON.stringify({ name: 'web', devDependencies: { jest: '29' } }))
    t.write('apps/web/src/b.spec.tsx', "test('b', () => {})")
    t.write('node_modules/lib/c.test.js', "test('no', () => {})")
    t.write('api/pytest.ini', '')
    t.write('pyproject.toml', '[tool.pytest.ini_options]\n')
    t.write('api/tests/test_api.py', 'def test_get():\n    pass\n')
    const s = new TestsService(join(t.path, 'app'), fsApi, () => {})
    const suites = s.discover(t.path)
    expect(suites.map((x) => [x.framework, x.label, x.manager, x.files.map((f) => f.path.slice(t.path.length))])).toEqual([
      ['vitest', t.path.split('/').pop(), 'pnpm', ['/tests/a.test.ts']],
      ['pytest', t.path.split('/').pop(), null, ['/api/tests/test_api.py']],
      ['jest', 'web', 'pnpm', ['/apps/web/src/b.spec.tsx']],
    ])
    expect(suites[0].files[0].tests[0]).toMatchObject({ name: 'a', children: [{ name: 'x' }] })
    expect(suites[0].report.startsWith(join(t.path, 'app', 'tests'))).toBe(true)
    t.dispose()
  })

  it('reads the reports of the runs from disk', () => {
    const t = new TempDir()
    t.write('package.json', JSON.stringify({ devDependencies: { vitest: '3' } }))
    t.write('a.test.ts', "it('ok', () => {})")
    const got: any[] = []
    const s = new TestsService(join(t.path, 'app'), fsApi, (r) => got.push(r))
    const [suite] = s.discover(t.path)
    expect(s.results()).toEqual([])
    t.write(suite.report, JSON.stringify({ testResults: [{ name: join(t.path, 'a.test.ts'), assertionResults: [{ ancestorTitles: [], title: 'ok', status: 'passed' }] }] }))
    // read on demand (the renderer asks when a run ends); the watcher's event is a bonus FSEvents may drop
    expect(s.results()).toEqual([[testKey(join(t.path, 'a.test.ts'), ['ok']), { status: 'passed' }]])
    s.dispose()
    t.dispose()
  })
})
