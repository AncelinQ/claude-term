/** Claude models as the terminal bubble shows them (pure, tested). */

/** `/model` aliases offered in the bubble (families, so the list does not age with each version) */
export const MODEL_CHOICES = [
  { alias: 'fable', label: 'Fable' },
  { alias: 'opus', label: 'Opus' },
  { alias: 'opus[1m]', label: 'Opus · 1M' },
  { alias: 'sonnet', label: 'Sonnet' },
  { alias: 'sonnet[1m]', label: 'Sonnet · 1M' },
  { alias: 'haiku', label: 'Haiku' },
] as const

/** "claude-opus-5-5" → "Opus 5.5", "claude-haiku-4-5-20251001" → "Haiku 4.5", "Opus 5.5 (1M context)" kept */
export function modelLabel(model: string | undefined): string {
  if (!model) return ''
  const m = /^claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?(\[1m\])?$/i.exec(model)
  if (!m) return model
  const name = m[1][0].toUpperCase() + m[1].slice(1)
  return `${name} ${m[2]}${m[3] ? '.' + m[3] : ''}${m[4] ? ' · 1M' : ''}`
}

/** 1M context when the model or the setting says so, or when the context already exceeds 200k tokens */
export function contextWindow(model: string | undefined, tokens?: number): number {
  return /\[1m\]|1m context|1M/i.test(model ?? '') || (tokens ?? 0) > 200_000 ? 1_000_000 : 200_000
}

/**
 * Context of a session: Claude Code's own figure (status line) when known, else an estimate from the transcript
 * (tokens of the last message / window).
 */
export function contextInfo(o: { statusPercent?: number; tokens?: number; model?: string }): { percent: number; estimated: boolean } | null {
  if (o.statusPercent !== undefined) return { percent: o.statusPercent, estimated: false }
  if (!o.tokens) return null
  return { percent: Math.min(100, Math.round((o.tokens / contextWindow(o.model, o.tokens)) * 100)), estimated: true }
}

/** Which choice matches the running model ("claude-opus-5-5", "Opus 5.5 (1M context)"…) */
export function currentChoice(model: string | undefined): string | undefined {
  if (!model) return undefined
  const fam = MODEL_CHOICES.find((c) => new RegExp(c.alias.replace('[1m]', ''), 'i').test(model))?.alias.replace('[1m]', '')
  if (!fam) return undefined
  return /\[1m\]|1m context|1M/i.test(model) && fam !== 'fable' && fam !== 'haiku' ? fam + '[1m]' : fam
}

/** What to show for a model setting or id: a `/model` alias by its choice label ("opus[1m]" → "Opus · 1M"), an API id readably */
export function modelName(model: string | undefined): string {
  if (!model) return ''
  return MODEL_CHOICES.find((c) => c.alias === model.toLowerCase())?.label ?? modelLabel(model)
}

const family = (m: string) => /fable|opus|sonnet|haiku/i.exec(m)?.[0].toLowerCase()
/**
 * The transcript names the model without its window ("claude-opus-5-5" for an opus[1m] session): the alias the tab
 * asked for, else the default, tells it when it is of the same family.
 */
export function withWindowHint(model: string | undefined, ...hints: (string | undefined)[]): string | undefined {
  if (!model || /\[1m\]|1m context|1M/i.test(model)) return model
  const hint = hints.find((h) => h && family(h) === family(model))
  return hint && /\[1m\]/i.test(hint) ? model + '[1m]' : model
}

// subcommands and flags that do not open an interactive session
const NOT_A_SESSION = /^(update|upgrade|mcp|config|doctor|install|migrate-installer|setup-token|plugin|plugins|agents|auth|--version|-v|--help|-h|-p|--print)$/
/** a shell command line that starts an interactive Claude session ("claude", "claude --resume x"), not "claude update" */
export function isInteractiveClaude(line: string): boolean {
  const words = line.trim().split(/\s+/)
  if (words[0] !== 'claude') return false
  return !words.slice(1).some((w) => NOT_A_SESSION.test(w))
}
