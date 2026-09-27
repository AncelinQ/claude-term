/**
 * Theme model. Files use VS Code keys (`colors`, `tokenColors`) so VS Code themes load as-is;
 * ClaudeTerm's own tokens are derived from VS Code keys when a theme does not set them.
 */
export interface TokenColor {
  name?: string
  scope?: string | string[]
  settings: { foreground?: string; background?: string; fontStyle?: string }
}

export interface ThemeSpec {
  id: string
  name: string
  type: 'dark' | 'light'
  colors: Record<string, string>
  tokenColors?: TokenColor[]
}

/** Our tokens → VS Code keys tried in order when the token itself is absent. */
export const TOKEN_FALLBACKS: Record<string, string[]> = {
  'window.bg': ['editor.background'],
  'island.bg': ['sideBar.background', 'editor.background'],
  'island.border': ['sideBar.border', 'panel.border', 'editorGroup.border'],
  'island.header.bg': ['sideBarSectionHeader.background', 'sideBar.background'],
  'text': ['foreground', 'editor.foreground'],
  'text.secondary': ['descriptionForeground', 'sideBar.foreground'],
  'text.tertiary': ['disabledForeground', 'descriptionForeground'],
  'accent': ['focusBorder', 'button.background', 'textLink.foreground'],
  'accent.bg': ['list.activeSelectionBackground', 'editor.selectionBackground'],
  'selection.bg': ['list.activeSelectionBackground', 'editor.selectionBackground'],
  'hover.bg': ['list.hoverBackground', 'toolbar.hoverBackground'],
  'divider': ['panel.border', 'sideBar.border'],
  'activity.bg': ['activityBar.background', 'sideBar.background'],
  'activity.fg': ['activityBar.inactiveForeground', 'activityBar.foreground'],
  'activity.active': ['activityBar.foreground', 'foreground'],
  'activity.indicator': ['activityBar.activeBorder', 'focusBorder'],
  'tab.active.bg': ['tab.activeBackground', 'editor.background'],
  'tab.active.fg': ['tab.activeForeground', 'foreground'],
  'tab.fg': ['tab.inactiveForeground', 'descriptionForeground'],
  'status.bg': ['statusBar.background', 'activityBar.background'],
  'status.fg': ['statusBar.foreground', 'descriptionForeground'],
  'status.accent': ['statusBarItem.remoteBackground', 'focusBorder'],
  'badge.info': ['charts.blue', 'textLink.foreground'],
  'badge.ok': ['charts.green', 'terminal.ansiGreen'],
  'badge.warn': ['charts.yellow', 'terminal.ansiYellow'],
  'badge.error': ['charts.red', 'errorForeground', 'terminal.ansiRed'],
  'terminal.bg': ['terminal.background', 'editor.background'],
  'terminal.fg': ['terminal.foreground', 'editor.foreground'],
  'terminal.cursor': ['terminalCursor.foreground', 'editorCursor.foreground', 'focusBorder'],
  'terminal.selection': ['terminal.selectionBackground', 'editor.selectionBackground'],
  'editor.bg': ['editor.background'],
  'editor.fg': ['editor.foreground'],
  'editor.lineNumber': ['editorLineNumber.foreground', 'descriptionForeground'],
  'editor.currentLine': ['editor.lineHighlightBackground'],
  'editor.selection': ['editor.selectionBackground'],
  'input.bg': ['input.background', 'editor.background'],
  'input.border': ['input.border', 'panel.border'],
}

export const ANSI_KEYS = [
  'terminal.ansiBlack', 'terminal.ansiRed', 'terminal.ansiGreen', 'terminal.ansiYellow',
  'terminal.ansiBlue', 'terminal.ansiMagenta', 'terminal.ansiCyan', 'terminal.ansiWhite',
  'terminal.ansiBrightBlack', 'terminal.ansiBrightRed', 'terminal.ansiBrightGreen', 'terminal.ansiBrightYellow',
  'terminal.ansiBrightBlue', 'terminal.ansiBrightMagenta', 'terminal.ansiBrightCyan', 'terminal.ansiBrightWhite',
]

export interface ResolvedTheme {
  id: string
  name: string
  type: 'dark' | 'light'
  /** our token → color */
  tokens: Record<string, string>
  /** 16 ANSI colors */
  ansi: string[]
  /** VS Code colors, merged over the base theme (for Monaco) */
  colors: Record<string, string>
  tokenColors: TokenColor[]
}

function lookup(colors: Record<string, string>, token: string): string | undefined {
  if (colors[token]) return colors[token]
  for (const k of TOKEN_FALLBACKS[token] ?? []) if (colors[k]) return colors[k]
  return undefined
}

/** Resolves `spec` over `base` (the built-in theme of the same type). */
export function resolveTheme(spec: ThemeSpec, base: ThemeSpec): ResolvedTheme {
  const colors = { ...base.colors, ...spec.colors }
  const tokens: Record<string, string> = {}
  for (const t of Object.keys(TOKEN_FALLBACKS)) {
    tokens[t] = lookup(spec.colors, t) ?? lookup(base.colors, t) ?? '#ff00ff'
  }
  const ansi = ANSI_KEYS.map((k) => spec.colors[k] ?? base.colors[k] ?? '#808080')
  return {
    id: spec.id, name: spec.name, type: spec.type, tokens, ansi, colors,
    tokenColors: spec.tokenColors?.length ? spec.tokenColors : (base.tokenColors ?? []),
  }
}

/** CSS custom property name for a token: `island.header.bg` → `--ct-island-header-bg`. */
export function cssVar(token: string): string {
  return '--ct-' + token.replace(/\./g, '-')
}

/** Imports a VS Code theme JSON (as exported by an extension) into our spec. */
export function fromVSCode(json: { name?: string; type?: string; colors?: Record<string, string>; tokenColors?: TokenColor[] }, id: string): ThemeSpec {
  const type = json.type === 'light' || json.type === 'hc-light' ? 'light' : 'dark'
  return { id, name: json.name ?? id, type, colors: json.colors ?? {}, tokenColors: json.tokenColors ?? [] }
}
