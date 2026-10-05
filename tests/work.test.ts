import { describe, it, expect } from 'vitest'
import { summarizeWork } from '../src/shared/work'

const line = (o: object) => JSON.stringify(o)
const event = (branch: string, at: string) => line({ type: 'user', gitBranch: branch, timestamp: at, message: { role: 'user', content: 'x' } })
const call = (id: string, name: string, input: object, at: string) => line({ type: 'assistant', gitBranch: 'aqn/feat/hn-1-x', timestamp: at, message: { content: [{ type: 'tool_use', id, name, input }] } })
const result = (id: string, payload: unknown, at: string, error = false) =>
  line({ type: 'user', timestamp: at, message: { content: [{ type: 'tool_result', tool_use_id: id, ...(error ? { is_error: true } : {}), content: [{ type: 'text', text: typeof payload === 'string' ? payload : JSON.stringify(payload) }] }] } })

describe('session work', () => {
  it('keeps the last branch and each merge request once', () => {
    const w = summarizeWork([
      event('main', '2026-10-01T10:00:00Z'),
      line({ type: 'pr-link', prNumber: 13, prUrl: 'https://github.com/a/b/pull/13', prRepository: 'a/b', timestamp: '2026-10-01T10:01:00Z' }),
      line({ type: 'pr-link', prNumber: 13, prUrl: 'https://github.com/a/b/pull/13', prRepository: 'a/b', timestamp: '2026-10-01T10:02:00Z' }),
      line({ type: 'pr-link', prUrl: 'https://gitlab.com/x/-/merge_requests/9' }),
      event('ancelin/hn-12528-fe "q"', '2026-10-01T11:00:00Z'),
      '{broken',
      '',
    ])
    expect(w.branch).toBe('ancelin/hn-12528-fe "q"')
    expect(w.prs).toEqual([{ url: 'https://github.com/a/b/pull/13', number: 13, repository: 'a/b' }, { url: 'https://gitlab.com/x/-/merge_requests/9' }])
    expect(w.tickets).toEqual({})
    expect(summarizeWork([line({ type: 'user', gitBranch: '' })]).branch).toBeUndefined()
  })

  it('reads tickets from either Linear server: the answer of get_issue, the state save_issue left', () => {
    const issue = (o: object) => ({ id: 'HN-1', uuid: 'u', title: 'Textes EN', url: 'https://linear.app/x/issue/HN-1', gitBranchName: 'aqn/hn-1-textes', status: 'À traiter', ...o })
    const w = summarizeWork([
      call('t1', 'mcp__claude_ai_Linear__get_issue', { id: 'HN-1' }, '2026-10-01T10:00:00Z'),
      result('t1', issue({}), '2026-10-01T10:00:01Z'),
      call('t2', 'mcp__linear__save_issue', { id: 'HN-1', state: 'En cours' }, '2026-10-01T11:00:00Z'),
      result('t2', issue({ status: 'En cours' }), '2026-10-01T11:00:01Z'),
      // links only: an answer, not a state Claude set
      call('t3', 'mcp__linear__save_issue', { id: 'MAR-4', links: [] }, '2026-10-01T12:00:00Z'),
      result('t3', issue({ id: 'MAR-4', status: 'Fait' }), '2026-10-01T12:00:01Z'),
    ])
    expect(w.tickets['HN-1']).toEqual({ title: 'Textes EN', url: 'https://linear.app/x/issue/HN-1', branch: 'aqn/hn-1-textes', status: 'En cours', statusAt: '2026-10-01T11:00:01Z', statusSetByClaude: true })
    expect(w.tickets['MAR-4']).toMatchObject({ status: 'Fait', statusSetByClaude: false })
  })

  it('an older answer does not undo a newer state; errors, foreign tools and bad ids are left out', () => {
    const w = summarizeWork([
      call('a', 'mcp__linear__get_issue', { id: 'HN-2' }, '2026-10-01T10:00:00Z'),
      call('b', 'mcp__linear__save_issue', { issueId: 'HN-2', state: 'Fait' }, '2026-10-01T10:00:05Z'),
      result('b', { id: 'HN-2', status: 'Fait' }, '2026-10-01T10:00:06Z'),
      result('a', { id: 'HN-2', status: 'À traiter' }, '2026-10-01T10:00:02Z'),
      call('c', 'mcp__linear__get_issue', { id: 'HN-3' }, '2026-10-01T10:00:00Z'),
      result('c', 'Issue not found', '2026-10-01T10:00:01Z', true),
      call('d', 'mcp__linear__get_issue', { id: 'pas-un-ticket' }, '2026-10-01T10:00:00Z'),
      result('d', { title: 'sans id' }, '2026-10-01T10:00:01Z'),
      call('e', 'mcp__github__get_issue', { id: 'GH-4' }, '2026-10-01T10:00:00Z'),
      result('e', { id: 'GH-4', status: 'open' }, '2026-10-01T10:00:01Z'),
      call('f', 'mcp__linear__get_issue', { id: 'HN-5' }, '2026-10-01T10:00:00Z'),
      result('f', 'not json', '2026-10-01T10:00:01Z'),
      result('zzz', { id: 'HN-6', status: 'x' }, '2026-10-01T10:00:01Z'),
    ])
    expect(w.tickets['HN-2']).toMatchObject({ status: 'Fait', statusSetByClaude: true })
    // asked about, never answered: known by its id only
    expect(w.tickets['HN-3']).toEqual({})
    expect(w.tickets['HN-5']).toEqual({})
    expect(Object.keys(w.tickets).sort()).toEqual(['HN-2', 'HN-3', 'HN-5'])
  })
})
