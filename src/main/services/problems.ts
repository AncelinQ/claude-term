import { execFile } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { parseEslintJson, parseTscOutput, scanTodos, type Diagnostic, type Todo } from '@shared/problems'
import { detectRunnables, type RunFs } from '@shared/runnables'
import { cmdQuote } from './claude-bin'

export interface CheckResult { at: number; diagnostics: Diagnostic[]; tools: { tool: 'tsc' | 'eslint'; dir: string; config?: string; ok: boolean; error?: string }[] }

const SKIP = new Set(['node_modules', '.git', 'dist', 'out', 'build', 'coverage', '.venv', 'venv', '__pycache__', 'target', '.next', '.turbo', '.cache', 'vendor'])
const TEXT = /\.(ts|tsx|js|jsx|mjs|cjs|py|rb|go|rs|java|kt|swift|c|h|cpp|cs|php|vue|svelte|css|scss|html|md|markdown|txt|sh|yml|yaml|toml|sql)$/i
const ESLINT_CONFIG = /^(eslint\.config\.(js|mjs|cjs|ts|mts|cts)|\.eslintrc(\.(js|cjs|json|yml|yaml))?)$/

/**
 * Errors and TODO of the center bottom block (main side). Errors: the project's own tsc (`--noEmit` for each
 * tsconfig that compiles something) and ESLint (when configured), found in node_modules/.bin from the package up to
 * the root, run in the background with the login shell's PATH, one check at a time (see check). TODO: a walk of the project's text files.
 */
export class ProblemsService {
  private chain: Promise<unknown> = Promise.resolve()
  private queued = new Map<string, Promise<CheckResult>>()

  constructor(private fs: RunFs, private env: () => NodeJS.ProcessEnv) {}

  /**
   * One check at a time: a request waits for the running one, then gets a check of its own root (never another
   * project's result); requests for a root already waiting share it.
   */
  check(root: string): Promise<CheckResult> {
    const waiting = this.queued.get(root)
    if (waiting) return waiting
    const p = this.chain.then(() => { this.queued.delete(root); return this.run(root) })
    this.queued.set(root, p)
    this.chain = p.catch(() => undefined)
    return p
  }

  private async run(root: string): Promise<CheckResult> {
    const dirs = [root, ...detectRunnables(this.fs, root).filter((g) => g.id.startsWith('npm:')).map((g) => g.id.slice(4)).filter((d) => d !== root)]
    const diagnostics: Diagnostic[] = []
    const tools: CheckResult['tools'] = []
    for (const dir of dirs) {
      const names = this.fs.list(dir).map((e) => e.name)
      const tsc = localBin('tsc', dir, root)
      if (tsc) for (const cfg of names.filter((n) => /^tsconfig(\.[\w-]+)?\.json$/.test(n) && compiles(join(dir, n)))) {
        const r = await this.exec(tsc, ['--noEmit', '-p', cfg, '--pretty', 'false'], dir)
        const found = parseTscOutput(r.stdout, dir)
        diagnostics.push(...found)
        tools.push({ tool: 'tsc', dir, config: cfg, ok: r.code === 0 || found.length > 0, ...(r.code !== 0 && !found.length ? { error: firstLine(r.stderr || r.stdout) } : {}) })
      }
      const eslint = names.some((n) => ESLINT_CONFIG.test(n)) ? localBin('eslint', dir, root) : null
      if (eslint) {
        const r = await this.exec(eslint, ['.', '-f', 'json', '--no-error-on-unmatched-pattern'], dir)
        const found = parseEslintJson(r.stdout)
        diagnostics.push(...found)
        tools.push({ tool: 'eslint', dir, ok: r.code === 0 || r.code === 1, ...(r.code > 1 ? { error: firstLine(r.stderr) } : {}) })
      }
    }
    return { at: Date.now(), diagnostics: dedupe(diagnostics), tools }
  }

  private exec(file: string, args: string[], cwd: string): Promise<{ code: number; stdout: string; stderr: string }> {
    // a Windows npm shim (.cmd) goes through cmd.exe, quoted like claude's (claude-bin.ts)
    const cmd = /\.cmd$/i.test(file) ? { file: process.env.ComSpec || 'cmd.exe', args: ['/d', '/s', '/c', `"${[file, ...args].map(cmdQuote).join(' ')}"`], verbatim: true } : { file, args, verbatim: false }
    return new Promise((res) => execFile(cmd.file, cmd.args, { cwd, env: this.env(), timeout: 180_000, maxBuffer: 50_000_000, windowsVerbatimArguments: cmd.verbatim }, (err, stdout, stderr) =>
      res({ code: err ? (typeof (err as any).code === 'number' ? (err as any).code : 1) : 0, stdout: String(stdout), stderr: String(stderr) })))
  }

  todos(root: string, limit = 2000): Todo[] {
    const out: Todo[] = []
    const go = (dir: string, depth: number) => {
      if (depth > 12 || out.length >= limit) return
      let entries
      try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return }
      for (const e of entries) {
        if (out.length >= limit) return
        if (e.name.startsWith('.')) continue
        const p = join(dir, e.name)
        if (e.isDirectory()) { if (!SKIP.has(e.name)) go(p, depth + 1); continue }
        if (!e.isFile() || !TEXT.test(e.name) || /\.lock$|-lock\.|\.min\./.test(e.name)) continue
        try { if (statSync(p).size > 1_000_000) continue; out.push(...scanTodos(readFileSync(p, 'utf8'), p)) } catch { /* unreadable */ }
      }
    }
    go(root, 0)
    return out.slice(0, limit)
  }
}

/** node_modules/.bin/<name> from `dir` up to `root` (Windows: .cmd) */
function localBin(name: string, dir: string, root: string): string | null {
  for (let d = dir; ; d = dirname(d)) {
    for (const f of process.platform === 'win32' ? [name + '.cmd', name] : [name]) { const p = join(d, 'node_modules', '.bin', f); if (existsSync(p)) return p }
    if (d === root || dirname(d) === d || !d.startsWith(root)) return null
  }
}

/** a tsconfig with `"files": []` and no include only references others (solution file): nothing to check itself */
function compiles(path: string): boolean {
  try {
    const text = readFileSync(path, 'utf8')
    return !(/"files"\s*:\s*\[\s*\]/.test(text) && !/"include"\s*:/.test(text))
  } catch { return false }
}
const firstLine = (s: string) => s.split('\n').map((l) => l.trim()).find(Boolean)?.slice(0, 200) ?? 'échec'
const dedupe = (d: Diagnostic[]) => { const seen = new Set<string>(); return d.filter((x) => { const k = `${x.file}:${x.line}:${x.col}:${x.message}`; if (seen.has(k)) return false; seen.add(k); return true }) }
