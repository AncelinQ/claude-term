/** Plugin system contract: manifest, declarative view models, host ↔ renderer messages. */

export interface PluginManifest {
  id: string
  name: string
  version: string
  description?: string
  main: string
  /** "startup" (default) or lazy: "onView:<viewId>" */
  activation?: string[]
  permissions?: ('process' | 'fs:home' | 'network' | 'secrets')[]
  contributes?: {
    activity?: { id: string; side: 'left' | 'right'; title: string; icon: string }[]
    /** placement: sidebar (default, under the activity) or bottom (a tab of the center session block) */
    views?: { id: string; activity?: string; title: string; placement?: 'sidebar' | 'bottom' }[]
    commands?: { id: string; title: string; shortcut?: string }[]
    settings?: Record<string, { type: 'string' | 'boolean' | 'number'; default?: unknown; description?: string; enum?: string[] }>
  }
}

export interface PluginInfo { manifest: PluginManifest; dir: string; builtin: boolean; enabled: boolean; error?: string }

// MARK: view models (rendered by the workbench, never drawn by plugins)

export interface ViewAction { id: string; title: string; icon?: string; primary?: boolean; shortcut?: string; disabled?: boolean }
export interface ViewItem {
  id: string
  label: string
  /** secondary text, inline after the label */
  detail?: string
  /** right-aligned text (e.g. "↑26") */
  extra?: string
  icon?: string
  /** a file path: shown with the file-type icon */
  file?: string
  /** a folder path: shown with the folder icon (open/closed follows the node) */
  folder?: string
  /** icon color: a token name (accent, badge.ok…) or a hex */
  color?: string
  badges?: string[]
  /** hover actions */
  actions?: ViewAction[]
  /** right-click menu ('sep' for a separator) */
  contextMenu?: (ViewAction | 'sep')[]
  children?: ViewItem[]
  expanded?: boolean
  /** defined = a checkbox is shown (group nodes: tri-state derived from children) */
  checked?: boolean
  /** dimmed row */
  muted?: boolean
}
export interface ViewFooter {
  fields?: { id: string; placeholder?: string; value?: string; multiline?: boolean }[]
  checks?: { id: string; label: string; checked: boolean }[]
  buttons?: ViewAction[]
}
export type ViewModel =
  | { kind: 'empty'; text: string }
  | { kind: 'list'; items: ViewItem[]; toolbar?: ViewAction[]; footer?: ViewFooter; search?: boolean; title?: string; detail?: ViewModel }
  | { kind: 'tree'; items: ViewItem[]; toolbar?: ViewAction[]; footer?: ViewFooter; search?: boolean; title?: string; detail?: ViewModel }
  | { kind: 'markdown'; text: string }
  | { kind: 'diff'; text: string }

/** Renderer → host: an interaction on a view (or a popover, whose id is "popover:<n>"). */
export interface ViewEvent {
  viewId: string
  type: 'select' | 'open' | 'action' | 'toolbar' | 'check' | 'input' | 'button' | 'menu'
  itemId?: string
  actionId?: string
  /** check: the new state; input: the field value */
  value?: boolean | string
  fieldId?: string
}

/** Host → renderer: a popover anchored to a view's header (search + list/tree). */
export interface PopoverRequest { id: string; anchorViewId: string; model: ViewModel }

/** Host → renderer: a side-by-side diff tab (original/modified) or a unified diff tab. */
export interface DiffRequest { title: string; path?: string; original?: string; modified?: string; unified?: string }

/** Host → renderer: a text prompt (modal); answered with `plugins:promptReply`. */
export interface PromptRequest { id: number; title: string; placeholder?: string; options?: string[] }

/** Host → renderer: a terminal command request. */
export interface RunRequest { cwd: string; command: string; label?: string; tab?: 'reuse' | 'new' }

export const FILE_COLORS: Record<string, string> = {
  ts: '#3178c6', tsx: '#3178c6', js: '#e8c547', jsx: '#e8c547', mjs: '#e8c547', json: '#e8c547', py: '#4b8bbe', md: '#8a8f9e', css: '#a074c4', scss: '#c6538c',
  html: '#e44d26', sh: '#6cc644', zsh: '#6cc644', rs: '#dea584', go: '#00add8', swift: '#f05138', java: '#b07219', kt: '#a97bff', rb: '#cc342d', php: '#777bb3',
  yml: '#cb171e', yaml: '#cb171e', toml: '#9c4221', sql: '#e38c00', vue: '#41b883', svelte: '#ff3e00', c: '#555555', h: '#555555', cpp: '#f34b7d', cs: '#178600',
  png: '#b45fd6', jpg: '#b45fd6', jpeg: '#b45fd6', svg: '#ffb13b', lock: '#8a8f9e', txt: '#8a8f9e',
}

export const VIEW_ICONS = ['play', 'box', 'terminal', 'file', 'folder', 'sparkle', 'plug', 'puzzle', 'search', 'list', 'activity', 'gear', 'cpu', 'clock', 'link', 'code', 'image'] as const
