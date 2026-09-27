import { useEffect, useRef } from 'react'
import { monaco, applyMonacoTheme } from './monaco'
import { useWorkbench, type Tab } from '@/stores/workbench'
import { ACTIONS, binding, parse } from '@shared/keymap'
import { runAppAction } from '@/actions'

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
  applyKeymap(useWorkbench.getState().settings?.keybindings ?? {})
  editor.onDidBlurEditorWidget(() => useWorkbench.getState().autoSaveAll())
  editor.onDidChangeModelContent(() => {
    const m = editor!.getModel()
    if (!m) return
    const path = m.uri.fsPath
    useWorkbench.getState().setFileDirty(path, m.getValue() !== saved.get(path))
  })
  return editor
}

const KEYCODES: Record<string, number> = {
  ArrowUp: monaco.KeyCode.UpArrow, ArrowDown: monaco.KeyCode.DownArrow, ArrowLeft: monaco.KeyCode.LeftArrow, ArrowRight: monaco.KeyCode.RightArrow,
  Backspace: monaco.KeyCode.Backspace, Delete: monaco.KeyCode.Delete, Enter: monaco.KeyCode.Enter, Space: monaco.KeyCode.Space, Tab: monaco.KeyCode.Tab, Escape: monaco.KeyCode.Escape,
  '/': monaco.KeyCode.Slash, ',': monaco.KeyCode.Comma, '-': monaco.KeyCode.Minus, '=': monaco.KeyCode.Equal, '[': monaco.KeyCode.BracketLeft, ']': monaco.KeyCode.BracketRight, '.': monaco.KeyCode.Period,
}
/** "Mod+Alt+L" → Monaco keybinding number. */
function monacoKey(s: string): number | null {
  const c = parse(s)
  if (!c) return null
  const mac = window.ct.platform === 'darwin'
  const k = c.key.length === 1 && /[a-z]/.test(c.key) ? (monaco.KeyCode as any)['Key' + c.key.toUpperCase()] : /^[0-9]$/.test(c.key) ? (monaco.KeyCode as any)['Digit' + c.key] : /^F\d+$/.test(c.key) ? (monaco.KeyCode as any)[c.key] : KEYCODES[c.key]
  if (k === undefined) return null
  return k | (c.mod ? monaco.KeyMod.CtrlCmd : 0) | (c.ctrl ? (mac ? monaco.KeyMod.WinCtrl : monaco.KeyMod.CtrlCmd) : 0) | (c.alt ? monaco.KeyMod.Alt : 0) | (c.shift ? monaco.KeyMod.Shift : 0)
}
let keymapDisposables: { dispose(): void }[] = []
/** (Re)binds every keymap action in Monaco: editor actions run the Monaco command, general ones the app action. */
export function applyKeymap(overrides: Record<string, string>) {
  if (!editor) return
  keymapDisposables.forEach((d) => d.dispose()); keymapDisposables = []
  for (const a of ACTIONS) {
    const kb = monacoKey(binding(a.id, overrides))
    if (kb === null) continue
    const run = a.scope === 'editor' ? () => { editor!.getAction(a.id)?.run() ?? editor!.trigger('keymap', a.id, null) } : () => { runAppAction(a.id) }
    keymapDisposables.push(editor.addAction({ id: 'ct.' + a.id, label: a.label, keybindings: [kb], run }))
  }
}
/** Runs the formatter on a file's model when it is the one in the editor. */
export async function formatIfActive(path: string) {
  if (!editor || editor.getModel()?.uri.fsPath !== path) return
  await editor.getAction('editor.action.formatDocument')?.run()
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

/** Calls `cb` with the model text after each change (the model must exist). */
export function subscribeFileText(path: string, cb: (text: string) => void): () => void {
  const m = monaco.editor.getModel(monaco.Uri.file(path))
  if (!m) return () => {}
  const d = m.onDidChangeContent(() => cb(m.getValue()))
  return () => d.dispose()
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
  useEffect(() => { applyKeymap(settings.keybindings ?? {}) }, [JSON.stringify(settings.keybindings ?? {})])

  return <div className="editor-wrap" ref={ref} />
}

export function ImageView({ src }: { src: string }) {
  return <div className="image-wrap"><img src={src} alt="" /></div>
}

/** Read-only Monaco diff (side by side) or a unified diff in a plain editor. */
export function DiffHost({ tab }: { tab: Tab }) {
  const ref = useRef<HTMLDivElement>(null)
  const theme = useWorkbench((s) => s.theme)!
  const settings = useWorkbench((s) => s.settings)!
  useEffect(() => {
    const host = ref.current!
    applyMonacoTheme(theme)
    const d = tab.diff!
    const opts = { readOnly: true, automaticLayout: true, fontFamily: settings.editorFontFamily || undefined, fontSize: settings.editorFontSize, minimap: { enabled: false }, scrollBeyondLastLine: false, renderSideBySide: true, padding: { top: 8 } }
    let dispose: () => void
    if (d.unified !== undefined) {
      const m = monaco.editor.createModel(d.unified, 'diff')
      const e = monaco.editor.create(host, { ...opts, model: m, wordWrap: 'off' })
      dispose = () => { e.dispose(); m.dispose() }
    } else {
      const lang = tab.path ? undefined : d.language
      const o = monaco.editor.createModel(d.original ?? '', lang, tab.path ? monaco.Uri.parse(`diff-original:${tab.id}${tab.path}`) : undefined)
      const m = monaco.editor.createModel(d.modified ?? '', lang, tab.path ? monaco.Uri.parse(`diff-modified:${tab.id}${tab.path}`) : undefined)
      const e = monaco.editor.createDiffEditor(host, opts)
      e.setModel({ original: o, modified: m })
      dispose = () => { e.dispose(); o.dispose(); m.dispose() }
    }
    return () => dispose()
  }, [tab.id])
  return <div className="editor-wrap" ref={ref} />
}
