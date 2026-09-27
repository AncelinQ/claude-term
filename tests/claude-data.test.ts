import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { utimesSync } from 'node:fs'
import { TempDir, jsonl } from './helpers'
import { ClaudeData } from '../src/main/services/claude-data'
import { encodeProjectPath } from '../src/shared/claude-format'

function home() {
  const t = new TempDir()
  const cwd = join(t.path, 'dev', 'proj')
  const dir = join(t.path, '.claude', 'projects', encodeProjectPath(cwd))
  return { t, cwd, dir, data: new ClaudeData(t.path) }
}

describe('ClaudeData', () => {
  it('lists sessions of a project and below, with titles from the index, ai-title or first prompt', () => {
    const { t, cwd, dir, data } = home()
    t.write(join(dir, 'aaa.jsonl'), jsonl([{ type: 'user', cwd, message: { content: 'premier prompt' } }]))
    t.write(join(dir, 'bbb.jsonl'), jsonl([{ type: 'user', cwd, message: { content: 'x' } }, { type: 'ai-title', aiTitle: 'Titre IA' }]))
    t.write(join(dir, 'side.jsonl'), jsonl([{ type: 'user', cwd, message: { content: 'sidechain' } }]))
    t.write(join(dir, 'sessions-index.json'), JSON.stringify({ entries: [
      { sessionId: 'aaa', firstPrompt: 'Depuis l’index', messageCount: 4, gitBranch: 'main', projectPath: cwd },
      { sessionId: 'side', isSidechain: true },
    ] }))
    // a session started in a sub-folder belongs to the project too
    const sub = join(cwd, 'packages', 'api')
    t.write(join(t.path, '.claude', 'projects', encodeProjectPath(sub), 'ccc.jsonl'), jsonl([{ type: 'user', cwd: sub, message: { content: 'sous-dossier' } }]))
    const s = data.sessions(cwd)
    expect(s.map((x) => x.id).sort()).toEqual(['aaa', 'bbb', 'ccc'])
    expect(s.find((x) => x.id === 'aaa')).toMatchObject({ title: 'Depuis l’index', messageCount: 4, gitBranch: 'main' })
    expect(s.find((x) => x.id === 'bbb')?.title).toBe('Titre IA')
    expect(s.find((x) => x.id === 'ccc')).toMatchObject({ title: 'sous-dossier', projectPath: sub })
    expect(data.hasSessions(cwd)).toBe(true)
    expect(data.hasSessions('/elsewhere')).toBe(false)
    expect(data.allSessions().length).toBe(3)
    t.dispose()
  })
  it('newestTranscript picks files created after the tab, skipping claimed ones', () => {
    const { t, cwd, dir, data } = home()
    const old = t.write(join(dir, 'old.jsonl'), '{}\n')
    utimesSync(old, new Date(Date.now() - 60_000), new Date(Date.now() - 60_000))
    const fresh = t.write(join(dir, 'new.jsonl'), '{}\n')
    const after = Date.now() - 5_000
    expect(data.newestTranscript(cwd, after, false, new Set())).toBe(fresh)
    expect(data.newestTranscript(cwd, after, false, new Set([fresh]))).toBeNull()
    // reuse (--continue): the modified one counts even if created long ago
    utimesSync(old, new Date(), new Date())
    expect(data.newestTranscript(cwd, after, true, new Set([fresh]))).toBe(old)
    t.dispose()
  })
  it('readFrom returns only new bytes', () => {
    const { t, dir, data } = home()
    const p = t.write(join(dir, 's.jsonl'), 'abc\n')
    const r1 = data.readFrom(p, 0)
    expect(r1).toEqual({ chunk: 'abc\n', offset: 4 })
    expect(data.readFrom(p, 4).chunk).toBe('')
    t.write(join(dir, 's.jsonl'), 'abc\ndef')
    expect(data.readFrom(p, 4)).toEqual({ chunk: 'def', offset: 7 })
    t.dispose()
  })
  it('sessionDiff compares the file-history backup with the file on disk', () => {
    const { t, data } = home()
    t.write('.claude/file-history/sess1/a.ts@v1', 'a\nb\n')
    const file = t.write('proj/a.ts', 'a\nB\n')
    const d = data.sessionDiff(file, 'a.ts@v1', 'sess1')
    expect(d).toContain('-b\n+B')
    expect(data.sessionDiff(file, null, 'sess1')).toContain('+a\n+B')   // created by Claude: against empty
    t.dispose()
  })
  it('plans are listed newest first with their first heading', () => {
    const { t, data } = home()
    const a = t.write('.claude/plans/a.md', '# Plan A\n- [ ] x\n')
    utimesSync(a, new Date(Date.now() - 60_000), new Date(Date.now() - 60_000))
    t.write('.claude/plans/b.md', 'intro\n## Plan B\n')
    expect(data.plans().map((p) => p.title)).toEqual(['Plan B', 'Plan A'])
    t.dispose()
  })
})
