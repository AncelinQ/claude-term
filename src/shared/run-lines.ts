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

export interface RunLine {
  /** 1-based line of the ▶ */
  line: number
  label: string
  command: string
  cwd: string
  /** the Scripts tab's item when it lists it (package.json scripts, make targets, shell scripts): runs through it */
  itemId: string
}

const SHELL_LANGS = /^(sh|bash|zsh|shell|console|terminal|shellsession|fish)$/i
const dirOf = (p: string) => p.replace(/[\\/][^\\/]*$/, '')
const baseOf = (p: string) => p.slice(Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\')) + 1)

/**
 * Lines of a file that can be run, for the editor's gutter ▶ (like WebStorm): package.json scripts, Makefile targets,
 * shell commands of Markdown code blocks (```bash, sh, zsh, console…: "$ " prompts removed, console output skipped,
 * "\\" continuations joined), and a shell script itself (first line).
 */
export function runLines(path: string, text: string): RunLine[] {
  const dir = dirOf(path), name = baseOf(path)
  if (name === 'package.json') return packageScriptLines(text).map((l) => ({ line: l.line, label: l.name, command: `npm run ${l.name}`, cwd: dir, itemId: `npm:${dir}:${l.name}` }))
  if (/^(GNUmakefile|makefile|Makefile)$/.test(name)) {
    const out: RunLine[] = [], seen = new Set<string>()
    text.split('\n').forEach((l, i) => { const m = l.match(/^([A-Za-z0-9_.-]+)\s*:(?!=)/); if (m && !m[1].startsWith('.') && !seen.has(m[1])) { seen.add(m[1]); out.push({ line: i + 1, label: m[1], command: `make ${m[1]}`, cwd: dir, itemId: `make:${dir}:${m[1]}` }) } })
    return out
  }
  if (/\.sh$/.test(name)) return text.trim() ? [{ line: 1, label: name, command: `./${name}`, cwd: dir, itemId: `sh:${dir}:${name}` }] : []
  if (/\.(md|markdown)$/i.test(name)) return markdownShellLines(text, path)
  return []
}

function markdownShellLines(text: string, path: string): RunLine[] {
  const out: RunLine[] = []
  const lines = text.split('\n')
  let fence: { marker: string; lang: string } | null = null
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    const f = raw.match(/^\s*(`{3,}|~{3,})\s*([\w-]*)/)
    if (f) {
      if (!fence) fence = { marker: f[1], lang: f[2] }
      else if (raw.trim().startsWith(fence.marker) && raw.trim().replace(/[`~]/g, '') === '') fence = null
      continue
    }
    if (!fence || !SHELL_LANGS.test(fence.lang)) continue
    const consoleBlock = /^(console|terminal|shellsession)$/i.test(fence.lang)
    const m = raw.match(/^\s*(?:[$%]\s+)?(.*)$/)!
    const prompted = /^\s*[$%]\s+/.test(raw)
    if (consoleBlock && !prompted) continue                 // output lines
    let cmd = m[1].trim()
    if (!cmd || cmd.startsWith('#')) continue
    const start = i
    while (cmd.endsWith('\\') && i + 1 < lines.length && !/^\s*(`{3,}|~{3,})/.test(lines[i + 1])) { cmd = cmd.slice(0, -1).trimEnd() + ' ' + lines[++i].trim() }
    out.push({ line: start + 1, label: cmd.length > 40 ? cmd.slice(0, 39) + '…' : cmd, command: cmd, cwd: dirOf(path), itemId: `md:${path}:${start + 1}` })
  }
  return out
}

