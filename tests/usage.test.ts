import { describe, it, expect } from 'vitest'
import { level, limitLabel, mergeLimits, parseApiUsage, parseStatus, untilReset } from '../src/shared/usage'

const input = {
  session_id: 'abc', model: { id: 'claude-opus-5-5', display_name: 'Opus 5.5' }, workspace: { current_dir: '/work/p' },
  context_window: { used_percentage: 12.5 },
  rate_limits: { seven_day: { used_percentage: 47, resets_at: 1790600000 }, five_hour: { used_percentage: 9.4, resets_at: 1790530000 }, seven_day_haiku: { used_percentage: 3 }, spend_limit: { used_percentage: 120 }, bogus: { foo: 1 } },
}

describe('usage from the status line', () => {
  it('reads limits in a fixed order, the session and the context', () => {
    const s = parseStatus(input, 1000)
    expect(s.limits.map((l) => [l.key, l.label, l.percent, l.source])).toEqual([
      ['session', 'Session (5 h)', 9.4, 'statusline'], ['weekly_all', 'Semaine', 47, 'statusline'], ['weekly:Haiku', 'Semaine · Haiku', 3, 'statusline'], ['spend', 'Crédit supplémentaire', 100, 'statusline'],
    ])
    expect(s.limits[0].resetsAt).toBe(new Date(1790530000 * 1000).toISOString())
    expect(s.session).toEqual({ id: 'abc', model: 'Opus 5.5', cwd: '/work/p', contextPercent: 12.5 })
    expect(s.at).toBe(1000)
  })

  it('keeps the last known limits when an input has none (before the first API response)', () => {
    const first = parseStatus(input, 1)
    const next = parseStatus({ session_id: 'new', model: { id: 'claude-haiku' } }, 2, first)
    expect(next.limits).toEqual(first.limits)
    expect(next.session).toEqual({ id: 'new', model: 'claude-haiku', cwd: undefined, contextPercent: undefined })
    expect(parseStatus(null, 3, first)).toEqual({ at: 3, limits: first.limits, session: first.session })
    expect(parseStatus('x', 4)).toEqual({ at: 4, limits: [] })
    expect(parseStatus({ rate_limits: { five_hour: { used_percentage: 5, resets_at: '2026-10-01T10:00:00Z' } } }, 5).limits[0].resetsAt).toBe('2026-10-01T10:00:00.000Z')
    expect(parseStatus({ rate_limits: { five_hour: { used_percentage: 5, resets_at: 'soon' } } }, 5).limits[0].resetsAt).toBeUndefined()
    expect(parseStatus({ rate_limits: { five_hour: { used_percentage: 5, resets_at: 1790530000000 } } }, 5).limits[0].resetsAt).toBe(new Date(1790530000000).toISOString())
  })

  it('labels, levels and reset delays', () => {
    expect(limitLabel('seven_day_opus')).toBe('Semaine · Opus')
    expect(limitLabel('weekly:Fable')).toBe('Semaine · Fable')
    expect(limitLabel('weird_key')).toBe('weird key')
    expect(level(50)).toEqual({ tone: 'ok', text: '' })
    expect(level(75).tone).toBe('warn')
    expect(level(95)).toEqual({ tone: 'error', text: 'presque atteinte' })
    const now = Date.parse('2026-09-28T10:00:00Z')
    expect(untilReset('2026-09-28T12:05:00Z', now)).toBe('dans 2 h 05')
    expect(untilReset('2026-10-01T14:00:00Z', now)).toBe('dans 3 j 4 h')
    expect(untilReset('2026-09-28T10:20:00Z', now)).toBe('dans 20 min')
    expect(untilReset('2026-09-28T09:00:00Z', now)).toBe('maintenant')
    expect(untilReset(undefined, now)).toBe('')
  })

  it('reads the usage API: its limits list (per-model weeks such as Fable), or the legacy fields', () => {
    const listed = parseApiUsage({ limits: [
      { kind: 'session', percent: 12, resets_at: '2026-09-28T20:00:00Z' },
      { kind: 'weekly_all', percent: 31, resets_at: '2026-10-02T08:00:00Z' },
      { kind: 'weekly_scoped', percent: 64, resets_at: '2026-10-02T08:00:00Z', scope: { model: { display_name: 'Fable' } } },
      { kind: 'spend', percent: 0 }, { kind: 'bogus' }, 'x',
    ] }, 50)
    expect(listed.map((l) => [l.key, l.label, l.percent, l.source])).toEqual([
      ['session', 'Session (5 h)', 12, 'api'], ['weekly_all', 'Semaine', 31, 'api'], ['weekly:Fable', 'Semaine · Fable', 64, 'api'], ['spend', 'Crédit supplémentaire', 0, 'api'],
    ])
    const legacy = parseApiUsage({ five_hour: { utilization: 5, resets_at: '2026-09-28T20:00:00Z' }, seven_day: { utilization: 30 }, seven_day_fable: { utilization: 70 }, seven_day_opus: null, extra_usage: { is_enabled: false, utilization: 0 }, other: { utilization: 1 } }, 60)
    expect(legacy.map((l) => [l.key, l.percent])).toEqual([['session', 5], ['weekly_all', 30], ['weekly:Fable', 70]])
    expect(parseApiUsage(null, 1)).toEqual([])
  })

  it('merges the two sources limit by limit, the most recent wins, the API-only ones stay', () => {
    const api = parseApiUsage({ limits: [{ kind: 'session', percent: 10 }, { kind: 'weekly_scoped', percent: 64, scope: { model: { display_name: 'Fable' } } }] }, 100)
    const line = parseStatus({ rate_limits: { five_hour: { used_percentage: 12 }, seven_day: { used_percentage: 31 } } }, 200).limits
    expect(mergeLimits(api, line).map((l) => [l.key, l.percent, l.source])).toEqual([['session', 12, 'statusline'], ['weekly_all', 31, 'statusline'], ['weekly:Fable', 64, 'api']])
    expect(mergeLimits(line, parseApiUsage({ limits: [{ kind: 'session', percent: 15 }] }, 300))[0]).toMatchObject({ percent: 15, source: 'api' })
    expect(mergeLimits(undefined, [])).toEqual([])
  })
})
