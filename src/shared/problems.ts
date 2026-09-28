/**
 * The center bottom block's Errors and TODO tabs (pure, tested): reading the output of the project's checkers
 * (tsc, ESLint), finding TODO / FIXME / HACK / XXX, the trees shown and the prompts for Claude.
 */
import type { ViewAction, ViewItem } from './plugins'

export interface Diagnostic { file: string; line: number; col: number; severity: 'error' | 'warning'; message: string; source: 'tsc' | 'eslint'; code?: string }
export interface Todo { file: string; line: number; tag: 'TODO' | 'FIXME' | 'HACK' | 'XXX'; text: string }

const abs = (cwd: string, p: string) => (p.startsWith('/') || /^[a-z]:[\\/]/i.test(p) ? p : cwd.replace(/[\\/]+$/, '') + '/' + p.replace(/^\.\//, ''))

/** `tsc --pretty false` output: "file(line,col): error TS2322: message" (+ indented continuation lines) */
export function parseTscOutput(text: string, cwd: string): Diagnostic[] {
  const out: Diagnostic[] = []
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^(.+?)\((\d+),(\d+)\): (error|warning) (TS\d+): (.*)$/)
    if (m) { out.push({ file: abs(cwd, m[1]), line: +m[2], col: +m[3], severity: m[4] as 'error' | 'warning', code: m[5], message: m[6], source: 'tsc' }); continue }
    if (/^\s+\S/.test(line) && out.length) out[out.length - 1].message += '\n' + line.trim()
  }
  return out
}

/** `eslint -f json` output: [{ filePath, messages: [{ line, column, severity (1 warn, 2 error), message, ruleId }] }] */
export function parseEslintJson(text: string): Diagnostic[] {
  let d: any
  try { d = JSON.parse(text) } catch { return [] }
  if (!Array.isArray(d)) return []
  return d.flatMap((f: any) => (Array.isArray(f?.messages) ? f.messages : []).filter((m: any) => m && m.severity > 0).map((m: any): Diagnostic => ({
    file: String(f.filePath), line: m.line ?? 1, col: m.column ?? 1, severity: m.severity === 2 ? 'error' : 'warning', message: String(m.message ?? ''), source: 'eslint', ...(m.ruleId ? { code: String(m.ruleId) } : {}),
  })))
}

const TODO_RE = /\b(TODO|FIXME|HACK|XXX)\b(?:\([^)]*\))?[:\s-]*(.*)$/
/** TODO-like markers of a file, one per line, with the text after them (comment closers removed) */
export function scanTodos(text: string, file: string): Todo[] {
  const out: Todo[] = []
  text.split('\n').forEach((line, i) => {
    const m = line.match(TODO_RE)
    if (!m) return
    // the marker must be in a comment or a Markdown / text line, not an identifier like TODO_LIST
    const before = line.slice(0, m.index)
    if (!/(\/\/|#|\/\*|\*|<!--|--|;)\s*$|^\s*[-*]?\s*$|^\s*\[.\]\s*$/.test(before) && !/\.(md|markdown|txt)$/i.test(file)) return
    out.push({ file, line: i + 1, tag: m[1] as Todo['tag'], text: m[2].replace(/\s*(\*\/|-->)\s*$/, '').trim() })
  })
  return out
}

// MARK: trees

const FIX: ViewAction = { id: 'fix', title: 'Corriger avec Claude', icon: 'claude' }
const ASK: ViewAction = { id: 'ask', title: 'Demander à Claude', icon: 'claude' }
const rel = (root: string, f: string) => (f.startsWith(root) ? f.slice(root.length).replace(/^[\\/]/, '') : f)

/** Errors tab: files (errors first) → problems "line:col message", source and code in the detail. Leaf ids are
 * `perr:<index in diags>` (the panel finds the problem back), file ids `pfile:<path>` (their open state is kept). */
export function problemsTree(diags: Diagnostic[], root: string): ViewItem[] {
  const byFile = new Map<string, (Diagnostic & { i: number })[]>()
  diags.forEach((d, i) => (byFile.get(d.file) ?? byFile.set(d.file, []).get(d.file)!).push({ ...d, i }))
  const files = [...byFile.entries()].sort(([a, da], [b, db]) => (db.some((x) => x.severity === 'error') ? 1 : 0) - (da.some((x) => x.severity === 'error') ? 1 : 0) || a.localeCompare(b))
  return files.map(([file, list]) => {
    const errors = list.filter((d) => d.severity === 'error').length
    return {
      id: 'pfile:' + file, label: rel(root, file), file, expanded: true, extra: errors ? `${errors} ✗` : `${list.length} ⚠`, actions: [FIX],
      children: list.sort((a, b) => a.line - b.line || a.col - b.col).map((d) => ({
        id: `perr:${d.i}`, label: `${d.line}:${d.col}  ${d.message.split('\n')[0]}`, detail: [d.source, d.code].filter(Boolean).join(' '),
        icon: d.severity === 'error' ? 'x' : 'info', color: d.severity === 'error' ? 'badge.error' : 'badge.warn', actions: [FIX],
      })),
    }
  })
}

/** TODO tab: files → markers "line  TAG text" (leaf ids `todo:<index in todos>`) */
export function todosTree(todos: Todo[], root: string): ViewItem[] {
  const byFile = new Map<string, (Todo & { i: number })[]>()
  todos.forEach((t, i) => (byFile.get(t.file) ?? byFile.set(t.file, []).get(t.file)!).push({ ...t, i }))
  return [...byFile.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([file, list]) => ({
    id: 'todofile:' + file, label: rel(root, file), file, expanded: true, extra: String(list.length),
    children: list.map((t) => ({ id: `todo:${t.i}`, label: `${t.line}  ${t.text || t.tag}`, detail: t.tag, icon: t.tag === 'FIXME' || t.tag === 'XXX' ? 'x' : t.tag === 'HACK' ? 'info' : 'list', color: t.tag === 'FIXME' || t.tag === 'XXX' ? 'badge.error' : t.tag === 'HACK' ? 'badge.warn' : 'badge.info', actions: [ASK] })),
  }))
}

// MARK: prompts (typed in the Claude tab, not sent)

export function fixPrompt(diags: Diagnostic[], root: string): string {
  const files = [...new Set(diags.map((d) => d.file))]
  const lines = diags.map((d) => `- ${rel(root, d.file)}:${d.line}:${d.col} ${d.code ? `(${d.source} ${d.code}) ` : `(${d.source}) `}${d.message.replace(/\n/g, ' ')}`)
  const what = diags.length === 1 ? 'cette erreur' : `ces ${diags.length} erreurs`
  return `Corrige ${what}${files.length === 1 ? ` de ${rel(root, files[0])}` : ''} :\n${lines.join('\n')}\n\nCorrige la cause (pas seulement le symptôme), puis revérifie.`
}

export function todoPrompt(t: Todo, root: string): string {
  return `Dans ${rel(root, t.file)}, ligne ${t.line} : « ${t.tag}${t.text ? ' ' + t.text : ''} ». Traite ce point, ou dis-moi ce qu'il faut décider avant.`
}
