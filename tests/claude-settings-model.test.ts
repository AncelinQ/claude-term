import { describe, it, expect } from 'vitest'
import { getPath, setPath, hookEntries, addHook, removeHook, setHookCommand, setHookMatcher, setHookEvent } from '../src/shared/claude-settings-model'

describe('settings model paths', () => {
  it('sets nested values, removes with undefined and prunes empty parents', () => {
    let r = setPath({ other: 1 }, 'permissions.defaultMode', 'plan')
    expect(r).toEqual({ other: 1, permissions: { defaultMode: 'plan' } })
    expect(getPath(r, 'permissions.defaultMode')).toBe('plan')
    r = setPath(r, 'permissions.allow', ['Bash(ls)'])
    r = setPath(r, 'permissions.defaultMode', undefined)
    expect(r.permissions).toEqual({ allow: ['Bash(ls)'] })
    r = setPath(r, 'permissions.allow', undefined)
    expect(r).toEqual({ other: 1 })
    expect(getPath({}, 'a.b.c')).toBeUndefined()
  })
})

describe('hook entries', () => {
  const base = { hooks: { Stop: [{ matcher: '', hooks: [{ type: 'command', command: 'say done', timeout: 5 }, { type: 'prompt', prompt: 'x' }] }], PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'lint' }] }] }, keep: true }
  it('lists command hooks only and edits in place, preserving extra fields', () => {
    const entries = hookEntries(base)
    expect(entries).toEqual([
      { event: 'PreToolUse', group: 0, index: 0, matcher: 'Bash', command: 'lint' },
      { event: 'Stop', group: 0, index: 0, matcher: '', command: 'say done' },
    ])
    const r = setHookCommand(base, entries[1], 'say finished')
    expect(r.hooks.Stop[0].hooks[0]).toEqual({ type: 'command', command: 'say finished', timeout: 5 })
    expect(r.hooks.Stop[0].hooks[1]).toEqual({ type: 'prompt', prompt: 'x' })   // non-command hook kept
    expect(r.keep).toBe(true)
    expect(base.hooks.Stop[0].hooks[0].command).toBe('say done')   // input untouched
  })
  it('matcher, remove, add, move', () => {
    let r = setHookMatcher(base, hookEntries(base)[0], '')
    expect(r.hooks.PreToolUse[0].matcher).toBeUndefined()
    r = removeHook(base, hookEntries(base)[0])
    expect(r.hooks.PreToolUse).toBeUndefined()
    r = addHook(r, 'Notification', 'permission', 'notify')
    expect(r.hooks.Notification).toEqual([{ matcher: 'permission', hooks: [{ type: 'command', command: 'notify' }] }])
    r = setHookEvent(r, hookEntries(r).find((e) => e.event === 'Notification')!, 'SessionStart')
    expect(r.hooks.Notification).toBeUndefined()
    expect(r.hooks.SessionStart[0].hooks[0].command).toBe('notify')
    // removing the last command hook of a group keeps a non-command sibling; an empty group and event are dropped
    const stop = removeHook(r, hookEntries(r).find((e) => e.event === 'Stop')!)
    expect(stop.hooks.Stop[0].hooks).toEqual([{ type: 'prompt', prompt: 'x' }])
    expect(removeHook({ hooks: { X: [{ hooks: [{ type: 'command', command: 'c' }] }] } }, { event: 'X', group: 0, index: 0, matcher: '', command: 'c' }).hooks).toBeUndefined()
  })
})
