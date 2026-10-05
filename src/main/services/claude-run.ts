import { spawn } from 'node:child_process'
import type { Invocation } from './claude-bin'
import { printArgs, parsePrintOutput, type RunResult } from '@shared/claude-run'

/**
 * Runs isolated `claude -p` (shared/claude-run). The input goes on stdin: a session's digest is longer than a Windows
 * command line. One run at a time per key (a second click waits for the first), in a neutral folder so that no
 * project's CLAUDE.md is read; Claude Code's own variables are left out, as for every claude the app starts.
 */
export class ClaudeRunner {
  private busy = new Map<string, Promise<RunResult>>()
  constructor(private command: (args: string[]) => Invocation | null, private env: () => NodeJS.ProcessEnv, private cwd: string, private timeoutMs = 180_000) {}

  run(input: string, o: { instructions: string; model?: string; key?: string }): Promise<RunResult> {
    const running = o.key ? this.busy.get(o.key) : undefined
    if (running) return running
    const p = this.start(input, o).finally(() => { if (o.key) this.busy.delete(o.key) })
    if (o.key) this.busy.set(o.key, p)
    return p
  }

  private start(input: string, o: { instructions: string; model?: string }): Promise<RunResult> {
    const inv = this.command(printArgs(o.instructions, o.model))
    if (!inv) return Promise.reject(new Error('claude introuvable dans le PATH'))
    const env: NodeJS.ProcessEnv = { ...this.env(), ...inv.env }
    for (const k of Object.keys(env)) if (k.startsWith('CLAUDE_CODE_') || k === 'CLAUDECODE' || k === 'CLAUDETERM_TAB') delete env[k]
    return new Promise((resolve, reject) => {
      const child = spawn(inv.file, inv.args, { cwd: this.cwd, env, windowsHide: true, windowsVerbatimArguments: inv.verbatim, stdio: ['pipe', 'pipe', 'pipe'] })
      const out: Buffer[] = [], err: Buffer[] = []
      child.stdout.on('data', (c: Buffer) => out.push(c))
      child.stderr.on('data', (c: Buffer) => err.push(c))
      const timer = setTimeout(() => child.kill(), this.timeoutMs)
      child.on('error', (e) => { clearTimeout(timer); reject(e) })
      child.on('close', (code) => {
        clearTimeout(timer)
        const stdout = Buffer.concat(out).toString('utf8')
        if (code !== 0 && !stdout.trim()) return reject(new Error(Buffer.concat(err).toString('utf8').trim() || `claude -p s'est arrêté (code ${code})`))
        try { resolve(parsePrintOutput(stdout)) } catch (e) { reject(e) }
      })
      child.stdin.on('error', () => { /* claude gone before reading */ })
      child.stdin.end(input, 'utf8')
    })
  }
}
