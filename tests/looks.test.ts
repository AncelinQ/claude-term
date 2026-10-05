import { describe, it, expect } from 'vitest'
import { contrast, lookTokens, luminance, LOOK_PRESETS, rgb } from '../src/shared/looks'

const dark = { text: '#d4d4d4', 'window.bg': '#1b1c1f', accent: '#e07a3a' }

describe('interface looks', () => {
  it('reads hex colours and their luminance', () => {
    expect(rgb('#fff')).toEqual([255, 255, 255])
    expect(rgb('#11223344')).toEqual([17, 34, 51])
    expect(rgb('red')).toBeNull()
    expect(luminance('#000000')).toBe(0)
    expect(luminance('#ffffff')).toBeCloseTo(1)
    expect(contrast('#000', '#fff')).toBeCloseTo(21)
  })

  it('replaces the accent and the canvas, ink from the theme that reads best on it', () => {
    expect(lookTokens(undefined, dark)).toEqual({})
    const t = lookTokens({ accent: '#45c08f', canvas: '#14251f' }, dark)
    expect(t).toMatchObject({ accent: '#45c08f', 'activity.indicator': '#45c08f', 'window.bg': '#14251f', 'activity.bg': '#14251f', 'activity.active': '#d4d4d4' })
    // a light canvas on a dark theme: the theme's dark background becomes the ink
    expect(lookTokens({ canvas: '#ecdfe2' }, dark)['activity.active']).toBe('#1b1c1f')
    expect(lookTokens({ accent: 'nope' }, dark)).toEqual({})
  })

  it('every preset reads: canvas against its ink, accent against the canvas', () => {
    for (const p of LOOK_PRESETS) {
      expect(contrast(p.dark.canvas!, '#d4d4d4'), p.id).toBeGreaterThan(7)
      expect(contrast(p.light.canvas!, '#1b1c1f'), p.id).toBeGreaterThan(7)
      expect(contrast(p.dark.accent!, p.dark.canvas!), p.id).toBeGreaterThan(3)
      expect(contrast(p.light.accent!, p.light.canvas!), p.id).toBeGreaterThan(3)
    }
  })
})
