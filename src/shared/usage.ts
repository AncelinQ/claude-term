/**
 * Subscription usage as Claude Code hands it to the status line command (JSON on stdin at each refresh): rate
 * limits (5 h session, week, week of a model, extra credit) and the state of the session. Pure, tested.
 */
export interface UsageLimit {
  /** normalized kind: session (5 h), weekly_all, weekly:<model>, spend, or an unknown key as is */
  key: string
  label: string
  percent: number
  /** ISO date of the reset */
  resetsAt?: string
  /** when this value was read (ms) and by which source */
  at?: number
  source?: 'statusline' | 'api'
}
export interface UsageSnapshot {
  /** when the status line last wrote it (ms) */
  at: number
  limits: UsageLimit[]
  session?: { id?: string; model?: string; cwd?: string; contextPercent?: number }
}

const LABELS: Record<string, string> = { session: 'Session (5 h)', weekly_all: 'Semaine', spend: 'Crédit supplémentaire' }
const ORDER = ['session', 'weekly_all', 'weekly:', 'spend']

/** rate_limits keys of the status line / legacy API fields → normalized kinds */
export function normalizeKey(key: string): string {
  if (key === 'five_hour' || key === 'session') return 'session'
  if (key === 'seven_day' || key === 'weekly_all') return 'weekly_all'
  if (key === 'spend_limit' || key === 'extra_usage' || key === 'spend') return 'spend'
  const m = /^seven_day_(\w+)$/.exec(key)
  if (m) return 'weekly:' + m[1][0].toUpperCase() + m[1].slice(1)
  return key
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined)
const obj = (v: unknown): Record<string, any> | undefined => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, any>) : undefined)

/** Label of a limit (raw or normalized key): "seven_day_fable" / "weekly:Fable" → "Semaine · Fable". */
export function limitLabel(key: string): string {
  const k = normalizeKey(key)
  if (LABELS[k]) return LABELS[k]
  if (k.startsWith('weekly:')) return 'Semaine · ' + k.slice(7)
  return k.replace(/_/g, ' ')
}

/** resets_at: epoch seconds (status line) or an ISO string */
function resetDate(v: unknown): string | undefined {
  const n = num(v)
  if (n !== undefined) return new Date(n > 1e12 ? n : n * 1000).toISOString()
  const s = str(v)
  return s && !Number.isNaN(Date.parse(s)) ? new Date(s).toISOString() : undefined
}

/**
 * Reads what the status line received. Limits only come after the first API response of a session: `previous`
 * keeps the last known ones when this input carries none.
 */
export function parseStatus(raw: unknown, at: number, previous?: UsageSnapshot | null): UsageSnapshot {
  const d = obj(raw) ?? {}
  const rl = obj(d.rate_limits)
  const limits: UsageLimit[] = []
  for (const [key, v] of Object.entries(rl ?? {})) {
    const e = obj(v)
    const percent = num(e?.used_percentage) ?? num(e?.utilization) ?? num(e?.percent)
    if (percent === undefined) continue
    limits.push({ key: normalizeKey(key), label: limitLabel(key), percent: clamp(percent), resetsAt: resetDate(e?.resets_at), at, source: 'statusline' })
  }
  sortLimits(limits)
  const model = obj(d.model)
  const session = {
    id: str(d.session_id),
    model: str(model?.display_name) ?? str(model?.id),
    cwd: str(obj(d.workspace)?.current_dir) ?? str(d.cwd),
    contextPercent: num(obj(d.context_window)?.used_percentage),
  }
  const hasSession = Object.values(session).some((x) => x !== undefined)
  return { at, limits: limits.length || !previous ? limits : previous.limits, ...(hasSession ? { session } : previous?.session ? { session: previous.session } : {}) }
}
const clamp = (p: number) => Math.max(0, Math.min(100, p))
const rank = (k: string) => { const i = ORDER.findIndex((o) => (o.endsWith(':') ? k.startsWith(o) : k === o)); return i < 0 ? ORDER.length : i }
const sortLimits = (l: UsageLimit[]) => l.sort((a, b) => rank(a.key) - rank(b.key) || a.key.localeCompare(b.key))

/**
 * The usage API of `/usage` (undocumented): its `limits` list when present ({ kind, percent, resets_at,
 * scope.model.display_name }), else the legacy fields (five_hour, seven_day, seven_day_<model>: utilization,
 * resets_at). Unknown shapes give no limit rather than wrong ones.
 */
export function parseApiUsage(body: unknown, at: number): UsageLimit[] {
  const d = obj(body) ?? {}
  const out: UsageLimit[] = []
  if (Array.isArray(d.limits)) {
    for (const it of d.limits) {
      const e = obj(it), kind = str(e?.kind), percent = num(e?.percent) ?? num(e?.utilization) ?? num(e?.used_percentage)
      if (!kind || percent === undefined) continue
      const model = str(obj(obj(e?.scope)?.model)?.display_name) ?? str(obj(e?.scope)?.model)
      const key = kind === 'weekly_scoped' && model ? 'weekly:' + model : normalizeKey(kind)
      out.push({ key, label: limitLabel(key), percent: clamp(percent), resetsAt: resetDate(e?.resets_at), at, source: 'api' })
    }
  } else {
    for (const [k, v] of Object.entries(d)) {
      const e = obj(v), percent = num(e?.utilization) ?? num(e?.used_percentage) ?? num(e?.percent)
      if (percent === undefined || !(k === 'five_hour' || k.startsWith('seven_day') || k === 'extra_usage' || k === 'spend_limit')) continue
      if ((k === 'extra_usage' || k === 'spend_limit') && e?.is_enabled === false) continue   // disabled credit: its percent means nothing
      out.push({ key: normalizeKey(k), label: limitLabel(k), percent: clamp(percent), resetsAt: resetDate(e?.resets_at), at, source: 'api' })
    }
  }
  return sortLimits(out)
}

/** Per limit, the most recent reading of the two sources (the API knows the per-model weeks, the status line does not). */
export function mergeLimits(...lists: (UsageLimit[] | undefined)[]): UsageLimit[] {
  const by = new Map<string, UsageLimit>()
  for (const l of lists.flatMap((x) => x ?? [])) { const cur = by.get(l.key); if (!cur || (l.at ?? 0) >= (cur.at ?? 0)) by.set(l.key, l) }
  return sortLimits([...by.values()])
}

/** Gauge level; the text goes with the colour (the colour is never alone). */
export function level(percent: number): { tone: 'ok' | 'warn' | 'error'; text: string } {
  if (percent >= 90) return { tone: 'error', text: 'presque atteinte' }
  if (percent >= 70) return { tone: 'warn', text: 'élevé' }
  return { tone: 'ok', text: '' }
}

/** "dans 2 h 05", "dans 3 j 4 h", "maintenant" */
export function untilReset(iso: string | undefined, now: number): string {
  if (!iso) return ''
  const ms = Date.parse(iso) - now
  if (ms <= 0) return 'maintenant'
  const min = Math.round(ms / 60000), h = Math.floor(min / 60), dd = Math.floor(h / 24)
  if (dd >= 1) return `dans ${dd} j ${h % 24} h`
  if (h >= 1) return `dans ${h} h ${String(min % 60).padStart(2, '0')}`
  return `dans ${min} min`
}
