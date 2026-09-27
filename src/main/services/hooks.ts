import { app, Notification, BrowserWindow } from 'electron'
import { watch, type FSWatcher, mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync, chmodSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import type { Attention } from '@shared/ipc'
import { ClaudeSettings } from './claude-settings'
import type { SessionTracker } from './session-tracker'

/**
 * Claude Code hooks (Notification, Stop) spool JSON events into `userData/events` through a small
 * script; this hub drains them, routes each to a tab, keeps the per-tab attention state, fires
 * OS notifications and the dock badge.
 */
export class HookHub {
  readonly dir: string
  readonly script: string
  static readonly events = ['Notification', 'Stop']
  private watcher?: FSWatcher
  private attention = new Map<string, Attention>()
  private draining = false

  constructor(
    private claudeSettings: ClaudeSettings,
    private trackers: () => Map<string, SessionTracker>,
    private send: (channel: string, payload: unknown) => void,
    private isVisible: (tabId: string) => boolean,
    private getSettings: () => { notifyOS: boolean; dockBadge: boolean },
    private focusTab: (tabId: string) => void,
    base = app.getPath('userData'),
  ) {
    this.dir = join(base, 'events')
    this.script = join(base, process.platform === 'win32' ? 'hook.cmd' : 'hook.sh')
    mkdirSync(this.dir, { recursive: true })
    this.installScript()
    try { this.watcher = watch(this.dir, () => this.drain()) } catch { setInterval(() => this.drain(), 2000) }
    this.drain()
  }

  // MARK: script + settings.json entries

  installScript() {
    const body = process.platform === 'win32'
      ? `@echo off\r\nrem ClaudeTerm hook: spools the Claude Code event (JSON on stdin) for the app.\r\nif not exist "${this.dir}" mkdir "${this.dir}"\r\nmore > "${this.dir}\\%RANDOM%%RANDOM%.json"\r\nexit /b 0\r\n`
      : `#!/bin/sh\n# ClaudeTerm hook: spools the Claude Code event (JSON on stdin) for the app.\nd=${shellQuote(this.dir)}\nmkdir -p "$d"\ncat > "$d/$(date +%s)-$$-$RANDOM.json"\nexit 0\n`
    if (!existsSync(this.script) || readFileSync(this.script, 'utf8') !== body) writeFileSync(this.script, body)
    if (process.platform !== 'win32') chmodSync(this.script, 0o755)
  }

  /** Claude Code runs hook commands through a shell: the path (which may contain spaces) is quoted. */
  get command(): string { return process.platform === 'win32' ? `"${this.script}"` : shellQuote(this.script) }
  private isOurs = (c: string) => c === this.command || c === this.script || c === `"${this.script}"`

  installed(): boolean {
    const r = this.claudeSettings.read()
    if (!r.ok) return false
    return HookHub.events.every((ev) => this.claudeSettings.hasHook(r.data, ev, this.command))
  }

  setInstalled(on: boolean): { ok: boolean; error?: string } {
    this.installScript()
    const r = this.claudeSettings.read()
    if (!r.ok) return { ok: false, error: r.error }
    for (const ev of HookHub.events) this.claudeSettings.setHook(r.data, ev, this.command, on, this.isOurs)
    try { this.claudeSettings.write(r.data); return { ok: true } } catch (e) { return { ok: false, error: String(e) } }
  }

  // MARK: events

  private drain() {
    if (this.draining) return
    this.draining = true
    try {
      let names: string[]
      try { names = readdirSync(this.dir).filter((n) => n.endsWith('.json')).sort() } catch { return }
      for (const n of names) {
        const p = join(this.dir, n)
        try { this.handle(JSON.parse(readFileSync(p, 'utf8'))) } catch { /* partial or invalid */ }
        try { unlinkSync(p) } catch { /* already gone */ }
      }
    } finally { this.draining = false }
  }

  private handle(o: any) {
    const event = String(o.hook_event_name ?? '')
    const transcript = typeof o.transcript_path === 'string' ? o.transcript_path : null
    const cwd = typeof o.cwd === 'string' ? o.cwd : null
    const message = String(o.message ?? '')
    const type = String(o.notification_type ?? '')
    let attention: Attention
    if (event === 'Stop') attention = { kind: 'done', message: '' }
    else if (event === 'Notification') {
      if (type === 'permission_prompt' || /permission/i.test(message)) attention = { kind: 'permission', message }
      else if (type === 'idle_prompt' || /waiting/i.test(message)) attention = { kind: 'idle', message }
      else return   // auth_success and friends
    } else return

    // route: transcript path first, then cwd
    const all = [...this.trackers().values()]
    const t = all.find((x) => x.transcriptPath === transcript)
      ?? all.find((x) => cwd && x.cwd === cwd && !x.transcriptPath)
      ?? all.find((x) => cwd && x.cwd === cwd)
    if (!t) return
    if (!t.transcriptPath && transcript) t.attachTranscript(transcript)

    const visible = this.isVisible(t.tabId) && (BrowserWindow.getAllWindows()[0]?.isFocused() ?? false)
    if (visible && attention.kind === 'done') return
    this.set(t.tabId, attention)
    if (!visible && this.getSettings().notifyOS) this.notify(t, attention)
  }

  set(tabId: string, a: Attention | null) {
    if (a) this.attention.set(tabId, a); else this.attention.delete(tabId)
    this.send('claude:attention', { tabId, attention: a })
    this.refreshBadge()
  }
  clear(tabId: string) { if (this.attention.has(tabId)) this.set(tabId, null) }
  get(tabId: string) { return this.attention.get(tabId) ?? null }

  private refreshBadge() {
    if (process.platform !== 'darwin' || !app.dock) return
    const n = this.getSettings().dockBadge ? this.attention.size : 0
    app.dock.setBadge(n ? String(n) : '')
  }

  private notify(t: SessionTracker, a: Attention) {
    if (!Notification.isSupported()) return
    const title = t.state.title ?? t.cwd.split(/[\\/]/).pop() ?? 'Claude'
    const body = a.kind === 'permission' && a.message ? a.message : label(a)
    const n = new Notification({ title, body, silent: a.kind === 'done' })
    n.on('click', () => { const w = BrowserWindow.getAllWindows()[0]; w?.show(); w?.focus(); this.focusTab(t.tabId) })
    n.show()
  }
}

export function label(a: Attention): string {
  switch (a.kind) {
    case 'permission': return 'Permission en attente'
    case 'idle': return 'Claude attend une réponse'
    case 'done': return 'Claude a terminé'
  }
}

function shellQuote(s: string) { return "'" + s.replace(/'/g, "'\\''") + "'" }
