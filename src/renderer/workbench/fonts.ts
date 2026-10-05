/** Monospace fonts installed on this machine: Local Font Access API (allowed by main), monospace detected by glyph widths. */
const FALLBACK = ['JetBrains Mono', 'SF Mono', 'Menlo', 'Monaco', 'Fira Code', 'Cascadia Code', 'Consolas', 'Source Code Pro', 'IBM Plex Mono', 'Hack', 'Ubuntu Mono', 'DejaVu Sans Mono', 'Roboto Mono', 'Courier New']
let cache: string[] | null = null

function isMono(family: string, ctx: CanvasRenderingContext2D): boolean {
  ctx.font = `20px "${family}"`
  const i = ctx.measureText('iiiiiiiiii').width, m = ctx.measureText('mmmmmmmmmm').width
  return i > 0 && Math.abs(i - m) < 0.5
}
function installed(family: string, ctx: CanvasRenderingContext2D): boolean {
  ctx.font = '20px monospace'; const a = ctx.measureText('mmmmmiiiii00000').width
  ctx.font = `20px "${family}", monospace`; const b = ctx.measureText('mmmmmiiiii00000').width
  ctx.font = '20px serif'; const c = ctx.measureText('mmmmmiiiii00000').width
  ctx.font = `20px "${family}", serif`; const d = ctx.measureText('mmmmmiiiii00000').width
  return a !== b || c !== d
}

const UI_FALLBACK = ['Segoe UI', 'Inter', 'SF Pro Text', 'Helvetica Neue', 'Roboto', 'Noto Sans', 'Ubuntu', 'Cantarell', 'Open Sans', 'Arial']
let uiCache: string[] | null = null

/** Proportional fonts installed (the interface font): Local Font Access, monospace and symbol fonts left out. */
export async function installedUiFonts(): Promise<string[]> {
  if (uiCache) return uiCache
  await document.fonts.ready
  const ctx = document.createElement('canvas').getContext('2d')!
  let families: string[] = []
  try {
    const q = (window as any).queryLocalFonts as (() => Promise<{ family: string }[]>) | undefined
    if (q) families = [...new Set((await q()).map((f) => f.family))]
  } catch { /* permission denied or unsupported */ }
  const symbolic = /wingdings|webdings|symbol|dingbat|emoji|braille|ayuthaya|marlett/i
  const out = families.length ? families.filter((f) => !symbolic.test(f) && !isMono(f, ctx)) : UI_FALLBACK.filter((f) => installed(f, ctx))
  uiCache = out.sort((a, b) => a.localeCompare(b))
  return uiCache
}

export async function installedMonoFonts(): Promise<string[]> {
  if (cache) return cache
  await document.fonts.ready
  const ctx = document.createElement('canvas').getContext('2d')!
  let families: string[] = []
  try {
    const q = (window as any).queryLocalFonts as (() => Promise<{ family: string }[]>) | undefined
    if (q) families = [...new Set((await q()).map((f) => f.family))]
  } catch { /* permission denied or unsupported */ }
  const symbolic = /wingdings|webdings|symbol|dingbat|emoji|braille|ayuthaya/i
  const out = families.length ? families.filter((f) => !symbolic.test(f) && isMono(f, ctx)) : FALLBACK.filter((f) => installed(f, ctx))
  cache = out.sort((a, b) => a.localeCompare(b))
  return cache
}
