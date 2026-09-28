import type { ClaudeSettings } from './claude-settings'

/**
 * Keeps the default model of ~/.claude/settings.json while tabs switch model. Claude Code's `/model <alias>` changes
 * the session and also saves the alias as the default for new sessions, possibly much later (a busy session queues
 * the command until its turn ends). The terminal bubble must only change the session: each alias it asks for is
 * remembered, and whenever settings.json shows one of them, the default the user chose is put back. A change made
 * elsewhere (the Claude panel, the settings form, another editor) becomes the default to keep.
 */
export class DefaultModelGuard {
  private kept: { value: string | undefined } | null = null
  private pending = new Map<string, number>()   // alias → when it was asked (ms)
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(private settings: ClaudeSettings, private now = () => Date.now(), private ttlMs = 15 * 60_000, private autoPoll = true) {}

  private read(): any | null { const r = this.settings.read(); return r.ok ? r.data : null }

  /** before typing `/model <alias>` in a tab */
  beforeSwitch(alias: string) {
    const d = this.read()
    if (!d) return
    if (!this.kept) this.kept = { value: typeof d.model === 'string' ? d.model : undefined }
    this.pending.set(alias.toLowerCase(), this.now())
    if (this.autoPoll && !this.timer) this.timer = setInterval(() => this.check(), 400)
  }

  /** the Claude panel's default model: written, and kept from now on */
  setDefault(model: string | null): { ok: boolean; error?: string } {
    const r = this.settings.read()
    if (!r.ok) return { ok: false, error: r.error }
    if (model) r.data.model = model; else delete r.data.model
    try { this.settings.write(r.data) } catch (e) { return { ok: false, error: String(e) } }
    if (this.kept) this.kept = { value: model ?? undefined }
    return { ok: true }
  }

  /** compares settings.json with what must be kept; returns true when it put the default back */
  check(): boolean {
    for (const [a, at] of this.pending) if (this.now() - at > this.ttlMs) this.pending.delete(a)
    if (!this.pending.size) { this.stop(); return false }
    const d = this.read()
    if (!d || !this.kept) return false
    const cur = typeof d.model === 'string' ? d.model : undefined
    if (cur === this.kept.value) return false
    if (cur !== undefined && this.pending.has(cur.toLowerCase())) {
      this.pending.delete(cur.toLowerCase())
      if (this.kept.value === undefined) delete d.model; else d.model = this.kept.value
      try { this.settings.write(d) } catch { return false }
      return true
    }
    // changed by someone else: that is the default now
    this.kept = { value: cur }
    return false
  }

  stop() { if (this.timer) { clearInterval(this.timer); this.timer = null } if (!this.pending.size) this.kept = null }
}
