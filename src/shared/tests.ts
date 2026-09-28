import type { ViewAction, ViewItem } from './plugins'

/**
 * The Exécuteurs panel's Tests tab (pure, tested): which test frameworks a project uses, the tests a file declares
 * (read from the source, nothing is run), the command that runs all / a file / one test with a machine report, and
 * the reading of those reports (Vitest / Jest JSON, pytest JUnit XML).
 */
export type Framework = 'vitest' | 'jest' | 'pytest'
export interface TestSuite { framework: Framework; dir: string; label: string; manager: 'npm' | 'pnpm' | 'yarn' | 'bun' | null }
export interface TestNode { name: string; line: number; kind: 'describe' | 'test'; children: TestNode[] }
export type TestStatus = 'passed' | 'failed' | 'skipped'
export interface TestResult { status: TestStatus; message?: string }

const JS_TEST = /\.(test|spec)\.[cm]?[jt]sx?$/
const PY_TEST = /(^|[\\/])(test_[^\\/]*|[^\\/]*_test)\.py$/
export const isTestFile = (path: string, fw: Framework) => (fw === 'pytest' ? PY_TEST.test(path) : JS_TEST.test(path))

/** frameworks of a folder: package.json (dependencies, "jest" key, config files) and pytest's markers */
export function detectFramework(files: string[], pkgJson: string | null, pyproject: string | null = null): Framework[] {
  const out: Framework[] = []
  let pkg: any = null
  try { pkg = pkgJson ? JSON.parse(pkgJson) : null } catch { pkg = null }
  const deps = { ...pkg?.dependencies, ...pkg?.devDependencies }
  const has = (re: RegExp) => files.some((f) => re.test(f))
  if (deps.vitest || has(/^vitest\.config\./)) out.push('vitest')
  else if (deps.jest || pkg?.jest || has(/^jest\.config\./)) out.push('jest')
  if (has(/^(pytest\.ini|conftest\.py)$/) || /\[tool\.pytest/.test(pyproject ?? '')) out.push('pytest')
  return out
}

/** "$" in a string literal of a JS/TS test name: the name as written, quotes removed */
const JS_CALL = /\b(describe|suite|context|it|test)(?:\.(?:only|skip|todo|concurrent|sequential|fails|each\s*\([^)]*\)))*\s*\(\s*(['"`])((?:\\.|(?!\2).)*)\2/g

/**
 * Tests a JS/TS file declares: describe / it / test calls with a literal name, nested by braces (strings, template
 * literals and comments skipped). Names with ${} interpolations are kept as written.
 */
export function parseJsTests(text: string): TestNode[] {
  const root: TestNode = { name: '', line: 0, kind: 'describe', children: [] }
  const stack: { node: TestNode; depth: number }[] = [{ node: root, depth: 0 }]
  let depth = 0, pending: TestNode | null = null, inComment = false
  const lines = text.split('\n')
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li]
    JS_CALL.lastIndex = 0
    const calls: { at: number; end: number; node: TestNode }[] = []
    let m: RegExpExecArray | null
    while ((m = JS_CALL.exec(line))) calls.push({ at: m.index, end: m.index + m[0].length, node: { name: m[3].replace(/\\(.)/g, '$1'), line: li + 1, kind: /^(describe|suite|context)$/.test(m[1]) ? 'describe' : 'test', children: [] } })
    let str: string | null = null
    for (let col = 0; col < line.length; col++) {
      const c = line[col], n = line[col + 1]
      if (inComment) { if (c === '*' && n === '/') { inComment = false; col++ } continue }
      const call = str ? undefined : calls.find((x) => x.at === col)
      if (call) {
        stack[stack.length - 1].node.children.push(call.node)
        if (call.node.kind === 'describe') pending = call.node
        col = call.end - 1   // the name literal is consumed
        continue
      }
      if (str) { if (c === '\\') col++; else if (c === str) str = null; continue }
      if (c === '/' && n === '/') break
      if (c === '/' && n === '*') { inComment = true; col++; continue }
      if (c === '"' || c === "'" || c === '`') { str = c; continue }
      if (c === '{') { depth++; if (pending) { stack.push({ node: pending, depth }); pending = null } }
      else if (c === '}') { if (stack.length > 1 && stack[stack.length - 1].depth === depth) stack.pop(); depth-- }
    }
  }
  return root.children
}

/** pytest: module-level `def test_*`, `class Test*` with their `def test_*` methods (by indentation) */
export function parsePyTests(text: string): TestNode[] {
  const out: TestNode[] = []
  let cls: { node: TestNode; indent: number } | null = null
  text.split('\n').forEach((line, i) => {
    const indent = line.length - line.trimStart().length
    const c = line.match(/^(\s*)class\s+(Test\w*)\s*[:(]/)
    const d = line.match(/^(\s*)(?:async\s+)?def\s+(test\w*)\s*\(/)
    if (cls && line.trim() && indent <= cls.indent && !c) cls = null
    if (c) { const node: TestNode = { name: c[2], line: i + 1, kind: 'describe', children: [] }; out.push(node); cls = { node, indent: c[1].length } }
    else if (d) {
      const node: TestNode = { name: d[2], line: i + 1, kind: 'test', children: [] }
      if (cls && d[1].length > cls.indent) cls.node.children.push(node); else if (!d[1].length) out.push(node)
    }
  })
  return out
}

export const parseTests = (text: string, fw: Framework) => (fw === 'pytest' ? parsePyTests(text) : parseJsTests(text))

// MARK: commands

export type TestTarget = { kind: 'all' } | { kind: 'file'; file: string } | { kind: 'test'; file: string; path: string[] }

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const exec = (m: TestSuite['manager']) => (m === 'pnpm' ? ['pnpm', 'exec'] : m === 'yarn' ? ['yarn'] : m === 'bun' ? ['bunx'] : ['npx'])
const rel = (dir: string, file: string) => (file.startsWith(dir) ? file.slice(dir.length).replace(/^[\\/]/, '') : file)

/** argv running `target` in `suite.dir`, writing a machine report to `report` (Vitest / Jest JSON, pytest JUnit) */
export function testCommand(suite: TestSuite, target: TestTarget, report: string): string[] {
  const file = target.kind === 'all' ? [] : [rel(suite.dir, target.file)]
  if (suite.framework === 'pytest') {
    const id = target.kind === 'test' ? [file[0] + '::' + target.path.join('::')] : file
    return ['pytest', ...id, `--junitxml=${report}`]
  }
  const name = target.kind === 'test' ? ['-t', '^' + escapeRe(target.path.join(' ')) + '$'] : []
  if (suite.framework === 'vitest') return [...exec(suite.manager), 'vitest', 'run', ...file, ...name, '--reporter=default', '--reporter=json', `--outputFile=${report}`]
  return [...exec(suite.manager), 'jest', ...file, ...name, '--json', `--outputFile=${report}`]
}

// MARK: reports

/** key of a test result: its file (absolute) and its path of names */
export const testKey = (file: string, path: string[]) => file + '::' + path.join(' > ')

/** Vitest / Jest JSON report → results by testKey */
export function readJsonReport(text: string): Map<string, TestResult> {
  const out = new Map<string, TestResult>()
  let d: any
  try { d = JSON.parse(text) } catch { return out }
  for (const f of Array.isArray(d?.testResults) ? d.testResults : []) {
    for (const a of Array.isArray(f?.assertionResults) ? f.assertionResults : []) {
      const status: TestStatus = a.status === 'passed' ? 'passed' : a.status === 'failed' ? 'failed' : 'skipped'
      const msg = Array.isArray(a.failureMessages) && a.failureMessages.length ? stripAnsi(a.failureMessages.join('\n')) : undefined
      out.set(testKey(String(f.name), [...(a.ancestorTitles ?? []), a.title]), { status, ...(msg ? { message: msg } : {}) })
    }
  }
  return out
}

/** pytest JUnit XML → results by testKey (file from `file` or the dotted classname, relative to `dir`) */
export function readJunitReport(xml: string, dir: string): Map<string, TestResult> {
  const out = new Map<string, TestResult>()
  const cases = xml.match(/<testcase\b[^>]*?(?:\/>|>[\s\S]*?<\/testcase>)/g) ?? []
  for (const c of cases) {
    const attr = (n: string) => c.match(new RegExp(`\\b${n}="([^"]*)"`))?.[1]
    const name = attr('name'), classname = attr('classname') ?? ''
    if (!name) continue
    const parts = classname.split('.')
    const cls = parts.length && /^Test/.test(parts[parts.length - 1]) ? parts.pop()! : null
    const file = attr('file') ?? parts.join('/') + '.py'
    const status: TestStatus = /<(failure|error)\b/.test(c) ? 'failed' : /<skipped\b/.test(c) ? 'skipped' : 'passed'
    const msg = c.match(/<(?:failure|error)\b[^>]*?(?:message="([^"]*)")?[^>]*>([\s\S]*?)<\/(?:failure|error)>/)
    out.set(testKey(joinPath(dir, file), cls ? [cls, name.replace(/\[.*$/, '')] : [name.replace(/\[.*$/, '')]), { status, ...(msg ? { message: unescapeXml(msg[2] || msg[1] || '').trim() } : {}) })
  }
  return out
}

const joinPath = (dir: string, file: string) => (file.startsWith('/') || /^[a-z]:/i.test(file) ? file : dir.replace(/[\\/]+$/, '') + '/' + file)
const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '')
const unescapeXml = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#10;/g, '\n').replace(/&amp;/g, '&')

// MARK: the tree of the Tests tab

export interface SuiteFiles extends TestSuite { files: { path: string; tests: TestNode[] }[] }
const RUN: ViewAction = { id: 'run', title: 'Lancer', icon: 'play', primary: true }
const STOP: ViewAction = { id: 'stop', title: 'Arrêter (Ctrl+C)', icon: 'stop', primary: true }
const FIX: ViewAction = { id: 'fix', title: 'Corriger avec Claude', icon: 'claude' }
const FW = { vitest: 'Vitest', jest: 'Jest', pytest: 'pytest' } as const

/** ids of the tree's items, decoded back into run targets by the panel */
export const suiteId = (s: TestSuite) => `tsuite:${s.framework}:${s.dir}`
export const fileId = (s: TestSuite, file: string) => `tfile:${s.framework}:${file}`
export const nodeId = (s: TestSuite, file: string, path: string[]) => `ttest:${s.framework}:${testKey(file, path)}`

type Agg = TestStatus | undefined
const merge = (a: Agg[]): Agg => (a.includes('failed') ? 'failed' : a.length && a.every((x) => x === 'passed' || x === 'skipped') && a.includes('passed') ? 'passed' : a.length && a.every((x) => x === 'skipped') ? 'skipped' : undefined)
const look = (st: Agg): Partial<ViewItem> => st === 'passed' ? { icon: 'check', color: 'badge.ok' } : st === 'failed' ? { icon: 'x', color: 'badge.error' } : st === 'skipped' ? { icon: 'minus', muted: true } : {}

/**
 * Suites → files → describes → tests, with the last results (status icon, failure's first line), what runs
 * (■ instead of ▶, "en cours") and "Corriger avec Claude" on failures. Groups stay closed except a lone suite.
 */
export function testsTree(suites: SuiteFiles[], results: Map<string, TestResult>, running: Set<string>, root: string): ViewItem[] {
  const acts = (id: string, failed: boolean): Pick<ViewItem, 'actions' | 'badges'> => running.has(id) ? { actions: [STOP], badges: ['en cours'] } : { actions: failed ? [RUN, FIX] : [RUN] }
  return suites.map((s) => {
    const files = s.files.map((f) => {
      const nodes = (list: TestNode[], path: string[]): { items: ViewItem[]; st: Agg[] } => {
        const out: ViewItem[] = [], st: Agg[] = []
        for (const n of list) {
          const p = [...path, n.name], id = nodeId(s, f.path, p)
          if (n.kind === 'describe') {
            const sub = nodes(n.children, p), agg = merge(sub.st)
            out.push({ id, label: n.name, icon: 'list', ...look(agg), children: sub.items, ...acts(id, agg === 'failed') }); st.push(...sub.st)
          } else {
            const r = results.get(testKey(f.path, p))
            out.push({ id, label: n.name, icon: 'code', ...look(r?.status), ...(r?.status === 'failed' && r.message ? { detail: r.message.split('\n').find((l) => l.trim())?.trim().slice(0, 120) } : {}), ...acts(id, r?.status === 'failed') }); st.push(r?.status)
          }
        }
        return { items: out, st }
      }
      const sub = nodes(f.tests, []), agg = merge(sub.st)
      const id = fileId(s, f.path)
      // files closed by default (the user's choice is remembered); a failing file opens
      return { item: { id, label: f.path.startsWith(s.dir) ? f.path.slice(s.dir.length + 1) : f.path, file: f.path, ...look(agg), expanded: agg === 'failed', children: sub.items, ...acts(id, agg === 'failed') } as ViewItem, st: sub.st }
    })
    const all = files.flatMap((f) => f.st), agg = merge(all), id = suiteId(s)
    const failed = all.filter((x) => x === 'failed').length
    const where = s.dir === root ? '' : ' · ' + s.label
    return { id, label: `${FW[s.framework]}${where}`, icon: 'play', ...look(agg), expanded: suites.length === 1, ...(failed ? { extra: `${failed} ✗` } : {}), children: files.map((f) => f.item), ...acts(id, false) } as ViewItem
  })
}

/** failed tests of the results (the tab's count) */
export const failedCount = (results: Map<string, TestResult>) => [...results.values()].filter((r) => r.status === 'failed').length
