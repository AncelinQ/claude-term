/** Minimal YAML front matter reader (key: value lines between --- fences). */
export function frontmatter(text: string): Record<string, string> {
  if (!text.startsWith('---')) return {}
  const out: Record<string, string> = {}
  const lines = text.split('\n').slice(1)
  for (const line of lines) {
    if (line.startsWith('---')) break
    const c = line.indexOf(':')
    if (c < 0) continue
    const k = line.slice(0, c).trim()
    let v = line.slice(c + 1).trim()
    if (v.length >= 2 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) v = v.slice(1, -1)
    out[k] = v
  }
  return out
}

/** First non-empty, non-heading line of a markdown body. */
export function firstLine(text: string): string {
  return text.split('\n').find((l) => l.trim() && !l.startsWith('#') && !l.startsWith('---')) ?? ''
}

export const isValidSkillName = (n: string) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(n)
