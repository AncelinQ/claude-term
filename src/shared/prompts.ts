/** Saved prompts (pure, tested): their variables and how their text reaches Claude. */

export interface SavedPrompt {
  id: string
  name: string
  text: string
  /** send: typed then Enter; insert: typed, left to complete */
  mode: 'send' | 'insert'
  /** a shortcut of the keymap's form ("Mod+Alt+1"); '' none on purpose, undefined never given (numberPrompts) */
  shortcut?: string
}

/**
 * The keys prompts get by themselves: Ctrl+Shift+2 to 9, in their list's order (Ctrl+Shift+1 opens the list;
 * Ctrl+Shift+0 is left alone, Windows takes it to switch input method once several languages are installed).
 * Ctrl rather than ⌘ on macOS, whose ⌘⇧3 to 5 take screenshots.
 */
export const PROMPT_KEYS = ['2', '3', '4', '5', '6', '7', '8', '9'].map((d) => 'Ctrl+Shift+' + d)

/**
 * Gives a key to the prompts that never had one (`shortcut` undefined): the first of PROMPT_KEYS that neither another
 * prompt nor one of `taken` (the app's shortcuts) holds. None left: '' (no key, and never numbered again). The key is
 * then the prompt's own, changed or removed like any shortcut. null when nothing changes.
 */
export function numberPrompts(prompts: SavedPrompt[], taken: string[], same: (a: string, b: string) => boolean): SavedPrompt[] | null {
  if (!prompts.some((p) => p.shortcut === undefined)) return null
  const held = [...taken, ...prompts.flatMap((p) => (p.shortcut ? [p.shortcut] : []))]
  return prompts.map((p) => {
    if (p.shortcut !== undefined) return p
    const key = PROMPT_KEYS.find((k) => !held.some((h) => same(h, k))) ?? ''
    if (key) held.push(key)
    return { ...p, shortcut: key }
  })
}

/** The variables, under their French names and English ones. */
const VARS: Record<string, 'selection' | 'file' | 'branch' | 'input'> = {
  'sélection': 'selection', selection: 'selection', 'fichier': 'file', file: 'file', 'branche': 'branch', branch: 'branch', 'saisie': 'input', input: 'input',
}
export type PromptValues = Partial<Record<'selection' | 'file' | 'branch' | 'input', string>>
export const PROMPT_VARIABLES = ['{sélection}', '{fichier}', '{branche}', '{saisie}']

const RE = /\{(sélection|selection|fichier|file|branche|branch|saisie|input)\}/g

/** The variables a text uses. */
export function promptVariables(text: string): ('selection' | 'file' | 'branch' | 'input')[] {
  return [...new Set([...text.matchAll(RE)].map((m) => VARS[m[1]]))]
}

const WITH_BLANK = /(\s*)\{(sélection|selection|fichier|file|branche|branch|saisie|input)\}/g

/**
 * The text with its variables replaced, or the ones that have no value (the prompt is then not sent). {saisie} may be
 * left empty on purpose: it goes, with the blank before it (`/sc:brainstorm {saisie}` → `/sc:brainstorm`).
 */
export function expandPrompt(text: string, values: PromptValues): { text: string } | { missing: string[] } {
  const missing = promptVariables(text).filter((v) => (v === 'input' ? values.input === undefined : !values[v]))
  if (missing.length) return { missing }
  return { text: text.replace(WITH_BLANK, (_m, blank: string, name: string) => { const v = values[VARS[name]]!; return v === '' ? '' : blank + v }) }
}

/**
 * What to type for a prompt: a bracketed paste (several lines stay one prompt instead of being sent line by line), then
 * Enter apart for `send` (with the text, Claude Code takes the Enter as part of the paste).
 */
export function promptKeys(text: string, mode: SavedPrompt['mode']): { paste: string; enter: boolean } {
  return { paste: `\x1b[200~${text.replace(/\x1b\[20[01]~/g, '')}\x1b[201~`, enter: mode === 'send' }
}

/** Slash commands typed often in recent sessions, not yet saved: suggestions to keep as prompts. */
export function frequentCommands(counts: Record<string, number>, saved: SavedPrompt[], min = 3): { command: string; count: number }[] {
  const have = new Set(saved.map((p) => p.text.trim().split(/\s/)[0]))
  return Object.entries(counts).filter(([c, n]) => n >= min && !have.has(c) && !BUILT_IN.has(c.slice(1))).sort((a, b) => b[1] - a[1]).map(([command, count]) => ({ command, count }))
}

/** Claude Code's own commands: not worth a saved prompt. */
const BUILT_IN = new Set(['clear', 'compact', 'model', 'effort', 'exit', 'quit', 'resume', 'continue', 'login', 'logout', 'help', 'cost', 'status', 'config', 'permissions', 'memory', 'init', 'doctor', 'mcp', 'agents', 'hooks', 'ide', 'theme', 'vim', 'bug', 'review', 'rewind', 'context', 'usage', 'add-dir', 'plugin', 'output-style', 'statusline', 'terminal-setup', 'upgrade', 'release-notes', 'export', 'privacy-settings', 'todos', 'bashes', 'fast'])
