import { monaco } from './monaco'
import { normId, packageScriptLines } from '@shared/run-lines'
import { usePlugins } from '@/stores/plugins'
import { useWorkbench } from '@/stores/workbench'

/**
 * WebStorm-like ▶ in the glyph margin of package.json, one per script: a click runs it through the Lanceur (its
 * package manager choice, and it shows in "En cours"); while it runs the glyph is a stop square. Scripts the Lanceur
 * does not list (a package.json outside the project) run directly in a shell tab.
 */
const LANCEUR = 'claudeterm.runnables:runnables'
const isPackageJson = (m: monaco.editor.ITextModel | null) => !!m && /[\\/]package\.json$/.test(m.uri.fsPath)
const dirOf = (p: string) => p.replace(/[\\/][^\\/]*$/, '')
const itemId = (dir: string, name: string) => `npm:${dir}:${name}`

/** item ids the Lanceur currently shows as running ("en cours" badge) */
function runningItems(): Set<string> {
  const out = new Set<string>()
  const walk = (items: any[] | undefined) => { for (const it of items ?? []) { if (it.badges?.includes('en cours')) out.add(normId(it.id)); walk(it.children) } }
  const m = usePlugins.getState().views[LANCEUR] as any
  walk(m?.items)
  return out
}
/** the Lanceur's own id for a script (its spelling of the path), or null when it does not list it */
function lanceurId(id: string): string | null {
  const want = normId(id)
  let found: string | null = null
  const walk = (items: any[] | undefined) => { for (const it of items ?? []) { if (!found && normId(it.id) === want) found = it.id; walk(it.children) } }
  walk((usePlugins.getState().views[LANCEUR] as any)?.items)
  return found
}

export function attachRunGutter(editor: monaco.editor.IStandaloneCodeEditor) {
  const decorations = editor.createDecorationsCollection()
  let lines: { name: string; line: number }[] = []
  const update = () => {
    const m = editor.getModel()
    const on = isPackageJson(m)
    editor.updateOptions({ glyphMargin: on })
    if (!on || !m) { lines = []; decorations.clear(); return }
    lines = packageScriptLines(m.getValue())
    const dir = dirOf(m.uri.fsPath), running = runningItems()
    decorations.set(lines.map((l) => {
      const run = running.has(normId(itemId(dir, l.name)))
      return { range: new monaco.Range(l.line, 1, l.line, 1), options: {
        glyphMarginClassName: run ? 'ct-glyph-stop' : 'ct-glyph-run',
        glyphMarginHoverMessage: { value: run ? `Arrêter « ${l.name} »` : `Lancer « ${l.name} »` },
      } }
    }))
  }
  let timer: ReturnType<typeof setTimeout> | undefined
  editor.onDidChangeModel(update)
  editor.onDidChangeModelContent(() => { clearTimeout(timer); timer = setTimeout(update, 300) })
  usePlugins.subscribe((s, prev) => { if (s.views[LANCEUR] !== prev.views[LANCEUR]) update() })
  editor.onMouseDown((e) => {
    if (e.target.type !== monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) return
    const m = editor.getModel()
    if (!m) return
    // lines of the current text: a click right after an edit must not use the debounced ones
    const l = packageScriptLines(m.getValue()).find((x) => x.line === e.target.position?.lineNumber)
    if (!l) return
    const dir = dirOf(m.uri.fsPath), id = lanceurId(itemId(dir, l.name))
    if (id) return window.ct.plugins.event({ viewId: LANCEUR, type: 'action', itemId: id, actionId: runningItems().has(normId(id)) ? 'stop' : 'run' })
    const st = useWorkbench.getState()
    if (st.activeProjectId) st.runCommand(st.activeProjectId, dir, [['npm', 'run', l.name]], 'reuse')
  })
  update()
}
