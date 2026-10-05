/**
 * Full-text search over the transcripts (pure, tested): ripgrep finds candidate lines with an accent-blind pattern, each
 * is then read as a record and kept when the prompt or Claude's text holds every word, accents and case aside.
 */
import { fold } from './palette'
import { textOf } from './claude-format'

const ACCENTS: Record<string, string> = {
  a: 'aàâäáãå', c: 'cç', e: 'eéèêë', i: 'iîïíì', n: 'nñ', o: 'oôöóòõ', u: 'uùûüú', y: 'yÿý', oe: 'œ', ae: 'æ',
}

/** The query's words, folded (lowercase, no accents), two characters at least. */
export const searchWords = (query: string): string[] => [...new Set(fold(query).split(/\s+/).filter((w) => w.length >= 2))]

/** A regex (for ripgrep, case-insensitive) matching `word` whatever its accents: "ete" matches "été". */
export function accentPattern(word: string): string {
  return [...word].map((c) => (ACCENTS[c] ? `[${ACCENTS[c]}]` : c.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&'))).join('')
}

/** What a transcript record says in words: the user's prompt or Claude's text (tool calls and results left out). */
export function recordText(o: any): { role: 'user' | 'assistant'; text: string } | null {
  if (o?.isSidechain || o?.isMeta) return null
  if (o?.type === 'user') {
    const t = textOf(o.message?.content)
    return t && !t.startsWith('<') ? { role: 'user', text: t } : null
  }
  if (o?.type === 'assistant' && Array.isArray(o.message?.content)) {
    const t = o.message.content.filter((c: any) => c?.type === 'text' && typeof c.text === 'string').map((c: any) => c.text).join('\n')
    return t ? { role: 'assistant', text: t } : null
  }
  return null
}

/** `text` holds every word (folded); the snippet is around the first one, about 160 characters. */
export function matchText(text: string, words: string[]): string | null {
  const f = fold(text)
  if (!words.every((w) => f.includes(w))) return null
  const at = f.indexOf(words[0])
  const from = Math.max(0, at - 70), to = Math.min(text.length, at + 90)
  return (from > 0 ? '…' : '') + text.slice(from, to).replace(/\s+/g, ' ').trim() + (to < text.length ? '…' : '')
}
