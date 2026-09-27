/** Monospace fonts present on this machine (detected through the font loading API, no native call). */
const CANDIDATES = [
  'JetBrains Mono', 'SF Mono', 'Menlo', 'Monaco', 'Fira Code', 'Cascadia Code', 'Cascadia Mono', 'Consolas', 'Source Code Pro',
  'IBM Plex Mono', 'Hack', 'Ubuntu Mono', 'DejaVu Sans Mono', 'Roboto Mono', 'Inconsolata', 'Victor Mono', 'Iosevka', 'Geist Mono',
  'Commit Mono', 'Berkeley Mono', 'MonoLisa', 'Operator Mono', 'PT Mono', 'Courier New', 'Andale Mono', 'Liberation Mono', 'Noto Sans Mono',
]
let cache: string[] | null = null
export async function installedMonoFonts(): Promise<string[]> {
  if (cache) return cache
  await document.fonts.ready
  const probe = (name: string) => {
    // a font that is not installed falls back to the generic family: compare rendered widths
    const c = document.createElement('canvas').getContext('2d')!
    c.font = `20px monospace`; const w0 = c.measureText('mmmmmmmmmmiiiiiiiiii0000000000').width
    c.font = `20px "${name}", monospace`; const w1 = c.measureText('mmmmmmmmmmiiiiiiiiii0000000000').width
    c.font = `20px serif`; const s0 = c.measureText('mmmmmmmmmmiiiiiiiiii0000000000').width
    c.font = `20px "${name}", serif`; const s1 = c.measureText('mmmmmmmmmmiiiiiiiiii0000000000').width
    return w1 !== w0 || s1 !== s0
  }
  cache = CANDIDATES.filter(probe)
  return cache
}
