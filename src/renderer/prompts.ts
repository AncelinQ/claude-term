import { useWorkbench, isClaude, type Tab } from '@/stores/workbench'
import { useAsk } from '@/stores/ask'
import { matches, terminalSafe, type KeyEventLike } from '@shared/keymap'
import { expandPrompt, promptKeys, promptVariables, type PromptValues, type SavedPrompt } from '@shared/prompts'
import { t } from '@/i18n'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** The prompt a keydown triggers (its own shortcut); in a terminal, only shortcuts terminals leave to the app. */
export function promptForKey(e: KeyEventLike, inTerminal: boolean): SavedPrompt | null {
  const mac = window.ct.platform === 'darwin'
  return useWorkbench.getState().settings?.prompts?.find((p) => p.shortcut && matches(p.shortcut, e, mac) && (!inTerminal || terminalSafe(p.shortcut, mac))) ?? null
}

/**
 * Sends a saved prompt to the active project's Claude tab (a new one when it has none), its variables filled from what
 * is in front: the editor's or the terminal's selection, the open file (relative to the project), the git branch, a line
 * asked for {saisie}. Returns why it did not go, or null.
 */
export async function runPrompt(p: SavedPrompt): Promise<string | null> {
  const st = useWorkbench.getState()
  const project = st.projects.find((x) => x.id === st.activeProjectId)
  if (!project?.root) return t('Ouvre un projet')
  const root = project.root
  const current = project.tabs.find((x) => x.id === project.currentTabId)
  const values: PromptValues = {}
  for (const v of promptVariables(p.text)) {
    if (v === 'selection') {
      const { editorSelection } = await import('@/editor/EditorHost')
      const { terminalSelection } = await import('@/terminal/TerminalView')
      values.selection = (current?.kind === 'file' ? editorSelection() : current ? terminalSelection(current.id) : '') || undefined
    } else if (v === 'file') {
      const file = current?.kind === 'file' ? current : [...project.tabs].reverse().find((x) => x.kind === 'file')
      if (file?.path) values.file = file.path.startsWith(root) ? file.path.slice(root.length).replace(/^[\\/]/, '') : file.path
    } else if (v === 'branch') {
      values.branch = (await window.ct.app.gitBranch(root)) ?? undefined
    } else if (v === 'input') {
      values.input = (await useAsk.getState().ask(p.name, t('Valeur de {saisie}')))?.trim() || undefined
      if (!values.input) return null   // cancelled
    }
  }
  const r = expandPrompt(p.text, values)
  if ('missing' in r) return t('Manque : {x}', { x: r.missing.map((m) => ({ selection: '{sélection}', file: '{fichier}', branch: '{branche}', input: '{saisie}' })[m]).join(', ') })
  // the Claude tab in front, else the project's last one, else a new one
  const claudeTabs = (x: Tab) => isClaude(x) && x.alive
  let tab = current && claudeTabs(current) ? current : project.tabs.find((x) => x.id === st.lastClaudeTab[project.id] && claudeTabs(x)) ?? project.tabs.find(claudeTabs)
  if (!tab) {
    await st.newTab(project.id, 'claude')
    await sleep(2500)
    tab = useWorkbench.getState().projects.find((x) => x.id === project.id)?.tabs.filter(claudeTabs).at(-1)
  }
  if (!tab?.ptyId) return t('Aucun onglet Claude')
  st.setCurrentTab(project.id, tab.id)
  const keys = promptKeys(r.text, p.mode)
  window.ct.pty.write(tab.ptyId, keys.paste)
  if (keys.enter) { await sleep(150); window.ct.pty.write(tab.ptyId, '\r') }
  ;(await import('@/terminal/TerminalView')).focusTerminal(tab.id)
  return null
}
