/**
 * Lines of package.json that can be run (the editor's gutter ▶, like WebStorm): each key of the top-level "scripts"
 * object with its 1-based line. A small scanner rather than JSON.parse, so it works while the file is being edited
 * (invalid JSON elsewhere) and knows where each key is.
 */
export function packageScriptLines(text: string): { name: string; line: number }[] {
  const out: { name: string; line: number }[] = []
  let i = 0, line = 1, depth = 0
  let inScripts = false, scriptsDepth = -1, lastKey: { s: string; line: number } | null = null
  const readString = (): string => {
    let s = ''
    i++   // opening quote
    while (i < text.length && text[i] !== '"') {
      if (text[i] === '\\') { s += text[i + 1] ?? ''; i += 2; continue }
      if (text[i] === '\n') line++
      s += text[i++]
    }
    i++   // closing quote
    return s
  }
  while (i < text.length) {
    const c = text[i]
    if (c === '\n') { line++; i++; continue }
    if (c === '"') {
      const start = line, s = readString()
      // a key is a string followed by ':'
      let j = i; while (j < text.length && /\s/.test(text[j])) j++
      if (text[j] === ':') {
        if (inScripts && depth === scriptsDepth + 1) out.push({ name: s, line: start })
        lastKey = { s, line: start }
      }
      continue
    }
    if (c === '{' || c === '[') {
      depth++
      if (c === '{' && depth === 2 && lastKey?.s === 'scripts' && !inScripts && scriptsDepth < 0) { inScripts = true; scriptsDepth = 1 }
      i++; continue
    }
    if (c === '}' || c === ']') {
      if (inScripts && depth === scriptsDepth + 1) inScripts = false
      depth--; i++; continue
    }
    i++
  }
  return out
}

/** Lanceur item ids compared across path spellings: separators, Windows drive letter case, "/./" */
export const normId = (id: string) => id.replace(/\\/g, '/').replace(/\/\.(?=\/)/g, '').replace(/^npm:([a-z]):/i, (_m, d: string) => `npm:${d.toLowerCase()}:`)
