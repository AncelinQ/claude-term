import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, watch, writeFileSync, type FSWatcher } from 'node:fs'
import { join } from 'node:path'
import { mergeLimits, parseApiUsage, parseStatus, type UsageLimit, type UsageSnapshot } from '@shared/usage'
import type { ClaudeSettings } from './claude-settings'

export type { UsageState } from '@shared/ipc'
import type { UsageState } from '@shared/ipc'

/**
 * Subscription usage through Claude Code's status line (the documented way: Claude Code pipes the session state,
 * rate limits included, to the command at each refresh). Our command only spools that JSON into
 * `userData/usage/status.json` (written aside then renamed); this service reads it. The status line prints
 * nothing, so Claude Code's own display is unchanged.
 */
/** Claude Code's claude.ai login (Keychain on macOS, ~/.claude/.credentials.json elsewhere) */
export interface Credentials { accessToken: string; expiresAt?: number; subscriptionType?: string; rateLimitTier?: string }
export interface UsageDeps {
  credentials(): Promise<Credentials | null>
  /** GET returning parsed JSON; throws with the HTTP status */
  getJson(url: string, headers: Record<string, string>): Promise<unknown>
}
export const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage'

export class UsageService {
  readonly dir: string
  readonly script: string
  private watcher?: FSWatcher
  private last: UsageSnapshot | null = null
  private apiState: { at?: number; attemptAt?: number; error?: string; busy?: boolean; limits?: UsageLimit[]; plan?: { subscription?: string; tier?: string } }

  constructor(base: string, private settings: ClaudeSettings, private emit: (s: UsageState) => void, private platform = process.platform, private deps?: UsageDeps) {
    this.dir = join(base, 'usage')
    this.script = join(base, platform === 'win32' ? 'statusline.cmd' : 'statusline.sh')
    this.apiState = readJson(this.apiFile) ?? {}
    delete this.apiState.busy
  }

  get apiFile() { return join(this.dir, 'api.json') }

  /**
   * Asks the usage API of `/usage` (undocumented: on demand only, never in a loop). The token is Claude Code's, read
   * where it keeps it, never refreshed nor stored here: when it has expired, a Claude session renews it.
   */
  async refresh(): Promise<UsageState> {
    if (!this.deps || this.apiState.busy) return this.state()
    this.apiState = { ...this.apiState, busy: true, attemptAt: Date.now() }
    this.emit(this.state())
    try {
      const c = await this.deps.credentials()
      if (!c?.accessToken) throw new Error('aucune connexion claude.ai dans les identifiants de Claude Code')
      if (c.expiresAt && c.expiresAt < Date.now()) throw new Error('jeton de Claude Code expiré : il sera renouvelé à la prochaine session Claude')
      const body = await this.deps.getJson(USAGE_URL, { Authorization: `Bearer ${c.accessToken}`, 'anthropic-beta': 'oauth-2025-04-20' })
      const at = Date.now()
      const limits = parseApiUsage(body, at)
      if (!limits.length) throw new Error("réponse de l'API d'usage inattendue")
      this.apiState = { at, attemptAt: this.apiState.attemptAt, limits, plan: { subscription: c.subscriptionType, tier: c.rateLimitTier } }
    } catch (e) {
      this.apiState = { ...this.apiState, busy: false, error: String((e as Error)?.message ?? e) }
    }
    delete this.apiState.busy
    try { mkdirSync(this.dir, { recursive: true }); writeFileSync(this.apiFile, JSON.stringify(this.apiState)) } catch { /* shown anyway */ }
    const s = this.state()
    this.emit(s)
    return s
  }

  get statusFile() { return join(this.dir, 'status.json') }
  get command(): string { return this.platform === 'win32' ? `"${this.script}"` : `'${this.script.replace(/'/g, `'\\''`)}'` }
  private isOurs = (c: unknown) => typeof c === 'string' && (c === this.command || c.includes(this.script))

  installScript() {
    mkdirSync(this.dir, { recursive: true })
    const body = statusLineScript(this.dir, this.platform)
    if (!existsSync(this.script) || readFileSync(this.script, 'utf8') !== body) writeFileSync(this.script, body)
    if (this.platform !== 'win32') chmodSync(this.script, 0o755)
  }

  state(): UsageState {
    const r = this.settings.read()
    const cmd = r.ok ? r.data?.statusLine?.command : undefined
    const installed = this.isOurs(cmd)
    const line = this.read()
    const limits = mergeLimits(line?.limits, this.apiState.limits)
    const at = Math.max(line?.at ?? 0, ...limits.map((l) => l.at ?? 0))
    const snapshot = line || limits.length ? { ...(line ?? {}), at, limits } : null
    const { at: apiAt, attemptAt, error, busy, plan } = this.apiState
    return { installed, ...(cmd && !installed ? { foreign: String(cmd) } : {}), snapshot, ...(plan ? { plan } : {}), api: { at: apiAt, attemptAt, error, busy } }
  }

  /** Declares (or removes) our status line; a foreign one is never replaced nor removed. */
  setInstalled(on: boolean): { ok: boolean; error?: string } {
    const r = this.settings.read()
    if (!r.ok) return { ok: false, error: r.error }
    const cur = r.data.statusLine
    if (cur?.command && !this.isOurs(cur.command)) return { ok: false, error: `une ligne de statut est déjà configurée : ${cur.command}` }
    if (on) { this.installScript(); r.data.statusLine = { type: 'command', command: this.command, padding: 0 } }
    else if (cur) delete r.data.statusLine
    try { this.settings.write(r.data) } catch (e) { return { ok: false, error: String(e) } }
    this.emit(this.state())
    return { ok: true }
  }

  read(): UsageSnapshot | null {
    try {
      const at = statSync(this.statusFile).mtimeMs
      if (this.last && this.last.at === at) return this.last
      this.last = parseStatus(JSON.parse(readFileSync(this.statusFile, 'utf8')), at, this.last)
    } catch { /* not written yet, or being replaced */ }
    return this.last
  }

  start() {
    mkdirSync(this.dir, { recursive: true })
    if (this.state().installed) this.installScript()   // an app update may have changed the script
    let timer: ReturnType<typeof setTimeout> | undefined
    try { this.watcher = watch(this.dir, (_e, name) => { if (name && !String(name).startsWith('status.json')) return; clearTimeout(timer); timer = setTimeout(() => this.emit(this.state()), 150) }) } catch { /* no watch: read on demand */ }
  }
  dispose() { this.watcher?.close() }
}

/** The status line command: copies stdin (the session state JSON) to <dir>/status.json, atomically; prints nothing. */
export function statusLineScript(dir: string, platform: string): string {
  if (platform === 'win32') return `@echo off\r\nrem ClaudeTerm status line: records the session state (JSON on stdin) for the app. Generated, overwritten on update.\r\nif not exist "${dir}" mkdir "${dir}"\r\nmore > "${dir}\\status.json.tmp"\r\nmove /y "${dir}\\status.json.tmp" "${dir}\\status.json" >nul\r\nexit /b 0\r\n`
  const q = `'${dir.replace(/'/g, `'\\''`)}'`
  return `#!/bin/sh\n# ClaudeTerm status line: records the session state (JSON on stdin) for the app. Generated, overwritten on update.\nd=${q}\nmkdir -p "$d"\nf="$d/status.json"\ncat > "$f.$$.tmp" && mv "$f.$$.tmp" "$f"\nexit 0\n`
}

function readJson(file: string): any { try { return JSON.parse(readFileSync(file, 'utf8')) } catch { return null } }
