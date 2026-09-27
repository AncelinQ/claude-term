import { cssVar, type ResolvedTheme } from '@shared/theme'

/** Writes every token as a CSS custom property on :root. */
export function applyTheme(t: ResolvedTheme) {
  const root = document.documentElement
  for (const [k, v] of Object.entries(t.tokens)) root.style.setProperty(cssVar(k), v)
  t.ansi.forEach((c, i) => root.style.setProperty(`--ct-ansi-${i}`, c))
  root.dataset.theme = t.type
}
