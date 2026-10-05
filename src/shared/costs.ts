/**
 * What sessions cost (pure, tested). Claude Code records the exact cost of a session in its cost-state records (total
 * and per model); the tokens of the replies give an estimate where there is none (a session still open, or one that
 * went on after its last cost-state), priced with rates inferred from the user's own cost-state records.
 */

export interface Tok { in: number; out: number; cr: number; cw: number }
const zero = (): Tok => ({ in: 0, out: 0, cr: 0, cw: 0 })
const add = (a: Tok, b: Tok) => { a.in += b.in; a.out += b.out; a.cr += b.cr; a.cw += b.cw }

export interface TranscriptCosts {
  cwd?: string
  /** last activity (ISO) */
  last?: string
  /** local day (YYYY-MM-DD) → model → tokens, each API response once */
  days: Record<string, Record<string, Tok>>
  /** the last cost-state: Claude Code's own figures */
  exact?: { total: number; byModel: Record<string, { cost: number; tok: Tok }> }
  /** model → tokens of the replies after the last cost-state (not in it) */
  after: Record<string, Tok>
}

const day = (iso: string) => { const d = new Date(iso); return isNaN(+d) ? '' : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

/** Reads the lines that matter (replies' usage, cost-state); a reply split over several records is counted once. */
export function summarizeCosts(lines: string[]): TranscriptCosts {
  const s: TranscriptCosts = { days: {}, after: {} }
  const seen = new Set<string>()
  for (const line of lines) {
    if (!line.includes('"usage"') && !line.includes('"cost-state"') && (s.cwd || !line.includes('"cwd"'))) continue
    let o: any
    try { o = JSON.parse(line) } catch { continue }
    if (!s.cwd && typeof o?.cwd === 'string') s.cwd = o.cwd
    if (o?.type === 'cost-state' && typeof o.totalCostUSD === 'number') {
      const byModel: Record<string, { cost: number; tok: Tok }> = {}
      for (const [m, u] of Object.entries<any>(o.modelUsage ?? {})) {
        byModel[m] = { cost: Number(u.costUSD) || 0, tok: { in: Number(u.inputTokens) || 0, out: Number(u.outputTokens) || 0, cr: Number(u.cacheReadInputTokens) || 0, cw: Number(u.cacheCreationInputTokens) || 0 } }
      }
      s.exact = { total: o.totalCostUSD, byModel }
      s.after = {}
      continue
    }
    const u = o?.type === 'assistant' ? o.message?.usage : undefined
    const model = o?.message?.model
    if (!u || typeof model !== 'string' || model === '<synthetic>') continue
    const id = o.message.id ?? o.requestId
    if (id) { if (seen.has(id)) continue; seen.add(id) }
    const tok: Tok = { in: u.input_tokens ?? 0, out: u.output_tokens ?? 0, cr: u.cache_read_input_tokens ?? 0, cw: u.cache_creation_input_tokens ?? 0 }
    const d = typeof o.timestamp === 'string' ? day(o.timestamp) : ''
    if (d) add(((s.days[d] ??= {})[model] ??= zero()), tok)
    add((s.after[model] ??= zero()), tok)
    if (typeof o.timestamp === 'string') s.last = o.timestamp
  }
  return s
}

/** Price weights against the input token: output 5×, cache read 0.1×, cache write 2× (the 1 h cache). */
const W: Tok = { in: 1, out: 5, cr: 0.1, cw: 2 }
const weighted = (t: Tok) => t.in * W.in + t.out * W.out + t.cr * W.cr + t.cw * W.cw
/** Claude Code names the 1M-context variant with a suffix; replies name the model without it. */
const baseModel = (m: string) => m.replace(/\[1m\]$/i, '')

/** A base price per model ($ per weighted token) from the cost-state records: an estimate (≈), not a tariff. */
export function inferRates(sessions: TranscriptCosts[]): Record<string, number> {
  const sums: Record<string, { cost: number; w: number }> = {}
  for (const s of sessions) for (const [m, x] of Object.entries(s.exact?.byModel ?? {})) {
    const k = baseModel(m), e = (sums[k] ??= { cost: 0, w: 0 })
    e.cost += x.cost; e.w += weighted(x.tok)
  }
  return Object.fromEntries(Object.entries(sums).filter(([, e]) => e.w > 0 && e.cost > 0).map(([m, e]) => [m, e.cost / e.w]))
}

/** exact: Claude Code's figure; estimated: priced from tokens (≈); atLeast: part of it could not be priced (≥). */
export type CostKind = 'exact' | 'estimated' | 'atLeast'
export interface Cost { usd: number; kind: CostKind }
const worse = (a: CostKind, b: CostKind): CostKind => (a === 'atLeast' || b === 'atLeast' ? 'atLeast' : a === 'estimated' || b === 'estimated' ? 'estimated' : 'exact')

/** Estimate of tokens per model; models without a rate leave the result "at least". */
function price(byModel: Record<string, Tok>, rates: Record<string, number>): { usd: number; priced: boolean } {
  let usd = 0, priced = true
  for (const [m, t] of Object.entries(byModel)) {
    if (weighted(t) === 0) continue
    const r = rates[baseModel(m)]
    if (r === undefined) priced = false; else usd += weighted(t) * r
  }
  return { usd, priced }
}

/** A session's cost: its last cost-state, plus an estimate of what came after; or only the estimate. */
export function sessionCost(s: TranscriptCosts, rates: Record<string, number>): Cost | null {
  const rest = price(s.after, rates)
  const hasAfter = Object.values(s.after).some((t) => weighted(t) > 0)
  if (s.exact) return { usd: s.exact.total + rest.usd, kind: !hasAfter ? 'exact' : rest.priced ? 'estimated' : 'atLeast' }
  if (!hasAfter) return null
  // nothing priced (a model without a rate): "at least 0", so the totals it is part of say "at least" too
  return { usd: rest.usd, kind: rest.priced ? 'estimated' : 'atLeast' }
}

/** A cost worth showing for one session: not a "≥ 0" that only says nothing could be priced. */
export const showsCost = (c: Cost | undefined): c is Cost => !!c && !(c.usd === 0 && c.kind === 'atLeast')

export interface CostReport {
  total: Cost
  byDay: { day: string; cost: Cost }[]
  byProject: { project: string; cost: Cost }[]
  byModel: { model: string; cost: Cost; tokens: number }[]
  /** transcript path → its cost */
  sessions: Record<string, Cost>
}

/**
 * Totals over sessions, from `since` (YYYY-MM-DD) on. A session's cost goes to its days in proportion to their estimated
 * share (its tokens, when nothing can be priced), so the days of an exact session add up to its exact cost.
 */
export function costReport(list: { path: string; costs: TranscriptCosts }[], since = ''): CostReport {
  const rates = inferRates(list.map((x) => x.costs))
  const days: Record<string, Cost> = {}, projects: Record<string, Cost> = {}, models: Record<string, { cost: Cost; tokens: number }> = {}
  const sessions: Record<string, Cost> = {}
  let total: Cost = { usd: 0, kind: 'exact' }
  const put = (map: Record<string, Cost>, k: string, usd: number, kind: CostKind) => { const e = (map[k] ??= { usd: 0, kind: 'exact' }); e.usd += usd; e.kind = worse(e.kind, kind) }
  for (const { path, costs: s } of list) {
    const c = sessionCost(s, rates)
    if (!c) continue
    sessions[path] = c
    const share = Object.entries(s.days).map(([d, byModel]) => ({ d, byModel, w: price(byModel, rates).usd || Object.values(byModel).reduce((a, t) => a + weighted(t), 0) }))
    const all = share.reduce((a, x) => a + x.w, 0)
    const inRange = share.filter((x) => x.d >= since)
    if (!inRange.length) continue
    for (const x of inRange) {
      const usd = all > 0 ? c.usd * (x.w / all) : 0
      put(days, x.d, usd, c.kind)
      put(projects, s.cwd ?? '?', usd, c.kind)
      total = { usd: total.usd + usd, kind: worse(total.kind, c.kind) }
      // per model: the exact split when the session has one, else the estimate
      for (const [m, t] of Object.entries(x.byModel)) {
        const e = (models[baseModel(m)] ??= { cost: { usd: 0, kind: 'exact' }, tokens: 0 })
        e.tokens += t.in + t.out + t.cr + t.cw
        const r = rates[baseModel(m)]
        const est = r === undefined ? 0 : weighted(t) * r
        const scaled = x.w > 0 && price(x.byModel, rates).usd > 0 ? usd * (est / price(x.byModel, rates).usd) : 0
        e.cost.usd += scaled
        e.cost.kind = worse(e.cost.kind, r === undefined ? 'atLeast' : c.kind)
      }
    }
  }
  const byDesc = <T,>(o: Record<string, T>, f: (v: T) => number) => Object.entries(o).sort((a, b) => f(b[1]) - f(a[1]))
  return {
    total,
    byDay: Object.entries(days).sort((a, b) => b[0].localeCompare(a[0])).map(([day, cost]) => ({ day, cost })),
    byProject: byDesc(projects, (c) => c.usd).map(([project, cost]) => ({ project, cost })),
    byModel: byDesc(models, (m) => m.cost.usd).map(([model, m]) => ({ model, cost: m.cost, tokens: m.tokens })),
    sessions,
  }
}

/** "≈ 12,40 $", "≥ 3,00 $", "0,52 $" (French notation). */
export function formatCost(c: Cost): string {
  const n = c.usd.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return (c.kind === 'estimated' ? '≈ ' : c.kind === 'atLeast' ? '≥ ' : '') + n + ' $'
}
