import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { utimesSync } from 'node:fs'
import { TempDir, jsonl, sleep } from './helpers'
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
  it('newestTranscript picks files created after the tab, skipping claimed ones', async () => {
    const { t, cwd, dir, data } = home()
    // real creation times on every OS (utimes moves the birth time back on macOS only)
    const old = t.write(join(dir, 'old.jsonl'), '{}\n')
    await sleep(30)
    const after = Date.now()
    await sleep(30)
    const fresh = t.write(join(dir, 'new.jsonl'), '{}\n')
    expect(data.newestTranscript(cwd, after, false, new Set())).toBe(fresh)
    expect(data.newestTranscript(cwd, after, false, new Set([fresh]))).toBeNull()
    // reuse (--continue): the modified one counts even if created long ago
    utimesSync(old, new Date(Date.now() + 1000), new Date(Date.now() + 1000))
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

  it('deletes a session with its folder and file-history, after telling its size; nothing outside the projects', async () => {
    const { t, cwd, dir, data } = home()
    const path = t.write(join(dir, 'sid1.jsonl'), jsonl([{ type: 'user', cwd, message: { content: 'x' } }]))
    t.write(join(dir, 'sid1', 'subagents', 'agent-a.jsonl'), '{}\n')
    t.write(join('.claude', 'file-history', 'sid1', 'f@v1'), 'backup content')
    const s = { id: 'sid1', path, title: 'x', modified: 0, projectPath: cwd, messageCount: 1, gitBranch: '' }
    expect(data.sessionSize(s)).toBeGreaterThan(14)
    const trashed: string[] = []
    await data.deleteSession(s, async (p) => { trashed.push(p) })
    expect(trashed).toEqual([path, join(dir, 'sid1'), join(t.path, '.claude', 'file-history', 'sid1')])
    const outside = { ...s, id: 'evil', path: t.write('elsewhere/evil.jsonl', '{}') }
    expect(data.sessionSize(outside)).toBe(0)
    await data.deleteSession(outside, async (p) => { trashed.push(p) })
    expect(trashed).toHaveLength(3)
    t.dispose()
  })

  it('counts the slash commands typed, skills included, not the ones quoted in tool output', () => {
    const { t, cwd, dir, data } = home()
    t.write(join(dir, 'c1.jsonl'), jsonl([
      { type: 'user', cwd, message: { role: 'user', content: '<command-name>/clear</command-name>\n<command-message>clear</command-message>' } },
      { type: 'user', cwd, message: { role: 'user', content: '<command-message>sc:design</command-message>\n<command-name>/sc:design</command-name>\n<command-args>x</command-args>' } },
      { type: 'user', cwd, message: { role: 'user', content: '<command-message>sc:design</command-message>\n            <command-name>/sc:design</command-name>' } },
      { type: 'user', cwd, message: { content: [{ type: 'tool_result', tool_use_id: 'x', content: 'grep: "content":"<command-name>/fake</command-name>' }] } },
    ]))
    expect(data.commandCounts()).toEqual({ '/clear': 1, '/sc:design': 2 })
    t.dispose()
  })

  it('reads a sub-agent, an entry in full and the images, only under ~/.claude/projects', () => {
    const { t, cwd, dir, data } = home()
    const main = t.write(join(dir, 's1.jsonl'), jsonl([
      { type: 'user', uuid: 'u1', cwd, message: { content: [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AA' } }] }, timestamp: 't1' },
    ]))
    t.write(join(dir, 's1', 'subagents', 'agent-ab12.jsonl'), jsonl([
      { type: 'assistant', uuid: 'x1', isSidechain: true, message: { content: [{ type: 'tool_use', id: 'k1', name: 'Grep', input: { pattern: 'foo' } }] } },
      { type: 'user', uuid: 'x2', isSidechain: true, timestamp: 't2', message: { content: [{ type: 'tool_result', tool_use_id: 'k1', content: 'src/a.ts:3:foo' }] } },
      { type: 'user', uuid: 'x3', isSidechain: true, timestamp: 't3', message: { content: [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'BB' } }] } },
    ]))
    t.write(join(dir, 's1', 'subagents', 'agent-ab12.meta.json'), JSON.stringify({ agentType: 'Explore', description: 'cherche foo' }))
    const sub = data.subagent(main, 'ab12')!
    expect(sub).toMatchObject({ agentType: 'Explore', description: 'cherche foo' })
    expect(sub.events.map((e) => [e.kind, e.ref])).toEqual([['Grep', 'x1:0']])
    expect(data.entryDetail(main, 'x1:0', 'ab12')).toMatchObject({ kind: 'tool', name: 'Grep', output: 'src/a.ts:3:foo' })
    expect(data.images(main).map((i) => i.url)).toEqual(['data:image/png;base64,AA', 'data:image/jpeg;base64,BB'])
    // nothing outside the projects folder, no path in an agent id
    const outside = t.write('elsewhere.jsonl', jsonl([{ type: 'user', uuid: 'u9', message: { content: 'secret' } }]))
    expect(data.entryDetail(outside, 'u9')).toBeNull()
    expect(data.images(outside)).toEqual([])
    expect(data.subagent(main, '../../x')).toBeNull()
    t.dispose()
  })
})
