import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolveTheme, cssVar, fromVSCode, TOKEN_FALLBACKS, type ThemeSpec } from '../src/shared/theme'

const dark = JSON.parse(readFileSync('resources/themes/claudeterm-dark.json', 'utf8')) as ThemeSpec
const light = JSON.parse(readFileSync('resources/themes/claudeterm-light.json', 'utf8')) as ThemeSpec

describe('theme resolution', () => {
  it('built-in themes define every token (directly or through a fallback)', () => {
    for (const spec of [dark, light]) {
      const r = resolveTheme(spec, spec)
      for (const t of Object.keys(TOKEN_FALLBACKS)) expect(r.tokens[t], t).not.toBe('#ff00ff')
      expect(r.ansi).toHaveLength(16)
      expect(r.ansi.every((c) => /^#[0-9a-f]{6}$/i.test(c))).toBe(true)
    }
  })
  it('a partial theme falls back to the base for missing tokens', () => {
    const spec: ThemeSpec = { id: 'x', name: 'x', type: 'dark', colors: { 'editor.background': '#000000' } }
    const r = resolveTheme(spec, dark)
    expect(r.tokens['editor.bg']).toBe('#000000')
    expect(r.tokens['window.bg']).toBe('#000000')      // derived from editor.background
    expect(r.tokens['accent']).toBe(dark.colors['focusBorder'])
    expect(r.tokenColors.length).toBeGreaterThan(0)     // inherited
  })
  it('own tokens win over VS Code fallbacks', () => {
    const spec: ThemeSpec = { id: 'x', name: 'x', type: 'dark', colors: { 'island.bg': '#123456', 'sideBar.background': '#654321' } }
    expect(resolveTheme(spec, dark).tokens['island.bg']).toBe('#123456')
  })
  it('imports a VS Code theme', () => {
    const t = fromVSCode({ name: 'Monokai', type: 'vs-dark', colors: { 'editor.background': '#272822' }, tokenColors: [{ scope: 'comment', settings: { foreground: '#75715e' } }] }, 'monokai')
    expect(t.type).toBe('dark')
    expect(resolveTheme(t, dark).tokens['terminal.bg']).toBe('#272822')
  })
  it('css variable names', () => {
    expect(cssVar('island.header.bg')).toBe('--ct-island-header-bg')
  })
})
