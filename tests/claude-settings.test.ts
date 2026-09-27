import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { TempDir } from './helpers'
import { ClaudeSettings } from '../src/main/services/claude-settings'

const CMD = "'/Users/j/Library/Application Support/ClaudeTerm/hook.sh'"
const isOurs = (c: string) => c.includes('ClaudeTerm/hook.sh')

describe('ClaudeSettings hooks', () => {
  it('adds our hooks without touching other keys or other hooks', () => {
    const t = new TempDir()
    const p = t.write('settings.json', JSON.stringify({ permissions: { allow: ['Bash(ls)'] }, unknownKey: { a: 1 }, hooks: { Stop: [{ matcher: '', hooks: [{ type: 'command', command: 'say done' }] }] } }))
    const cs = new ClaudeSettings(p)
    const r = cs.read(); if (!r.ok) throw new Error(r.error)
    for (const ev of ['Notification', 'Stop']) cs.setHook(r.data, ev, CMD, true, isOurs)
    cs.write(r.data)
    const out = JSON.parse(readFileSync(p, 'utf8'))
    expect(out.permissions).toEqual({ allow: ['Bash(ls)'] })
    expect(out.unknownKey).toEqual({ a: 1 })
    expect(cs.hookCommands(out, 'Stop')).toEqual(['say done', CMD])
    expect(cs.hookCommands(out, 'Notification')).toEqual([CMD])
    expect(cs.hasHook(out, 'Stop', CMD)).toBe(true)
    t.dispose()
  })
  it('removes every variant of our command and cleans empty groups', () => {
    const t = new TempDir()
    const p = t.write('settings.json', JSON.stringify({ hooks: { Stop: [
      { matcher: '', hooks: [{ type: 'command', command: '/Users/j/Library/Application Support/ClaudeTerm/hook.sh' }] },
      { matcher: '', hooks: [{ type: 'command', command: CMD }, { type: 'command', command: 'other' }] },
    ] } }))
    const cs = new ClaudeSettings(p)
    const r = cs.read(); if (!r.ok) throw new Error(r.error)
    cs.setHook(r.data, 'Stop', CMD, false, isOurs)
    cs.setHook(r.data, 'Notification', CMD, false, isOurs)
    cs.write(r.data)
    const out = JSON.parse(readFileSync(p, 'utf8'))
    expect(out.hooks.Stop).toEqual([{ matcher: '', hooks: [{ type: 'command', command: 'other' }] }])
    expect(out.hooks.Notification).toBeUndefined()
    t.dispose()
  })
  it('drops the hooks key entirely when nothing is left', () => {
    const cs = new ClaudeSettings('/nonexistent')
    const data: any = { hooks: { Stop: [{ matcher: '', hooks: [{ type: 'command', command: CMD }] }] } }
    cs.setHook(data, 'Stop', CMD, false, isOurs)
    expect(data.hooks).toBeUndefined()
  })
  it('refuses unreadable JSON', () => {
    const t = new TempDir()
    const p = t.write('settings.json', '{ not json')
    const r = new ClaudeSettings(p).read()
    expect(r.ok).toBe(false)
    expect(readFileSync(p, 'utf8')).toBe('{ not json')
    t.dispose()
  })
  it('missing file reads as empty', () => {
    expect(new ClaudeSettings('/nonexistent/settings.json').read()).toEqual({ ok: true, data: {} })
  })
})
