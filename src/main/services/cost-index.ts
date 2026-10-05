import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, renameSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { costReport, summarizeCosts, type CostReport, type TranscriptCosts } from '@shared/costs'

const VERSION = 1

/**
 * What the sessions cost, from a summary of each transcript kept in userData (by size and mtime, so only changed files
 * are read again). Sub-agents' transcripts are left out: their cost is in their session's cost-state. The main thread
 * is handed back between two files (a first build reads every transcript).
 */
export class CostIndex {
  private cache = new Map<string, { size: number; mtime: number; costs: TranscriptCosts }>()
  private building: Promise<CostReport> | null = null

  constructor(private root: string, private file: string) {
    try {
      const d = JSON.parse(readFileSync(file, 'utf8'))
      if (d?.version === VERSION && d.files && typeof d.files === 'object') for (const [p, v] of Object.entries<any>(d.files)) this.cache.set(p, v)
    } catch { /* first build */ }
  }

  /** Totals of the last `days` days (by day, project, model) and each session's cost. */
  report(days = 30): Promise<CostReport> {
    this.building ??= this.build(days).finally(() => { this.building = null })
    return this.building
  }

  private async build(days: number): Promise<CostReport> {
    const list: { path: string; costs: TranscriptCosts }[] = []
    const alive = new Set<string>()
    let changed = false
    let dirs: string[] = []
    try { dirs = readdirSync(this.root) } catch { /* none */ }
    for (const d of dirs) {
      let names: string[] = []
      try { names = readdirSync(join(this.root, d)).filter((n) => n.endsWith('.jsonl')) } catch { continue }
      for (const n of names) {
        const p = join(this.root, d, n)
        let st
        try { st = statSync(p) } catch { continue }
        alive.add(p)
        let e = this.cache.get(p)
        if (!e || e.size !== st.size || e.mtime !== st.mtimeMs) {
          try { e = { size: st.size, mtime: st.mtimeMs, costs: summarizeCosts(readFileSync(p, 'utf8').split('\n')) } } catch { continue }
          this.cache.set(p, e); changed = true
          await new Promise((r) => setImmediate(r))
        }
        list.push({ path: p, costs: e.costs })
      }
    }
    for (const p of [...this.cache.keys()]) if (!alive.has(p)) { this.cache.delete(p); changed = true }
    if (changed) this.save()
    const since = new Date(Date.now() - (days - 1) * 86_400_000)
    const day = `${since.getFullYear()}-${String(since.getMonth() + 1).padStart(2, '0')}-${String(since.getDate()).padStart(2, '0')}`
    return costReport(list, day)
  }

  private save() {
    try {
      if (!existsSync(dirname(this.file))) mkdirSync(dirname(this.file), { recursive: true })
      const tmp = this.file + '.tmp'
      writeFileSync(tmp, JSON.stringify({ version: VERSION, files: Object.fromEntries(this.cache) }))
      renameSync(tmp, this.file)
    } catch { /* kept in memory */ }
  }
}
