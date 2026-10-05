/**
 * Claude Code's screen while the bubble drives its pickers: `/model`'s list and `/effort`'s slider (pure, tested).
 * Only their `s` key applies a choice to the session without making it the default of the next ones; these functions
 * tell where the screen is, so that nothing is ever confirmed blind. They read Claude Code's English labels (v2.1.289):
 * a label that changes stops the gesture, nothing changed.
 */

/** A screen row, and for each character (by code point) whether it is dimmed. */
export interface ScreenRow { text: string; dim: boolean[] }

/** `/model`'s list is open. */
export function isModelPicker(lines: readonly string[]): boolean {
  return lines.some((l) => l.includes('s to use this session only'))
}

/**
 * Claude Code asks to confirm a model change in a conversation already started (the new model re-reads the whole
 * history at the next message): the user's answer, who pays for it.
 */
export function isSwitchConfirm(lines: readonly string[]): boolean {
  return lines.some((l) => l.trim() === 'Switch model?') && lines.some((l) => /❯\s*1\.\s+Yes, switch to/.test(l))
}

/** The model on the highlighted line of the list, without its check mark: "Opus 5.5". */
export function highlightedModel(lines: readonly string[]): string | undefined {
  for (const l of lines) {
    const m = /^\s*❯\s*\d+\.\s+(.+?)(?:\s{2,}|$)/.exec(l)
    if (m?.[1]) return m[1].replace(/\s*✔\s*$/, '').trim()
  }
  return undefined
}

/** Whether a line of the list is the bubble's choice: a family ("opus"), with the 1M window or not ("opus[1m]"). */
export function isChoice(name: string, alias: string): boolean {
  const family = alias.replace(/\[1m\]$/i, '')
  return new RegExp(`^${family}\\b`, 'i').test(name) && /\b1M\b/i.test(name) === /\[1m\]$/i.test(alias)
}

/** `/effort`'s slider: its levels from left to right, and the index of the one under ▲; nothing when not on screen. */
export function effortSlider(lines: readonly string[]): { levels: string[]; current: number } | undefined {
  if (!lines.some((l) => l.includes('s for this session only'))) return undefined
  const markerRow = lines.findIndex((l) => l.includes('▲'))
  const scale = lines[markerRow + 1]
  if (markerRow < 0 || scale === undefined) return undefined
  const marker = [...lines[markerRow]].indexOf('▲')
  const words = [...scale.matchAll(/\S+/g)].map((m) => ({ word: m[0], start: m.index! }))
  if (words.length < 2) return undefined
  // the marker falls under its level, or nearest to its middle
  const distance = (w: { word: string; start: number }) => {
    const end = w.start + w.word.length - 1
    return marker >= w.start && marker <= end ? 0 : Math.abs(marker - (w.start + end) / 2)
  }
  let current = 0
  words.forEach((w, i) => { if (distance(w) < distance(words[current])) current = i })
  return { levels: words.map((w) => w.word), current }
}

/**
 * What was typed on Claude Code's input line: the line starting with ❯ right under a rule, its dimmed characters left
 * out (a suggestion like `Try "…"`). Nothing when the line is not on screen: a permission request or an open menu
 * takes its place, and typing there would answer it.
 */
export function inputDraft(rows: readonly ScreenRow[]): string | undefined {
  for (let i = 1; i < rows.length; i++) {
    if (!/^─+$/.test(rows[i - 1].text.trim())) continue
    const chars = [...rows[i].text]
    const start = chars.indexOf('❯')
    if (start < 0 || chars.slice(0, start).join('').trim() !== '') continue
    return chars.map((c, at) => (at > start && !rows[i].dim[at] ? c : '')).join('').trim()
  }
  return undefined
}
