import { describe, it, expect } from 'vitest'
import { encodeProjectPath, parseTranscript, completeLines, diffStats, unifiedDiff, firstUserText, lastAiTitle, isEmptyUpdate } from '../src/shared/claude-format'

const opts = { plansDir: '/Users/j/.claude/plans', home: '/Users/j' }
const jsonl = (objs: object[]) => objs.map((o) => JSON.stringify(o))

describe('project path encoding', () => {
  it('replaces every non-alphanumeric byte', () => {
    expect(encodeProjectPath('/Users/jerome')).toBe('-Users-jerome')
    expect(encodeProjectPath('/Users/jerome/dev/turf-v2')).toBe('-Users-jerome-dev-turf-v2')
    expect(encodeProjectPath('/a b.c_d')).toBe('-a-b-c-d')
    expect(encodeProjectPath('C:\\Users\\j')).toBe('C--Users-j')
  })
})

describe('transcript parsing', () => {
  it('parses tools, usage and metadata', () => {
    const u = parseTranscript(jsonl([
      { type: 'user', timestamp: 't1', message: { role: 'user', content: 'fais un truc' } },
      { type: 'assistant', timestamp: 't2', message: { role: 'assistant', usage: { input_tokens: 100, output_tokens: 20 }, content: [
        { type: 'text', text: 'ok' },
        { type: 'tool_use', id: 'tu1', name: 'Edit', input: { file_path: '/p/a.ts' } },
        { type: 'tool_use', id: 'tu2', name: 'Bash', input: { command: 'ls -la' } },
      ] } },
      { type: 'user', timestamp: 't3', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tu1' }] } },
      { type: 'permission-mode', permissionMode: 'plan' },
      { type: 'attachment', attachment: { type: 'plan_mode', planFilePath: '/Users/j/.claude/plans/x.md' } },
      { type: 'ai-title', aiTitle: 'Un titre' },
    ]), opts)
    expect(u.events.map((e) => e.kind)).toEqual(['user', 'text', 'Edit', 'Bash'])
    expect(u.events[2].file).toBe('/p/a.ts')
    expect(u.events[3].detail).toBe('ls -la')
    expect(u.inputTokens).toBe(100); expect(u.outputTokens).toBe(20)
    expect(u.startedTools.map((t) => t.id)).toEqual(['tu1', 'tu2'])
    expect(u.finishedTools).toEqual(['tu1'])
    expect(u.permissionMode).toBe('plan')
    expect(u.planMode).toBe(true); expect(u.planPath).toBe('/Users/j/.claude/plans/x.md')
    expect(u.aiTitle).toBe('Un titre')
  })
  it('ignores system-style user messages and partial lines', () => {
    const u = parseTranscript(jsonl([{ type: 'user', message: { content: '<command-name>/clear</command-name>' } }]), opts)
    expect(u.events).toHaveLength(0)
    expect(completeLines('{"a":1}\n{"b"')).toEqual({ lines: ['{"a":1}'], rest: '{"b"' })
    expect(isEmptyUpdate(parseTranscript(['{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"x"}]}}'], opts))).toBe(false)
  })
  it('keeps the earliest backup version per file', () => {
    const u = parseTranscript(jsonl([
      { type: 'file-history-snapshot', snapshot: { trackedFileBackups: { 'p/a.ts': { backupFileName: 'a@v2', version: 2, realParentDir: '/x/p' } } } },
      { type: 'file-history-snapshot', snapshot: { trackedFileBackups: { 'p/a.ts': { backupFileName: 'a@v1', version: 1, realParentDir: '/x/p' } } } },
    ]), opts)
    expect(u.backups['/x/p/a.ts']).toEqual({ name: 'a@v1', version: 1 })
  })
  it('parses bash edit diffs', () => {
    const u = parseTranscript(jsonl([{ type: 'user', message: { content: 'x' }, toolUseResult: { bashEditDiff: { files: [{ filePath: '/p/f', hunks: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: ['-a', '+b'] }] }] } } }]), opts)
    expect(u.bashDiffs['/p/f'][0]).toBe('@@ -1,1 +1,1 @@\n-a\n+b\n')
    expect(u.events.find((e) => e.kind === 'Edit (bash)')?.file).toBe('/p/f')
  })
  it('titles', () => {
    expect(firstUserText(jsonl([{ type: 'user', message: { content: '<local-command>' } }, { type: 'user', message: { content: 'hello\nworld' } }]))).toBe('hello world')
    expect(lastAiTitle(jsonl([{ type: 'ai-title', aiTitle: 'A' }, { type: 'ai-title', aiTitle: 'B' }]))).toBe('B')
  })
})

describe('diffs', () => {
  it('unified diff and stats', () => {
    const d = unifiedDiff('a\nb\nc\nd\ne\nf\ng\n', 'a\nb\nc\nX\ne\nf\ng\n')
    expect(d).toContain('@@ -1,7 +1,7 @@')
    expect(d).toContain('-d\n+X')
    expect(diffStats(d)).toEqual([1, 1])
    expect(unifiedDiff('same\n', 'same\n')).toBe('')
    expect(diffStats(unifiedDiff('', 'new\nfile\n'))).toEqual([2, 0])
  })
})
