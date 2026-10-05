/**
 * Interface colours over the theme (pure, tested): an accent and a canvas per mode. The canvas is the window behind
 * the islands, the title strip and the activity bars; the islands, editor and terminal keep the theme's colours, so a
 * VS Code theme still loads unchanged. Ink on the canvas is whichever of the theme's text and background colours
 * reads better on it.
 */

export interface Look { accent?: string; canvas?: string }
export type Looks = { light?: Look; dark?: Look }

/** Built-in looks; "Du thème" is no look at all. */
export const LOOK_PRESETS: { id: string; name: string; light: Look; dark: Look }[] = [
  { id: 'bourgogne', name: 'Bourgogne', light: { accent: '#9c2f47', canvas: '#ecdfe2' }, dark: { accent: '#d0607a', canvas: '#2a1a20' } },
  { id: 'emeraude', name: 'Vert émeraude', light: { accent: '#1f8a63', canvas: '#dfece6' }, dark: { accent: '#45c08f', canvas: '#14251f' } },
  { id: 'marine', name: 'Bleu marine', light: { accent: '#2f5fc4', canvas: '#e0e6f2' }, dark: { accent: '#6b98f2', canvas: '#151d2e' } },
  { id: 'creme', name: 'Crème', light: { accent: '#a8742a', canvas: '#f1e9db' }, dark: { accent: '#e3b86d', canvas: '#262219' } },
  { id: 'argent', name: 'Argent', light: { accent: '#56657a', canvas: '#e4e7ea' }, dark: { accent: '#a3afbf', canvas: '#1e2125' } },
]

/** #rgb, #rrggbb, #rrggbbaa → [r, g, b] 0–255; null for anything else. */
export function rgb(color: string | undefined): [number, number, number] | null {
  const m = color?.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i)
  if (!m) return null
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1].slice(0, 6)
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number]
}

/** WCAG relative luminance (0 black – 1 white). */
export function luminance(color: string): number | null {
  const c = rgb(color)
  if (!c) return null
  const [r, g, b] = c.map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrast(a: string, b: string): number {
  const la = luminance(a), lb = luminance(b)
  if (la === null || lb === null) return 1
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/** The tokens a look replaces over `tokens` (the resolved theme's), for one mode. */
export function lookTokens(look: Look | undefined, tokens: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  if (!look) return out
  if (look.accent && rgb(look.accent)) {
    out['accent'] = look.accent
    out['accent.bg'] = `color-mix(in srgb, ${look.accent} 22%, transparent)`
    out['activity.indicator'] = look.accent
  }
  if (look.canvas && rgb(look.canvas)) {
    out['window.bg'] = look.canvas
    out['activity.bg'] = look.canvas
    const text = tokens['text'], back = tokens['window.bg']
    const ink = text && back && contrast(back, look.canvas) > contrast(text, look.canvas) ? back : text
    if (ink) {
      out['activity.active'] = ink
      out['activity.fg'] = `color-mix(in srgb, ${ink} 60%, ${look.canvas})`
    }
  }
  return out
}
