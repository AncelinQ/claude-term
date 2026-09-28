import { monaco } from './monaco'
import { runLines, type RunLine } from '@shared/run-lines'
import { useRunnables } from '@/stores/runnables'
import { useWorkbench } from '@/stores/workbench'

/**
 * WebStorm-like ▶ in the glyph margin of every line that can be run (runLines: package.json scripts, Makefile
 * targets, shell scripts, shell commands of Markdown code blocks). A click runs it through the Exécuter panel (the
 * Scripts tab's own command when it lists it), so it shows in "En cours"; while it runs the ▶ is a ■ that stops it.
 */
export function attachRunGutter(editor: monaco.editor.IStandaloneCodeEditor) {
  const decorations = editor.createDecorationsCollection()
  // parsed once per version of the text (updates also come from run and tab changes)
  let cache: { key: string; lines: RunLine[] } | null = null
  const current = (): RunLine[] => {
    const m = editor.getModel()
    if (!m) return []
    const key = m.uri.toString() + '@' + m.getVersionId()
    if (cache?.key !== key) cache = { key, lines: runLines(m.uri.fsPath, m.getValue()) }
    return cache.lines
  }
  const update = () => {
    const lines = current()
    editor.updateOptions({ glyphMargin: lines.length > 0 })
    const r = useRunnables.getState()
    decorations.set(lines.map((l) => {
      const run = !!r.runOf(l.itemId)
      return { range: new monaco.Range(l.line, 1, l.line, 1), options: {
        glyphMarginClassName: run ? 'ct-glyph-stop' : 'ct-glyph-run',
        glyphMarginHoverMessage: { value: run ? `Arrêter « ${l.label} »` : `Lancer « ${l.label} »` },
      } }
    }))
  }
  let timer: ReturnType<typeof setTimeout> | undefined
  editor.onDidChangeModel(update)
  editor.onDidChangeModelContent(() => { clearTimeout(timer); timer = setTimeout(update, 300) })
  // runs start and end with the tabs
  useRunnables.subscribe(update)
  useWorkbench.subscribe((s, prev) => { if (s.projects !== prev.projects) update() })
  editor.onMouseDown((e) => {
    if (e.target.type !== monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) return
    // lines of the current text: a click right after an edit must not use the debounced ones
    const l = current().find((x) => x.line === e.target.position?.lineNumber)
    if (!l) return
    const r = useRunnables.getState()
    const runId = r.runOf(l.itemId)
    if (runId) r.stop(runId); else r.runLine(l)
  })
  update()
}
