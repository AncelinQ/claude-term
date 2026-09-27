import { describe, it, expect } from 'vitest'
import { ACTIONS, parse, matches, fromEvent, label, binding, conflicts } from '../src/shared/keymap'
const ev = (key: string, code: string, m: Partial<{ metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean }> = {}) => ({ key, code, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...m })

describe('keymap', () => {
  it('JetBrains defaults, no conflicts by default', () => {
    expect(binding('editor.action.formatDocument', {})).toBe('Mod+Alt+L')
    expect(binding('editor.action.formatDocument', { 'editor.action.formatDocument': 'Mod+Shift+F' })).toBe('Mod+Shift+F')
    expect(binding('nope', {})).toBe('')
    expect(conflicts({})).toEqual({})
    expect(conflicts({ 'app.git': 'Mod+T' })).toMatchObject({ 'app.git': ['app.newShell'], 'app.newShell': ['app.git'] })
    expect(new Set(ACTIONS.map((a) => a.id)).size).toBe(ACTIONS.length)
  })
  it('parse and match on macOS and Windows, composed keys fall back to the physical key', () => {
    expect(parse('Mod+Shift+L')).toEqual({ mod: true, ctrl: false, alt: false, shift: true, key: 'l' })
    expect(parse('')).toBeNull(); expect(parse('Mod+')).toBeNull(); expect(parse('Hyper+L')).toBeNull()
    expect(matches('Mod+Alt+L', ev('¬', 'KeyL', { metaKey: true, altKey: true }), true)).toBe(true)
    expect(matches('Mod+Alt+L', ev('l', 'KeyL', { ctrlKey: true, altKey: true }), false)).toBe(true)
    expect(matches('Mod+Alt+L', ev('l', 'KeyL', { metaKey: true }), true)).toBe(false)
    expect(matches('Mod+/', ev('/', 'Slash', { metaKey: true }), true)).toBe(true)
    expect(matches('Mod+1', ev('&', 'Digit1', { metaKey: true }), true)).toBe(true)
    expect(matches('Ctrl+Space', ev(' ', 'Space', { ctrlKey: true }), true)).toBe(true)
    expect(matches('Alt+Shift+ArrowUp', ev('ArrowUp', 'ArrowUp', { altKey: true, shiftKey: true }), true)).toBe(true)
    expect(matches('Bad+X', ev('x', 'KeyX'), true)).toBe(false)
  })
  it('recorder and labels', () => {
    expect(fromEvent(ev('Meta', 'MetaLeft', { metaKey: true }), true)).toBeNull()
    expect(fromEvent(ev('¬', 'KeyL', { metaKey: true, altKey: true }), true)).toBe('Mod+Alt+L')
    expect(fromEvent(ev('g', 'KeyG', { ctrlKey: true }), true)).toBe('Ctrl+G')
    expect(fromEvent(ev('l', 'KeyL', { ctrlKey: true, shiftKey: true }), false)).toBe('Mod+Shift+L')
    expect(fromEvent(ev('F6', 'F6', { shiftKey: true }), true)).toBe('Shift+F6')
    expect(fromEvent(ev('/', 'Slash', { metaKey: true }), true)).toBe('Mod+/')
    expect(label('Mod+Alt+L', true)).toBe('⌥⌘L'); expect(label('Ctrl+Shift+ArrowUp', true)).toBe('⌃⇧↑')
    expect(label('Mod+Alt+L', false)).toBe('Ctrl+Alt+L'); expect(label('Mod+Backspace', false)).toBe('Ctrl+Backspace'); expect(label('', true)).toBe('—')
  })
})
