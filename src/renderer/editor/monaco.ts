import * as monaco from 'monaco-editor'
import editorWorker from 'monaco-editor/editor/editor.worker.js?worker'
import jsonWorker from 'monaco-editor/language/json/json.worker.js?worker'
import cssWorker from 'monaco-editor/language/css/css.worker.js?worker'
import htmlWorker from 'monaco-editor/language/html/html.worker.js?worker'
import tsWorker from 'monaco-editor/language/typescript/ts.worker.js?worker'
import type { ResolvedTheme, TokenColor } from '@shared/theme'

self.MonacoEnvironment = {
  getWorker(_: unknown, label: string) {
    if (label === 'json') return new jsonWorker()
    if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker()
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker()
    if (label === 'typescript' || label === 'javascript') return new tsWorker()
    return new editorWorker()
  },
}


export { monaco }

/** TextMate scope prefixes → Monaco token names. First match wins. */
const SCOPE_MAP: [string, string][] = [
  ['comment', 'comment'], ['punctuation.definition.comment', 'comment'],
  ['string', 'string'], ['constant.numeric', 'number'], ['constant.language', 'keyword'], ['constant.character', 'string.escape'],
  ['keyword.operator', 'operator'], ['keyword', 'keyword'], ['storage', 'keyword'],
  ['entity.name.tag', 'tag'], ['entity.other.attribute-name', 'attribute.name'],
  ['entity.name.type', 'type'], ['entity.name.class', 'type'], ['support.type', 'type'], ['support.class', 'type'],
  ['entity.name.function', 'identifier.function'], ['support.function', 'identifier.function'],
  ['variable', 'variable'], ['support.variable', 'variable'],
  ['markup.heading', 'keyword'], ['markup.bold', 'strong'], ['markup.italic', 'emphasis'],
]

function rulesFrom(tokenColors: TokenColor[]): monaco.editor.ITokenThemeRule[] {
  const rules: monaco.editor.ITokenThemeRule[] = []
  const seen = new Set<string>()
  for (const tc of tokenColors) {
    const scopes = Array.isArray(tc.scope) ? tc.scope : tc.scope ? tc.scope.split(',').map((s) => s.trim()) : []
    for (const scope of scopes) {
      const hit = SCOPE_MAP.find(([prefix]) => scope === prefix || scope.startsWith(prefix + '.'))
      if (!hit || seen.has(hit[1])) continue
      seen.add(hit[1])
      const r: monaco.editor.ITokenThemeRule = { token: hit[1] }
      if (tc.settings.foreground) r.foreground = tc.settings.foreground.replace('#', '').slice(0, 6)
      if (tc.settings.fontStyle) r.fontStyle = tc.settings.fontStyle
      rules.push(r)
    }
  }
  return rules
}

/** Defines and applies the Monaco theme derived from the workbench theme. */
export function applyMonacoTheme(t: ResolvedTheme) {
  const k = t.tokens
  monaco.editor.defineTheme('claudeterm', {
    base: t.type === 'dark' ? 'vs-dark' : 'vs',
    inherit: true,
    rules: rulesFrom(t.tokenColors),
    colors: {
      ...Object.fromEntries(Object.entries(t.colors).filter(([key]) => /^(editor|editorGutter|editorBracket|editorIndentGuide|minimap|scrollbar|list|input|widget|peekView|diffEditor)/.test(key))),
      'editor.background': k['editor.bg'], 'editor.foreground': k['editor.fg'],
      'editorLineNumber.foreground': k['editor.lineNumber'], 'editorLineNumber.activeForeground': k['text.secondary'],
      'editor.lineHighlightBackground': k['editor.currentLine'], 'editor.selectionBackground': k['editor.selection'],
      'editorCursor.foreground': k['terminal.cursor'], 'editorWidget.background': k['island.bg'], 'editorWidget.border': k['island.border'],
      'input.background': k['input.bg'], 'input.border': k['input.border'], 'focusBorder': k['accent'],
      'scrollbarSlider.background': k['hover.bg'], 'editorIndentGuide.background1': k['island.border'],
    },
  })
  monaco.editor.setTheme('claudeterm')
}
