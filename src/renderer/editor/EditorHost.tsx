import { useEffect, useRef } from 'react'
import { monaco, applyMonacoTheme } from './monaco'
import { useWorkbench, type Tab } from '@/stores/workbench'

/** One Monaco editor for the center; models (and their undo stacks) live per file path. */
let editor: monaco.editor.IStandaloneCodeEditor | null = null
const container = document.createElement('div')
container.className = 'editor'
const viewStates = new Map<string, monaco.editor.ICodeEditorViewState | null>()
const saved = new Map<string, string>()   // path → text at last load/save (dirty = differs)
let themedFor: string | null = null

function editorOptions(s: { editorFontFamily: string; editorFontSize: number; editorLineHeight: number; editorWordWrap: boolean; editorMinimap: boolean }): monaco.editor.IEditorOptions {
  return {
    fontFamily: s.editorFontFamily || undefined, fontSize: s.editorFontSize, lineHeight: s.editorLineHeight || 0,
    wordWrap: s.editorWordWrap ? 'on' : 'off', minimap: { enabled: s.editorMinimap },
  }
}

function ensureEditor(s: Parameters<typeof editorOptions>[0]) {
  if (editor) return editor
  editor = monaco.editor.create(container, {
    ...editorOptions(s),
    automaticLayout: true, scrollBeyondLastLine: false, lineNumbersMinChars: 3, renderLineHighlight: 'line',
    tabSize: 2, insertSpaces: true, detectIndentation: true, smoothScrolling: true, padding: { top: 8 },
    scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 }, fixedOverflowWidgets: true,
  })
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => useWorkbench.getState().saveCurrentFile())
  editor.onDidBlurEditorWidget(() => useWorkbench.getState().autoSaveAll())
  editor.onDidChangeModelContent(() => {
    const m = editor!.getModel()
    if (!m) return
    const path = m.uri.fsPath
    useWorkbench.getState().setFileDirty(path, m.getValue() !== saved.get(path))
  })
  return editor
}

export function modelFor(path: string, text: string): monaco.editor.ITextModel {
  const uri = monaco.Uri.file(path)
  return monaco.editor.getModel(uri) ?? monaco.editor.createModel(text, undefined, uri)
}

/** Loads (or reloads) a file's text into its model, keeping the view state when it is in front. */
export function setFileText(path: string, text: string) {
  const m = modelFor(path, text)
  saved.set(path, text)
  if (m.getValue() !== text) {
    const e = editor
    const keep = e?.getModel() === m ? e.saveViewState() : null
    m.setValue(text)
    if (keep && e) e.restoreViewState(keep)
  }
}

export function fileText(path: string): string | null {
  return monaco.editor.getModel(monaco.Uri.file(path))?.getValue() ?? null
}
export function markSaved(path: string) { const t = fileText(path); if (t !== null) saved.set(path, t) }
export function disposeFile(path: string) {
  monaco.editor.getModel(monaco.Uri.file(path))?.dispose()
  viewStates.delete(path); saved.delete(path)
}
export function languageOf(path: string): string {
  return monaco.editor.getModel(monaco.Uri.file(path))?.getLanguageId() ?? ''
}

export function EditorHost({ tab }: { tab: Tab }) {
  const ref = useRef<HTMLDivElement>(null)
  const theme = useWorkbench((s) => s.theme)!
  const settings = useWorkbench((s) => s.settings)!

  useEffect(() => {
    const host = ref.current!
    const e = ensureEditor(settings)
    if (themedFor !== theme.id) { applyMonacoTheme(theme); themedFor = theme.id }
    host.appendChild(container)
    const m = monaco.editor.getModel(monaco.Uri.file(tab.path!))
    if (m) {
      const prev = e.getModel()
      if (prev && prev !== m) viewStates.set(prev.uri.fsPath, e.saveViewState())
      e.setModel(m)
      const vs = viewStates.get(tab.path!)
      if (vs) e.restoreViewState(vs)
    }
    e.layout()
    e.focus()
    return () => {
      const cur = e.getModel()
      if (cur) viewStates.set(cur.uri.fsPath, e.saveViewState())
      if (container.parentElement === host) host.removeChild(container)
    }
  }, [tab.path])

  useEffect(() => {
    if (!editor) return
    applyMonacoTheme(theme); themedFor = theme.id
    editor.updateOptions(editorOptions(settings))
  }, [theme, settings.editorFontFamily, settings.editorFontSize, settings.editorLineHeight, settings.editorWordWrap, settings.editorMinimap])

  return <div className="editor-wrap" ref={ref} />
}

export function ImageView({ src }: { src: string }) {
  return <div className="image-wrap"><img src={src} alt="" /></div>
}
