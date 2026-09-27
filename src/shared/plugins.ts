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
    views?: { id: string; activity: string; title: string }[]
    commands?: { id: string; title: string; shortcut?: string }[]
    settings?: Record<string, { type: 'string' | 'boolean' | 'number'; default?: unknown; description?: string; enum?: string[] }>
  }
}

export interface PluginInfo { manifest: PluginManifest; dir: string; builtin: boolean; enabled: boolean; error?: string }

// MARK: view models (rendered by the workbench, never drawn by plugins)

export interface ViewAction { id: string; title: string; icon?: string; primary?: boolean }
export interface ViewItem {
  id: string
  label: string
  detail?: string
  icon?: string
  badges?: string[]
  actions?: ViewAction[]
  children?: ViewItem[]
  /** tree nodes: start expanded */
  expanded?: boolean
}
export type ViewModel =
  | { kind: 'empty'; text: string }
  | { kind: 'list'; items: ViewItem[]; toolbar?: ViewAction[] }
  | { kind: 'tree'; items: ViewItem[]; toolbar?: ViewAction[] }
  | { kind: 'markdown'; text: string }

/** Renderer → host: an interaction on a view. */
export interface ViewEvent { viewId: string; type: 'select' | 'open' | 'action' | 'toolbar'; itemId?: string; actionId?: string }

/** Host → renderer: a terminal command request. */
export interface RunRequest { cwd: string; command: string; label?: string; tab?: 'reuse' | 'new' }

export const VIEW_ICONS = ['play', 'box', 'terminal', 'file', 'folder', 'sparkle', 'plug', 'puzzle', 'search', 'list', 'activity', 'gear', 'cpu', 'clock', 'link', 'code', 'image'] as const
