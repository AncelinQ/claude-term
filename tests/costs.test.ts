import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { costReport, formatCost, formatRunCost, inferRates, sessionCost, summarizeCosts } from '../src/shared/costs'
import { CostIndex } from '../src/main/services/cost-index'
import { TempDir, jsonl } from './helpers'

const reply = (id: string, ts: string, model: string, inT: number, out: number) =>
  ({ type: 'assistant', timestamp: ts, cwd: '/p', message: { id, model, usage: { input_tokens: inT, output_tokens: out, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } })
const costState = (total: number, model: string, cost: number, inT: number, out: number) =>
  ({ type: 'cost-state', totalCostUSD: total, modelUsage: { [model]: { inputTokens: inT, outputTokens: out, cacheReadInputTokens: 0, cacheCreationInputTokens: 0, costUSD: cost } } })
const lines = (objs: object[]) => objs.map((o) => JSON.stringify(o))

describe('session costs', () => {
  it('counts each reply once, keeps the last cost-state and what came after it', () => {
    const s = summarizeCosts(lines([
      reply('m1', '2026-10-01T10:00:00Z', 'claude-opus-5', 100, 10), reply('m1', '2026-10-01T10:00:01Z', 'claude-opus-5', 100, 10),
      costState(1.5, 'claude-opus-5', 1.5, 100, 10),
      reply('m2', '2026-10-02T10:00:00Z', 'claude-opus-5', 50, 5),
    ]))
    expect(s.cwd).toBe('/p')
    expect(s.days['2026-10-01']['claude-opus-5']).toEqual({ in: 100, out: 10, cr: 0, cw: 0 })
    expect(s.exact).toEqual({ total: 1.5, byModel: { 'claude-opus-5': { cost: 1.5, tok: { in: 100, out: 10, cr: 0, cw: 0 } } } })
    expect(s.after).toEqual({ 'claude-opus-5': { in: 50, out: 5, cr: 0, cw: 0 } })
  })

  it('infers a base price per model and labels exact, estimated and at least', () => {
    const exact = summarizeCosts(lines([reply('a', '2026-10-01T10:00:00Z', 'claude-opus-5', 1000, 0), costState(0.005, 'claude-opus-5[1m]', 0.005, 1000, 0)]))
    const rates = inferRates([exact])
    expect(rates['claude-opus-5']).toBeCloseTo(0.005 / 1000)
    expect(sessionCost(exact, rates)).toEqual({ usd: 0.005, kind: 'exact' })
    const open = summarizeCosts(lines([reply('b', '2026-10-02T10:00:00Z', 'claude-opus-5', 2000, 0)]))
    expect(sessionCost(open, rates)).toEqual({ usd: expect.closeTo(0.01), kind: 'estimated' })
    const unknown = summarizeCosts(lines([reply('c', '2026-10-02T10:00:00Z', 'claude-new-model', 2000, 0)]))
    expect(sessionCost(unknown, rates)).toEqual({ usd: 0, kind: 'atLeast' })
    expect(sessionCost(summarizeCosts([]), rates)).toBeNull()
  })

  it('sums by day, project and model, an exact cost spread over its days', () => {
    const s = summarizeCosts(lines([
      reply('a', '2026-10-01T10:00:00Z', 'claude-opus-5', 1000, 0), reply('b', '2026-10-02T10:00:00Z', 'claude-opus-5', 3000, 0),
      costState(4, 'claude-opus-5', 4, 4000, 0),
    ]))
    const r = costReport([{ path: '/x/s1.jsonl', costs: s }])
    expect(r.total).toEqual({ usd: 4, kind: 'exact' })
    expect(r.byDay.map((d) => [d.day, +d.cost.usd.toFixed(2)])).toEqual([['2026-10-02', 3], ['2026-10-01', 1]])
    expect(r.byProject).toEqual([{ project: '/p', cost: { usd: 4, kind: 'exact' } }])
    expect(r.byModel[0]).toMatchObject({ model: 'claude-opus-5', tokens: 4000 })
    expect(r.byModel[0].cost.usd).toBeCloseTo(4)
    expect(r.sessions['/x/s1.jsonl']).toEqual({ usd: 4, kind: 'exact' })
    expect(costReport([{ path: '/x/s1.jsonl', costs: s }], '2026-10-02').total.usd).toBeCloseTo(3)
  })

  it('writes costs the French way, with their kind', () => {
    expect(formatCost({ usd: 1234.5, kind: 'exact' })).toMatch(/^1\s234,50 \$$/)
    expect(formatCost({ usd: 2, kind: 'estimated' })).toBe('≈ 2,00 $')
    expect(formatRunCost(0.034)).toBe('0,03 $')
    expect(formatRunCost(0.004)).toBe('< 0,01 $')
    expect(formatCost({ usd: 2, kind: 'atLeast' })).toBe('≥ 2,00 $')
  })
})

describe('cost index', () => {
  it('summarizes the transcripts once, keeps the summaries, leaves sub-agents out', async () => {
    const t = new TempDir()
    const today = new Date().toISOString()
    t.write('projects/p/s1.jsonl', jsonl([reply('a', today, 'claude-opus-5', 1000, 0), costState(2, 'claude-opus-5', 2, 1000, 0)]))
    t.write('projects/p/s1/subagents/agent-x.jsonl', jsonl([reply('z', today, 'claude-opus-5', 9e6, 0)]))
    const file = join(t.path, 'index', 'costs.json')
    const r = await new CostIndex(join(t.path, 'projects'), file).report()
    expect(r.total).toEqual({ usd: 2, kind: 'exact' })
    expect(existsSync(file)).toBe(true)
    expect((await new CostIndex(join(t.path, 'projects'), file).report()).total).toEqual({ usd: 2, kind: 'exact' })
    t.dispose()
  })
})
