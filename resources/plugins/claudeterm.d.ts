/** ClaudeTerm plugin API (phase 5.0). A plugin is a folder with plugin.json and main.js exporting activate(ctx). */
export interface ViewAction { id: string; title: string; icon?: string; primary?: boolean }
export interface ViewItem { id: string; label: string; detail?: string; icon?: string; badges?: string[]; actions?: ViewAction[]; children?: ViewItem[]; expanded?: boolean }
export type ViewModel =
  | { kind: 'empty'; text: string }
  | { kind: 'list'; items: ViewItem[]; toolbar?: ViewAction[] }
  | { kind: 'tree'; items: ViewItem[]; toolbar?: ViewAction[] }
  | { kind: 'markdown'; text: string }
  | { kind: 'diff'; text: string }
export interface ViewEvent { viewId: string; type: 'select' | 'open' | 'action' | 'toolbar'; itemId?: string; actionId?: string }

export interface Context {
  plugin: { id: string; dir: string }
  workspace: {
    /** root folder of the active project, null on the welcome screen */
    readonly project: string | null
    onDidChangeProject(cb: (root: string | null) => void): () => void
    /** opens a file in an editor tab of the active project */
    openFile(path: string): void
    fs: {
      exists(path: string): boolean
      read(path: string): string
      list(path: string): { name: string; dir: boolean }[]
      watch(path: string, cb: () => void): () => void
    }
  }
  ui: {
    /** a view declared in plugin.json (contributes.views[].id) */
    view(id: string): { set(model: ViewModel): void; onEvent(cb: (e: ViewEvent) => void): () => void }
    notify(title: string, body?: string): void
    /** modal text input; resolves null when cancelled */
    prompt(req: { title: string; placeholder?: string; options?: string[] }): Promise<string | null>
  }
  terminal: {
    /** types a command into a shell tab of the active project ('reuse' an idle one, or 'new') */
    run(req: { cwd: string; command: string; label?: string; tab?: 'reuse' | 'new' }): void
    /** a foreground command ended in a shell tab of the active project */
    onCommandEnd(cb: (info: { command: string; exit: number | null }) => void): () => void
  }
  /** requires the "process" permission */
  process: { exec(file: string, args?: string[], opts?: { cwd?: string }): Promise<{ code: number; stdout: string; stderr: string }> }
  settings: { get(key: string): unknown }
  storage: { get(key: string): unknown; set(key: string, value: unknown): void }
}
