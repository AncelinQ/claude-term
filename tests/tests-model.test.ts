import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { detectFramework, failedCount, fileId, isTestFile, parseJsTests, parsePyTests, readJsonReport, readJunitReport, testCommand, testKey, testsTree } from '../src/shared/tests'

const names = (nodes: any[]): any[] => nodes.map((n) => (n.children.length ? [n.name, n.line, names(n.children)] : [n.name, n.line]))

describe('test discovery', () => {
  it('detects the frameworks of a folder', () => {
    expect(detectFramework(['package.json'], JSON.stringify({ devDependencies: { vitest: '^3' } }))).toEqual(['vitest'])
    expect(detectFramework(['package.json', 'jest.config.js'], '{}')).toEqual(['jest'])
    expect(detectFramework(['package.json'], JSON.stringify({ jest: { preset: 'x' } }))).toEqual(['jest'])
    expect(detectFramework(['vitest.config.ts'], null)).toEqual(['vitest'])
    expect(detectFramework(['pyproject.toml'], null, '[tool.pytest.ini_options]\n')).toEqual(['pytest'])
    expect(detectFramework(['conftest.py'], null)).toEqual(['pytest'])
    expect(detectFramework(['package.json'], '{ broken')).toEqual([])
    expect(isTestFile('/p/src/a.test.ts', 'vitest')).toBe(true)
    expect(isTestFile('/p/src/a.spec.tsx', 'jest')).toBe(true)
    expect(isTestFile('/p/src/a.ts', 'vitest')).toBe(false)
    expect(isTestFile('/p/tests/test_api.py', 'pytest')).toBe(true)
    expect(isTestFile('/p/api_test.py', 'pytest')).toBe(true)
    expect(isTestFile('/p/api.py', 'pytest')).toBe(false)
  })

  it('reads describe / it / test with their lines and nesting', () => {
    const src = [
      "import { describe, it } from 'vitest'",          // 1
      "describe('outer', () => {",                        // 2
      "  it('first', () => { expect({ a: 1 }).toEqual({ a: 1 }) })", // 3
      "  describe.each([1, 2])('inner %s', (n) => {",    // 4
      "    test(`with ${n} template`, () => {",          // 5
      "      const s = '}'; // a brace in a string",      // 6
      "    })",                                           // 7
      "  })",                                             // 8
      "  it.skip(\"skipped \\\"quoted\\\"\", () => {})",  // 9
      "})",                                               // 10
      "// it('commented out', () => {})",                // 11
      "/* test('in a block comment', () => {}) */",      // 12
      "test('top level', () => {})",                      // 13
    ].join('\n')
    expect(names(parseJsTests(src))).toEqual([
      ['outer', 2, [['first', 3], ['inner %s', 4, [['with ${n} template', 5]]], ['skipped "quoted"', 9]]],
      ['top level', 13],
    ])
  })

  it('reads a real test file of this repository', () => {
    const tree = parseJsTests(readFileSync(join(__dirname, 'order.test.ts'), 'utf8'))
    expect(names(tree)).toEqual([['tab reorder', 5, [['moves before / after the target', 6], ['ignores self drops and unknown keys', 12]]]])
  })

  it('reads pytest functions and classes', () => {
    const src = ['import pytest', '', 'def test_one():', '    assert 1', '', 'class TestApi:', '    def test_get(self):', '        pass', '', '    async def test_post(self):', '        pass', '', 'def helper():', '    pass', 'class Other:', '    def test_not_collected(self): pass', 'def test_two(): pass'].join('\n')
    expect(names(parsePyTests(src))).toEqual([['test_one', 3], ['TestApi', 6, [['test_get', 7], ['test_post', 10]]], ['test_two', 17]])
  })
})

describe('test commands', () => {
  const vit = { framework: 'vitest' as const, dir: '/p/app', label: 'app', manager: 'pnpm' as const }
  it('all, a file, one test, with a machine report', () => {
    expect(testCommand(vit, { kind: 'all' }, '/r.json')).toEqual(['pnpm', 'exec', 'vitest', 'run', '--reporter=default', '--reporter=json', '--outputFile=/r.json'])
    expect(testCommand(vit, { kind: 'test', file: '/p/app/src/a.test.ts', path: ['math (x+1)', 'adds'] }, '/r.json'))
      .toEqual(['pnpm', 'exec', 'vitest', 'run', 'src/a.test.ts', '-t', '^math \\(x\\+1\\) adds$', '--reporter=default', '--reporter=json', '--outputFile=/r.json'])
    expect(testCommand({ ...vit, framework: 'jest', manager: 'npm' }, { kind: 'file', file: '/p/app/a.test.js' }, '/r.json')).toEqual(['npx', 'jest', 'a.test.js', '--json', '--outputFile=/r.json'])
    expect(testCommand({ ...vit, framework: 'pytest', manager: null }, { kind: 'test', file: '/p/app/tests/test_api.py', path: ['TestApi', 'test_get'] }, '/r.xml'))
      .toEqual(['pytest', 'tests/test_api.py::TestApi::test_get', '--junitxml=/r.xml'])
    expect(testCommand({ ...vit, manager: 'yarn' }, { kind: 'all' }, '/r')[0]).toBe('yarn')
    expect(testCommand({ ...vit, manager: 'bun' }, { kind: 'all' }, '/r')[0]).toBe('bunx')
  })
})

describe('test reports', () => {
  it('reads a Vitest / Jest JSON report', () => {
    const report = JSON.stringify({ testResults: [{ name: '/p/a.test.ts', assertionResults: [
      { ancestorTitles: ['math'], title: 'adds', status: 'passed' },
      { ancestorTitles: ['math'], title: 'divides', status: 'failed', failureMessages: ['\u001b[31mAssertionError\u001b[39m: expected 1 to be 2'] },
      { ancestorTitles: [], title: 'later', status: 'todo' },
    ] }] })
    const r = readJsonReport(report)
    expect(r.get(testKey('/p/a.test.ts', ['math', 'adds']))).toEqual({ status: 'passed' })
    expect(r.get(testKey('/p/a.test.ts', ['math', 'divides']))).toEqual({ status: 'failed', message: 'AssertionError: expected 1 to be 2' })
    expect(r.get(testKey('/p/a.test.ts', ['later']))?.status).toBe('skipped')
    expect(readJsonReport('{ broken').size).toBe(0)
  })
  it('reads a pytest JUnit report', () => {
    const xml = `<?xml version="1.0"?><testsuites><testsuite name="pytest">
      <testcase classname="tests.test_api.TestApi" name="test_get" file="tests/test_api.py" line="6" time="0.01" />
      <testcase classname="tests.test_api" name="test_one[1]" time="0.01"><failure message="assert 1 == 2">def test_one():&#10;&gt;       assert 1 == 2</failure></testcase>
      <testcase classname="tests.test_api" name="test_skip"><skipped message="later" /></testcase>
    </testsuite></testsuites>`
    const r = readJunitReport(xml, '/p')
    expect(r.get(testKey('/p/tests/test_api.py', ['TestApi', 'test_get']))).toEqual({ status: 'passed' })
    expect(r.get(testKey('/p/tests/test_api.py', ['test_one']))).toEqual({ status: 'failed', message: 'def test_one():\n>       assert 1 == 2' })
    expect(r.get(testKey('/p/tests/test_api.py', ['test_skip']))?.status).toBe('skipped')
  })
})

describe('tests tree', () => {
  const suite = { framework: 'vitest' as const, dir: '/p', label: 'p', manager: 'npm' as const, files: [
    { path: '/p/tests/a.test.ts', tests: [{ name: 'math', line: 1, kind: 'describe' as const, children: [{ name: 'adds', line: 2, kind: 'test' as const, children: [] }, { name: 'divides', line: 3, kind: 'test' as const, children: [] }] }] },
    { path: '/p/tests/b.test.ts', tests: [{ name: 'later', line: 1, kind: 'test' as const, children: [] }] },
  ] }
  it('shows statuses up the tree, the failure line, run / stop / fix actions', () => {
    const results = new Map([
      [testKey('/p/tests/a.test.ts', ['math', 'adds']), { status: 'passed' as const }],
      [testKey('/p/tests/a.test.ts', ['math', 'divides']), { status: 'failed' as const, message: '\nAssertionError: expected 1 to be 2\n  at x' }],
    ])
    const [s] = testsTree([suite], results, new Set([fileId(suite, '/p/tests/b.test.ts')]), '/p')
    expect(s).toMatchObject({ label: 'Vitest', icon: 'x', expanded: true, extra: '1 ✗' })
    const [a, b] = s.children!
    expect(a).toMatchObject({ label: 'tests/a.test.ts', file: '/p/tests/a.test.ts', icon: 'x' })
    const [adds, divides] = a.children![0].children!
    expect(adds).toMatchObject({ icon: 'check', color: 'badge.ok' })
    expect(adds.actions!.map((x) => x.id)).toEqual(['run'])
    expect(divides).toMatchObject({ icon: 'x', detail: 'AssertionError: expected 1 to be 2' })
    expect(divides.actions!.map((x) => x.id)).toEqual(['run', 'fix'])
    expect(b).toMatchObject({ badges: ['en cours'] })
    expect(b.actions!.map((x) => x.id)).toEqual(['stop'])
    expect(b.children![0].icon).toBe('code')
    expect(failedCount(results)).toBe(1)
  })
  it('names a workspace suite and keeps several suites closed', () => {
    const two = testsTree([suite, { ...suite, framework: 'jest', dir: '/p/apps/web', label: 'web', files: [] }], new Map(), new Set(), '/p')
    expect(two.map((x) => [x.label, x.expanded])).toEqual([['Vitest', false], ['Jest · web', false]])
  })
})
