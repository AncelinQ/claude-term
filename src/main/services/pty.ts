import * as pty from 'node-pty'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import type { PtyCreate, Settings } from '@shared/ipc'
import { ShellIntegration } from './shell-integration'

export interface PtyHandle {
  id: string
  proc: pty.IPty
}

/** Spawns shells and `claude` in pseudo-terminals. */
export class PtyService {
  private handles = new Map<string, PtyHandle>()
  private seq = 0
  /** PATH from the user's login shell: apps launched from Finder/Dock get a minimal one. */
  private loginPath: string | undefined

  private integration = new ShellIntegration()

  constructor(private getSettings: () => Settings, private onData: (id: string, data: string) => void, private onExit: (id: string, code: number) => void) {
    if (process.platform !== 'win32') this.loginPath = loginShellPath()
  }

  private env(): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor', TERM_PROGRAM: 'ClaudeTerm', LANG: process.env.LANG || 'en_US.UTF-8' }
    if (this.loginPath) env.PATH = this.loginPath
    // inherited CLAUDE_CODE_* vars disable transcript saving in nested sessions
    for (const k of Object.keys(env)) if (k.startsWith('CLAUDE_CODE_') || k === 'CLAUDECODE') delete env[k]
    return env
  }

  private shell(): { file: string; args: string[]; env: Record<string, string> } {
    if (process.platform === 'win32') return { file: 'powershell.exe', args: ['-NoLogo'], env: {} }
    return this.integration.shell(process.env.SHELL || '/bin/zsh')
  }

  /** Where `claude` is (PATH from the login shell, then the usual npm/bun locations). */
  claudeBinary(): string | null {
    const env = this.env()
    const names = process.platform === 'win32' ? ['claude.cmd', 'claude.exe', 'claude'] : ['claude']
    for (const dir of (env.PATH || '').split(delimiter)) {
      for (const n of names) if (dir && existsSync(join(dir, n))) return join(dir, n)
    }
    const home = process.env.HOME || process.env.USERPROFILE || ''
    for (const p of [join(home, '.claude', 'local', 'claude'), join(home, '.bun', 'bin', 'claude'), '/opt/homebrew/bin/claude', '/usr/local/bin/claude']) {
      if (existsSync(p)) return p
    }
    return null
  }

  create(opts: PtyCreate): { id: string; error?: string } {
    const id = 'pty' + ++this.seq
    const env = this.env()
    if (opts.projectRoot) env.CLAUDETERM_ROOT = opts.projectRoot
    let file: string, args: string[]
    const settings = this.getSettings()
    if (opts.kind === 'claude') {
      if (process.platform === 'win32' && settings.windowsMode === 'wsl') {
        file = 'wsl.exe'
        args = [...(settings.wslDistro ? ['-d', settings.wslDistro] : []), '--cd', opts.cwd, '--', 'claude', ...(opts.resume ? ['--resume', opts.resume] : [])]
      } else {
        const bin = this.claudeBinary()
        if (!bin) return { id, error: 'claude introuvable dans le PATH (installe Claude Code : npm i -g @anthropic-ai/claude-code)' }
        file = bin
        args = opts.resume ? ['--resume', opts.resume] : []
      }
    } else {
      const sh = this.shell()
      ;({ file, args } = sh)
      Object.assign(env, sh.env)
      if (process.platform === 'win32' && settings.windowsMode === 'wsl') {
        file = 'wsl.exe'; args = [...(settings.wslDistro ? ['-d', settings.wslDistro] : []), '--cd', opts.cwd]
      }
    }
    try {
      const proc = pty.spawn(file, args, { name: 'xterm-256color', cols: 120, rows: 30, cwd: opts.cwd, env: env as Record<string, string> })
      proc.onData((d) => this.onData(id, d))
      proc.onExit(({ exitCode }) => { this.handles.delete(id); this.onExit(id, exitCode) })
      this.handles.set(id, { id, proc })
      return { id }
    } catch (e) {
      return { id, error: String(e) }
    }
  }

  write(id: string, data: string) { this.handles.get(id)?.proc.write(data) }
  resize(id: string, cols: number, rows: number) {
    if (cols > 0 && rows > 0) this.handles.get(id)?.proc.resize(cols, rows)
  }
  kill(id: string) { this.handles.get(id)?.proc.kill(); this.handles.delete(id) }
  killAll() { for (const h of this.handles.values()) h.proc.kill(); this.handles.clear() }
}

function loginShellPath(): string | undefined {
  try {
    const shell = process.env.SHELL || '/bin/zsh'
    // -i so ~/.zshrc runs too (PATH is often set there, not in .zprofile)
    const out = execFileSync(shell, ['-ilc', 'echo -n "__PATH__$PATH"'], { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] })
    const m = out.match(/__PATH__(.*)$/s)
    return m?.[1]?.trim() || undefined
  } catch { return undefined }
}
