import { createHash } from 'node:crypto'
import { mkdirSync, readdirSync, readFileSync, statSync, watch, type FSWatcher } from 'node:fs'
import { join, sep } from 'node:path'
import { detectFramework, isTestFile, parseTests, readJsonReport, readJunitReport, type TestNode, type TestResult, type TestSuite } from '@shared/tests'
import { detectRunnables, type RunFs } from '@shared/runnables'

export interface DiscoveredSuite extends TestSuite { report: string; files: { path: string; tests: TestNode[] }[] }

const SKIP = new Set(['node_modules', '.git', 'dist', 'out', 'build', 'coverage', '.venv', 'venv', '__pycache__', 'target', '.next', '.turbo', '.cache'])
const MAX_FILES = 3000

/**
 * The Tests tab's discovery (main side, it reads the files): suites are the project root and its npm workspaces
 * that use Vitest / Jest / pytest; each test file belongs to its deepest suite. Reports are written in the app's
 * data (never in the project), one per suite, watched: a finished run gives the results to the renderer.
 */
export class TestsService {
  private watcher?: FSWatcher
  private suites: DiscoveredSuite[] = []
  constructor(private base: string, private fs: RunFs, private emit: (results: [string, TestResult][]) => void) {}

  discover(root: string): DiscoveredSuite[] {
    const dirs = [root, ...detectRunnables(this.fs, root).filter((g) => g.id.startsWith('npm:')).map((g) => g.id.slice(4)).filter((d) => d !== root)]
    const suites: DiscoveredSuite[] = []
    const reports = join(this.base, 'tests', hash(root))
    mkdirSync(reports, { recursive: true })
    for (const dir of dirs) {
      const names = this.fs.list(dir).map((e) => e.name)
      const pkg = names.includes('package.json') ? safeRead(join(dir, 'package.json')) : null
      const py = names.includes('pyproject.toml') ? safeRead(join(dir, 'pyproject.toml')) : null
      for (const framework of detectFramework(names, pkg, py)) {
        const manager = framework === 'pytest' ? null : managerOf(this.fs, dir, root)
        const label = (dir === root ? root.split(/[\\/]/).pop() : dir.split(/[\\/]/).pop()) ?? dir
        suites.push({ framework, dir, label, manager, report: join(reports, `${framework}-${hash(dir)}.${framework === 'pytest' ? 'xml' : 'json'}`), files: [] })
      }
    }
    // each test file goes to its deepest suite of a matching framework
    for (const path of this.walk(root)) {
      const owner = suites.filter((s) => isTestFile(path, s.framework) && (path.startsWith(s.dir + sep) || path.startsWith(s.dir + '/'))).sort((a, b) => b.dir.length - a.dir.length)[0]
      if (!owner) continue
      const text = safeRead(path)
      if (text !== null) owner.files.push({ path, tests: parseTests(text, owner.framework) })
    }
    for (const s of suites) s.files.sort((a, b) => a.path.localeCompare(b.path))
    this.suites = suites
    this.watch(reports)
    return suites
  }

  /** results of the last reports on disk (runs made before, possibly in an earlier session) */
  results(): [string, TestResult][] { return this.suites.flatMap((s) => [...this.read(s)]) }

  private read(s: DiscoveredSuite): Map<string, TestResult> {
    const text = safeRead(s.report)
    if (text === null) return new Map()
    return s.framework === 'pytest' ? readJunitReport(text, s.dir) : readJsonReport(text)
  }

  private watch(dir: string) {
    this.watcher?.close()
    const timers = new Map<string, ReturnType<typeof setTimeout>>()
    try {
      this.watcher = watch(dir, (_e, name) => {
        const s = this.suites.find((x) => x.report.endsWith(String(name)))
        if (!s) return
        clearTimeout(timers.get(s.report))
        timers.set(s.report, setTimeout(() => this.emit([...this.read(s)]), 200))
      })
    } catch { /* results read on demand */ }
  }

  private walk(root: string): string[] {
    const out: string[] = []
    const go = (dir: string, depth: number) => {
      if (depth > 10 || out.length >= MAX_FILES) return
      let entries
      try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return }
      for (const e of entries) {
        if (e.name.startsWith('.') && e.name !== '.') continue
        const p = join(dir, e.name)
        if (e.isDirectory()) { if (!SKIP.has(e.name)) go(p, depth + 1) }
        else if (e.isFile() && /\.(test|spec)\.[cm]?[jt]sx?$|(^|[\\/])(test_[^\\/]*|[^\\/]*_test)\.py$/.test(e.name)) out.push(p)
      }
    }
    go(root, 0)
    return out
  }

  dispose() { this.watcher?.close() }
}

function managerOf(fs: RunFs, dir: string, root: string): TestSuite['manager'] {
  for (const d of [dir, root]) {
    if (fs.exists(join(d, 'pnpm-lock.yaml'))) return 'pnpm'
    if (fs.exists(join(d, 'yarn.lock'))) return 'yarn'
    if (fs.exists(join(d, 'bun.lockb')) || fs.exists(join(d, 'bun.lock'))) return 'bun'
  }
  return 'npm'
}
const hash = (s: string) => createHash('sha1').update(s).digest('hex').slice(0, 12)
function safeRead(p: string): string | null { try { return statSync(p).size > 2_000_000 ? null : readFileSync(p, 'utf8') } catch { return null } }
