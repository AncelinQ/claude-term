import { create } from 'zustand'
import { useWorkbench, isClaude, type Tab } from '@/stores/workbench'
import { screenRows, focusTerminal } from '@/terminal/TerminalView'
import { effortSlider, highlightedModel, inputDraft, isChoice, isModelPicker, isSwitchConfirm } from '@shared/claude-picker'
import { modelName } from '@shared/models'
import { t } from '@/i18n'

/**
 * Changes a Claude tab's model or effort for its session only. `/model <x>` and `/effort <x>` make the choice the
 * default of the next sessions; only the `s` key of their pickers keeps it to this one. So the picker is driven as a
 * user would, the screen read between keys (shared/claude-picker): anything unexpected closes it and says so. Enter is
 * never sent to a picker, and `s` only goes on the line wanted.
 */

/** A line under the bubble: why a change did not go, or what it waits for. */
export const usePickerNotice = create<{ notice: { tabId: string; text: string } | null }>(() => ({ notice: null }))

const KEY = { home: '\x1b[H', down: '\x1b[B', right: '\x1b[C', left: '\x1b[D', escape: '\x1b' }
/** how long Claude Code gets to show what a key must bring */
const STEP_MS = 3000
const POLL_MS = 40
/** lines walked at most in the model list (about a dozen, and it loops) */
const MAX_ROWS = 40
const NOTICE_MS = 6000

const running = new Set<string>()
let noticeTimer: ReturnType<typeof setTimeout> | undefined
function notice(tabId: string, text: string | null, lasts?: number) {
  clearTimeout(noticeTimer)
  usePickerNotice.setState((s) => (text ? { notice: { tabId, text } } : s.notice?.tabId === tabId ? { notice: null } : s))
  if (text && lasts) noticeTimer = setTimeout(() => notice(tabId, null), lasts)
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
const tabOf = (id: string): Tab | undefined => useWorkbench.getState().projects.flatMap((p) => p.tabs).find((x) => x.id === id)
const lines = (id: string) => (screenRows(id) ?? []).map((r) => r.text)
const press = (id: string, data: string) => { const p = tabOf(id)?.ptyId; if (p) window.ct.pty.write(p, data) }

/** waits for `read` to find what it looks for on screen; undefined after the delay */
async function waitFor<T>(id: string, read: (l: string[]) => T | undefined, timeout = STEP_MS): Promise<T | undefined> {
  const started = Date.now()
  for (;;) {
    const found = read(lines(id))
    if (found !== undefined) return found
    if (Date.now() - started > timeout) return undefined
    await sleep(POLL_MS)
  }
}

const alive = (id: string) => { const x = tabOf(id); return !!x && x.alive && isClaude(x) }
/** waits for the end of Claude's turn; false when the tab closes or stops running Claude */
function idle(id: string): Promise<boolean> {
  return new Promise((resolve) => {
    const check = () => {
      if (!alive(id)) { off(); resolve(false) } else if (!tabOf(id)?.working) { off(); resolve(true) }
    }
    const off = useWorkbench.subscribe(check)
    check()
  })
}

class Abort extends Error {}

/** One gesture per tab, after Claude's turn, on a visible and empty input line; `body` throws Abort to stop. True when done. */
async function drive(id: string, body: () => Promise<void>): Promise<boolean> {
  if (running.has(id) || !alive(id)) return false
  running.add(id)
  try {
    if (tabOf(id)?.working) {
      notice(id, t('Le changement attend la fin du tour de Claude.'))
      if (!(await idle(id))) { notice(id, null); return false }
    }
    if (tabOf(id)?.attention?.kind === 'permission') throw new Abort(t("Claude attend ta réponse : réponds-lui d'abord."))
    const draft = inputDraft(screenRows(id) ?? [])
    if (draft === undefined) throw new Abort(t("La ligne de saisie de Claude n'est pas à l'écran : ferme ce qui y est ouvert, puis recommence."))
    if (draft) throw new Abort(t("La ligne de saisie de Claude n'est pas vide : envoie ou efface ce qui y est écrit, puis recommence."))
    await body()
    notice(id, null)
    return true
  } catch (e) {
    if (!(e instanceof Abort)) throw e
    notice(id, e.message, NOTICE_MS)
    return false
  } finally {
    running.delete(id)
  }
}

/** closes the open picker and stops */
function giveUp(id: string, reason: string): never {
  press(id, KEY.escape)
  throw new Abort(t("{reason} Rien n'a changé.", { reason }))
}

/** types a command, then Enter apart: sent with the text, it would be a pasted newline */
async function command(id: string, text: string) {
  press(id, text)
  await sleep(150)
  press(id, '\r')
}

/** The tab runs `alias` ("opus", "sonnet[1m]"…) for its session only. */
export function switchModel(id: string, alias: string): Promise<boolean> {
  const label = modelName(alias)
  return drive(id, async () => {
    await command(id, '/model')
    const opened = await waitFor(id, (l) => (isModelPicker(l) ? highlightedModel(l) : undefined))
    if (!opened) giveUp(id, t("Le sélecteur de modèle de Claude Code ne s'est pas ouvert."))
    let shown = opened
    if (!isChoice(shown, alias)) {
      press(id, KEY.home)
      await sleep(120)
      shown = (await waitFor(id, highlightedModel)) ?? shown
      const first = shown
      for (let row = 0; row < MAX_ROWS && !isChoice(shown, alias); row++) {
        const before = shown
        press(id, KEY.down)
        const next = await waitFor(id, (l) => { const h = highlightedModel(l); return h !== undefined && h !== before ? h : undefined })
        // back at the top without meeting it: the picker does not offer it
        if (!next || next === first) giveUp(id, t('Le sélecteur de Claude Code ne propose pas {name}.', { name: label }))
        shown = next
      }
    }
    if (!isChoice(shown, alias)) giveUp(id, t('Le sélecteur de Claude Code ne propose pas {name}.', { name: label }))
    press(id, 's')
    if (!(await waitFor(id, (l) => (isModelPicker(l) ? undefined : true)))) giveUp(id, t("Le sélecteur de modèle de Claude Code ne s'est pas refermé."))
    // in a conversation already started, a confirmation takes its place: the user's to answer, who pays for it
    await sleep(250)
    if (isSwitchConfirm(lines(id))) {
      focusTerminal(id)
      throw new Abort(t('Claude Code demande de confirmer : le nouveau modèle relira toute la conversation au prochain message. Réponds dans le terminal.'))
    }
  })
}

/** The tab's effort is `level` for its session only. */
export function switchEffort(id: string, level: string): Promise<boolean> {
  return drive(id, async () => {
    await command(id, '/effort')
    const slider = await waitFor(id, effortSlider)
    if (!slider) giveUp(id, t("Le curseur d'effort de Claude Code ne s'est pas ouvert."))
    const target = slider.levels.indexOf(level)
    if (target < 0) giveUp(id, t("Le curseur d'effort de Claude Code ne propose pas {level}.", { level }))
    for (let at = slider.current; at !== target; at += target > at ? 1 : -1) {
      const expected = at + (target > at ? 1 : -1)
      press(id, target > at ? KEY.right : KEY.left)
      if (!(await waitFor(id, (l) => (effortSlider(l)?.current === expected ? true : undefined)))) giveUp(id, t("Le curseur d'effort de Claude Code n'a pas bougé comme prévu."))
    }
    press(id, 's')
    if (!(await waitFor(id, (l) => (effortSlider(l) ? undefined : true)))) giveUp(id, t("Le curseur d'effort de Claude Code ne s'est pas refermé."))
  })
}

/** The levels the bubble offers (Claude Code v2.1.289's slider); one it does not show stops the gesture. */
export const EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max']

/** how long a new Claude tab gets to show its input line: the folder trust question is the user's to answer first */
const READY_MS = 180_000

/**
 * Sends `prompt` as the first message of a Claude tab that just started: once its input line shows, empty, the text
 * goes as a paste (its lines stay one message) and Enter sends it. False when the line never showed, or was typed on.
 */
export async function sendWhenReady(id: string, prompt: string): Promise<boolean> {
  const started = Date.now()
  for (;;) {
    const tab = tabOf(id)
    if (!tab || !tab.alive) return false
    const rows = screenRows(id)
    const draft = rows ? inputDraft(rows) : undefined
    if (draft === '') break
    if (draft || Date.now() - started > READY_MS) return false
    await sleep(200)
  }
  press(id, `\x1b[200~${prompt}\x1b[201~`)
  await sleep(300)
  press(id, '\r')
  return true
}
