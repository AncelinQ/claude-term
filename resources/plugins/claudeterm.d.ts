/**
 * ClaudeTerm plugin API. A plugin is a folder with plugin.json and main.js exporting activate(ctx) (optionally
 * deactivate()). It runs in a sandboxed browser context: no Node, no network, `require` only for its own .js files
 * (relative paths). Everything else goes through ctx, checked against the permissions of plugin.json:
 * - "process": process.exec, terminal.run, workspace.openProject and workspace.openUrl
 * - "claude": claude.run (an isolated claude -p, on the user's subscription)
 * - "network": net.fetch, https to the hosts listed in plugin.json `"hosts"` only ("api.linear.app", "*.linear.app")
 * - "secrets": secrets (API keys…), encrypted by the OS, the plugin's own
 * - "sessions": claude.sessions, the user's Claude Code sessions (title, folder, branch, cost, merge requests, tickets)
 * - fs (exists / read / list / watch, openFile): the plugin folder and the open project; "fs:home" widens it to the
 *   home folder. Absolute paths only.
 */
export interface ViewAction { id: string; title: string; icon?: string; primary?: boolean }
export interface ViewItem {
  id: string; label: string; detail?: string; extra?: string; icon?: string; color?: string
  /** file path → file-type icon; folder path → folder icon */
  file?: string; folder?: string
  badges?: string[]; actions?: ViewAction[]; contextMenu?: (ViewAction | 'sep')[]; children?: ViewItem[]; expanded?: boolean; checked?: boolean; muted?: boolean
}
export type ViewModel =
  | { kind: 'empty'; text: string }
  | { kind: 'list'; items: ViewItem[]; toolbar?: ViewAction[] }
  /** foldAll: Tout replier / Tout déplier in the header (the open state is the app's, kept per project) */
  | { kind: 'tree'; items: ViewItem[]; toolbar?: ViewAction[]; foldAll?: boolean }
  | { kind: 'markdown'; text: string }
  | { kind: 'diff'; text: string }
export interface ViewEvent { viewId: string; type: 'select' | 'open' | 'action' | 'toolbar'; itemId?: string; actionId?: string }

export interface TicketTrace { title?: string; url?: string; branch?: string; status?: string; statusAt?: string; statusSetByClaude?: boolean }
export interface Session {
  id: string; title: string; cwd: string; modified: number; branch?: string; tabName?: string
  cost?: { usd: number; kind: 'exact' | 'estimated' | 'atLeast' }
  prs: { url: string; number?: number; repository?: string }[]
  tickets: Record<string, TicketTrace>
}

export interface Context {
  plugin: { id: string; dir: string }
  workspace: {
    /** root folder of the active project, null on the welcome screen */
    readonly project: string | null
    onDidChangeProject(cb: (root: string | null) => void): () => void
    /** the open projects (welcome screens left out) and the folders linked to each */
    projects(): { root: string; linked: string[] }[]
    onDidChangeProjects(cb: (projects: { root: string; linked: string[] }[]) => void): () => void
    /** the workbench window is on screen: pause polling while it is not */
    readonly visible: boolean
    onDidChangeVisibility(cb: (visible: boolean) => void): () => void
    /**
     * Opens a folder as a project (or brings it to the front); requires "process". `claude`: with a Claude tab when it
     * opens. `resume`: a Claude tab resuming that session. `prompt`: a new Claude tab that sends it as its first message
     * once Claude is ready (after the folder trust question, which stays the user's).
     */
    openProject(path: string, opts?: { claude?: boolean; resume?: string; prompt?: string }): void
    /** an https link, or http on this machine, in the default browser; requires "process" */
    openUrl(url: string): void
    /** opens a file in an editor tab of the active project */
    openFile(path: string): void
    fs: {
      exists(path: string): boolean
      read(path: string): string
      list(path: string): { name: string; dir: boolean }[]
      /** non-recursive; cb gets the changed entry name when the OS reports it */
      watch(path: string, cb: (name?: string) => void): () => void
    }
  }
  ui: {
    /** a view declared in plugin.json (contributes.views[].id) */
    view(id: string): { set(model: ViewModel): void; onEvent(cb: (e: ViewEvent) => void): () => void }
    notify(title: string, body?: string): void
    /** puts text in the system clipboard */
    clipboard(text: string): void
    /**
     * A short chip on the project tab of `root`, or on a linked folder with that path (null removes it). One per plugin
     * and folder; `tone` adds a status dot.
     */
    projectDecoration(root: string, deco: { text: string; tone?: 'ok' | 'warn' | 'error' | 'info'; tooltip?: string } | null): void
    /** modal text input (`choice`: the options only, as buttons); resolves null when cancelled */
    prompt(req: { title: string; placeholder?: string; options?: string[]; choice?: boolean }): Promise<string | null>
  }
  terminal: {
    /**
     * Types a command into a shell tab of the active project ('reuse' an idle one, or 'new'). `command` is typed as
     * is; `argv` commands are quoted for the tab's shell (zsh / bash / PowerShell) and chained: each one runs only
     * when the previous one succeeded. Prefer argv for anything built from user input.
     */
    run(req: { cwd: string; command?: string; argv?: string[][]; label?: string; tab?: 'reuse' | 'new' }): string
    /** commands this plugin started that are still running (started: the shell has begun running it) */
    runs(): { id: string; tabId: string; cwd: string; command: string; label?: string; started: boolean }[]
    onDidChangeRuns(cb: (runs: { id: string; tabId: string; cwd: string; command: string; label?: string; started: boolean }[]) => void): () => void
    /** Ctrl+C in the tab running it (requires "process"); show: brings its tab to the front */
    stop(id: string): void
    show(id: string): void
    /** a foreground command ended in a shell tab of the active project */
    onCommandEnd(cb: (info: { command: string; exit: number | null }) => void): () => void
  }
  /** requires the "process" permission */
  process: { exec(file: string, args?: string[], opts?: { cwd?: string }): Promise<{ code: number; stdout: string; stderr: string }> }
  /**
   * Requires the "claude" permission. An isolated `claude -p` (no tool, no MCP, no settings, no session kept, $1 cap
   * per run): `instructions` become its system prompt, `input` what it reads; or a `preset`, the app's own
   * instructions for a commit message (following `recentSubjects`) or a merge request (in the interface's language).
   * Run it on the user's click only, and show `costUsd`.
   */
  claude: {
    run(req: { input: string; instructions?: string; preset?: { kind: 'commit'; recentSubjects: string[] } | { kind: 'mr' }; model?: string }): Promise<{ text: string; costUsd?: number; model?: string }>
    /**
     * Requires "sessions". The sessions written to in the last `days` days (90 by default), newest first: the branch
     * they were on last, the merge requests they opened (pr-link), the tickets Claude read or changed through a Linear
     * MCP server with their last known state, and what they cost.
     */
    sessions(opts?: { days?: number }): Promise<Session[]>
  }
  /**
   * Requires "network". Sent by the app without cookies: a string body (≤ 1 MB), an answer read whole (≤ 5 MB, 30 s),
   * redirects followed within the declared hosts only. Host, Cookie, Origin and the like are the app's to set.
   */
  net: {
    fetch(url: string, init?: { method?: 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; headers?: Record<string, string>; body?: string }): Promise<{
      ok: boolean; status: number; statusText: string; headers: Record<string, string>; text(): Promise<string>; json(): Promise<any>
    }>
  }
  /** Requires "secrets". Names: 1-64 letters, digits, . _ -; removed with the plugin. */
  secrets: { get(key: string): Promise<string | undefined>; set(key: string, value: string): Promise<void>; delete(key: string): Promise<void> }
  settings: { get(key: string): unknown }
  storage: { get(key: string): unknown; set(key: string, value: unknown): void }
}
