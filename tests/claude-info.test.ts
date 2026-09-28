import { describe, it, expect } from 'vitest'
import { parseStatusPage, statusLabel, statusTone, updateAvailable } from '../src/shared/claude-info'

describe('Anthropic status page', () => {
  it('keeps unresolved incidents and degraded components', () => {
    const s = parseStatusPage({
      status: { indicator: 'minor', description: 'Partially Degraded Service' },
      components: [{ name: 'claude.ai', status: 'operational' }, { name: 'Claude Code', status: 'degraded_performance' }, { name: 'Group', status: 'partial_outage', group: true }, null],
      incidents: [{ name: 'Elevated errors', status: 'investigating', impact: 'minor', shortlink: 'https://stspg.io/x', updated_at: '2026-09-28T10:00:00Z' }, { name: 'Old', status: 'resolved', impact: 'major' }],
    })
    expect(s).toEqual({ indicator: 'minor', description: 'Partially Degraded Service', degraded: [{ name: 'Claude Code', status: 'degraded_performance' }],
      incidents: [{ name: 'Elevated errors', status: 'investigating', impact: 'minor', url: 'https://stspg.io/x', updatedAt: '2026-09-28T10:00:00Z' }] })
    expect(parseStatusPage({ status: { indicator: 'none', description: 'All Systems Operational' } })).toEqual({ indicator: 'none', description: 'All Systems Operational', degraded: [], incidents: [] })
    expect(() => parseStatusPage({})).toThrow(/illisible/)
    expect(() => parseStatusPage(null)).toThrow(/illisible/)
  })
  it('tones and labels', () => {
    expect(statusTone('none')).toBe('ok')
    expect(statusTone('minor')).toBe('warn')
    expect(statusTone('maintenance')).toBe('warn')
    expect(statusTone('critical')).toBe('error')
    expect(statusLabel('partial_outage')).toBe('panne partielle')
    expect(statusLabel('new_state')).toBe('new state')
  })
})

describe('Claude Code update', () => {
  it('offers the newer npm version only', () => {
    expect(updateAvailable('2.1.283', '2.1.290')).toBe('2.1.290')
    expect(updateAvailable('2.1.283', '2.1.283')).toBeNull()
    expect(updateAvailable('2.1.300', '2.1.290')).toBeNull()
    expect(updateAvailable(null, '2.1.290')).toBeNull()
    expect(updateAvailable('2.1.283', undefined)).toBeNull()
  })
})
