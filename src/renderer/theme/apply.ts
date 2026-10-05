import { cssVar, type ResolvedTheme } from '@shared/theme'
import { lookTokens, type Look } from '@shared/looks'

const UI_FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'

/** Writes every token as a CSS custom property on :root, the look's over the theme's, and the interface font. */
export function applyTheme(t: ResolvedTheme, o: { look?: Look; uiFont?: string } = {}) {
  const root = document.documentElement
  const tokens = { ...t.tokens, ...lookTokens(o.look, t.tokens) }
  for (const [k, v] of Object.entries(tokens)) root.style.setProperty(cssVar(k), v)
  t.ansi.forEach((c, i) => root.style.setProperty(`--ct-ansi-${i}`, c))
  root.style.setProperty('--ct-font-ui', o.uiFont ? `"${o.uiFont.replace(/"/g, '')}", ${UI_FONT}` : UI_FONT)
  root.dataset.theme = t.type
}
