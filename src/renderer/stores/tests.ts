import { create } from 'zustand'
import { fileId, nodeId, parseTests, suiteId, testCommand, testKey, type SuiteFiles, type TestNode, type TestResult, type TestTarget } from '@shared/tests'
import { startRun, useRunnables } from './runnables'
import { useWorkbench } from './workbench'

type Suite = SuiteFiles & { report: string }
export interface TestLine { line: number; label: string; itemId: string; status?: TestResult['status'] }

/**
 * The Tests tab's state: suites of the active project with their tests (read from the files), the results of the
 * runs (reports read by main), and the runs themselves (through the Scripts tab's runs: shown in the terminal,
 * stoppable). Item ids come from shared/tests (suite / file / test).
 */
interface TestsStore {
  root: string | null
  suites: Suite[]
  results: Map<string, TestResult>
  loading: boolean
  load(root: string | null): Promise<void>
  run(itemId: string): void
  stop(itemId: string): void
  fix(itemId: string): void
  /** where an item is (file and line), for opening it */
  locate(itemId: string): { path: string; line: number } | null
  /** gutter: the tests a file declares, when it belongs to a suite */
  lines(path: string, text: string): TestLine[]
  runningIds(): Set<string>
}

let listening = false

// when a test run ends (its tab reports the end), its report is read again: deterministic, the report watcher in main
// can miss an event (FSEvents drops some under load)
let testRuns = new Set<string>()
useRunnables.subscribe(() => {
  const now = new Set(useRunnables.getState().running().filter((r) => r.itemId?.startsWith('t')).map((r) => r.runId))
  const ended = [...testRuns].some((id) => !now.has(id))
  testRuns = now
  if (ended) setTimeout(() => window.ct.tests.results().then((r) => useTests.setState((s) => { const m = new Map(s.results); for (const [k, v] of r) m.set(k, v); return { results: m } })), 300)
})

export const useTests = create<TestsStore>((set, get) => ({
  root: null,
  suites: [],
  results: new Map(),
  loading: false,
  async load(root) {
    if (!listening) {
      listening = true
      // a finished run: its report's results replace those of the same tests
      window.ct.tests.onResults((r) => set((s) => { const m = new Map(s.results); for (const [k, v] of r) m.set(k, v); return { results: m } }))
    }
    set({ root, loading: true })
    const suites = root ? await window.ct.tests.discover(root) : []
    const results = new Map(root ? await window.ct.tests.results() : [])
    if (get().root === root) set({ suites, results, loading: false })
  },
  run(itemId) {
    const f = find(get().suites, itemId)
    if (!f) return
    const label = f.target.kind === 'all' ? f.suite.label : f.target.kind === 'file' ? f.target.file.split(/[\\/]/).pop()! : f.target.path.join(' › ')
    startRun(itemId, label, f.suite.dir, testCommand(f.suite, f.target, f.suite.report))
  },
  stop(itemId) { const id = useRunnables.getState().runOf(itemId); if (id) useRunnables.getState().stop(id) },
  fix(itemId) {
    const f = find(get().suites, itemId)
    const st = useWorkbench.getState()
    if (!f || f.target.kind === 'all' || !st.activeProjectId) return
    // a test, or every failure under a file / describe
    const file = f.target.file, prefix = f.target.kind === 'test' ? testKey(file, f.target.path) : file + '::'
    const failures = [...get().results].filter(([k, r]) => r.status === 'failed' && (k === prefix || k.startsWith(prefix.endsWith('::') ? prefix : prefix + ' > ')))
    if (!failures.length) return
    const rel = file.startsWith(f.suite.dir) ? file.slice(f.suite.dir.length + 1) : file
    const name = (k: string) => k.slice(file.length + 2).split(' > ').join(' › ')
    const one = (k: string, r: TestResult) => `« ${name(k)} » :\n${(r.message ?? '').trim()}`
    const text = failures.length === 1
      ? `Le test « ${name(failures[0][0])} » (${rel}) échoue :\n\n${(failures[0][1].message ?? '').trim()}\n\nTrouve la cause et corrige le code (ou le test s'il est faux), puis relance ce test.`
      : `${failures.length} tests de ${rel} échouent :\n\n${failures.map(([k, r]) => one(k, r)).join('\n\n')}\n\nTrouve les causes et corrige le code (ou les tests s'ils sont faux), puis relance ces tests.`
    // typed in the Claude tab without Enter: the user reads it, adds to it, sends it
    st.insertPrompt(st.activeProjectId, text)
  },
  locate(itemId) {
    for (const s of get().suites) for (const file of s.files) {
      if (fileId(s, file.path) === itemId) return { path: file.path, line: 1 }
      const hit = walk(file.tests, [], (n, p) => nodeId(s, file.path, p) === itemId)
      if (hit) return { path: file.path, line: hit.line }
    }
    return null
  },
  lines(path, text) {
    const s = get().suites.find((x) => x.files.some((f) => f.path === path))
    if (!s) return []
    const out: TestLine[] = []
    const res = get().results
    const go = (nodes: TestNode[], p: string[]) => { for (const n of nodes) { const q = [...p, n.name]; out.push({ line: n.line, label: q.join(' › '), itemId: nodeId(s, path, q), status: n.kind === 'test' ? res.get(testKey(path, q))?.status : undefined }); go(n.children, q) } }
    go(parseTests(text, s.framework), [])
    return out
  },
  runningIds() { return new Set(useRunnables.getState().running().map((r) => r.itemId!).filter((id) => id?.startsWith('t'))) },
}))

function walk(nodes: TestNode[], path: string[], hit: (n: TestNode, p: string[]) => boolean): TestNode | null {
  for (const n of nodes) { const p = [...path, n.name]; if (hit(n, p)) return n; const c = walk(n.children, p, hit); if (c) return c }
  return null
}

/** the suite and run target of an item id */
function find(suites: Suite[], itemId: string): { suite: Suite; target: TestTarget } | null {
  for (const s of suites) {
    if (suiteId(s) === itemId) return { suite: s, target: { kind: 'all' } }
    for (const f of s.files) {
      if (fileId(s, f.path) === itemId) return { suite: s, target: { kind: 'file', file: f.path } }
      let path: string[] | null = null
      walk(f.tests, [], (_n, p) => { if (nodeId(s, f.path, p) === itemId) { path = p; return true } return false })
      if (path) return { suite: s, target: { kind: 'test', file: f.path, path } }
    }
  }
  return null
}
