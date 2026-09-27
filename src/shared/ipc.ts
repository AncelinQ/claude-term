/** Typed contract between renderer (`window.ct`) and main. */
import type { ThemeSpec, ResolvedTheme } from './theme'
import type { ToolEvent } from './claude-format'

export type TabKind = 'claude' | 'shell'

export interface PtyCreate {
  cwd: string
  kind: TabKind
  /** `claude --resume <id>` */
  resume?: string
  /** exported as CLAUDETERM_ROOT for the shell's `claude` wrapper */
  projectRoot?: string
}

/** Shell-integration and cwd events parsed from OSC sequences in the renderer. */
export const OSC_SHELL = 7770

/** Derived state of one Claude session, kept in main by the SessionTracker. */
export interface SessionState {
  sessionId?: string
  title?: string
  events: ToolEvent[]
  /** absolute path → number of accesses */
  files: Record<string, number>
  backups: Record<string, { name: string; version: number }>
  bashDiffs: Record<string, string[]>
  inputTokens: number
  outputTokens: number
  planPath?: string
  planText: string
  planMode: boolean
  permissionMode?: string
  runningTools: { id: string; name: string; detail: string }[]
}

/** What a Claude tab is waiting for, as reported by Claude Code hooks. */
export interface Attention { kind: 'permission' | 'idle' | 'done'; message: string }

export interface SessionInfo {
  id: string
  path: string
  title: string
  modified: number
  projectPath: string
  messageCount: number
  gitBranch: string
}

export interface PlanInfo { path: string; title: string; modified: number }

export interface DirEntry {
  name: string
  path: string
  isDir: boolean
  hidden: boolean
}

export interface Settings {
  themeFollowSystem: boolean
  themeDark: string
  themeLight: string
  themeFixed: string
  fontFamily: string
  fontSize: number
  openProjects: string[]
  recentProjects: string[]
  leftActivity: string | null
  rightActivity: string | null
  /** sizes (px) and collapsed flags of the workbench, by element id */
  layout: Record<string, number | boolean>
  /** OS notifications when the tab is not visible */
  notifyOS: boolean
  dockBadge: boolean
  /** Windows: run claude natively or inside WSL */
  windowsMode: 'native' | 'wsl'
  wslDistro: string
}

export const DEFAULT_SETTINGS: Settings = {
  themeFollowSystem: true,
  themeDark: 'claudeterm-dark',
  themeLight: 'claudeterm-light',
  themeFixed: 'claudeterm-dark',
  fontFamily: '',
  fontSize: 13,
  openProjects: [],
  recentProjects: [],
  leftActivity: 'explorer',
  rightActivity: null,
  layout: {},
  notifyOS: true,
  dockBadge: true,
  windowsMode: 'native',
  wslDistro: '',
}

export interface CtApi {
  platform: NodeJS.Platform
  home: string
  pty: {
    create(opts: PtyCreate): Promise<{ id: string; error?: string }>
    write(id: string, data: string): void
    resize(id: string, cols: number, rows: number): void
    kill(id: string): void
    onData(id: string, cb: (data: string) => void): () => void
    onExit(id: string, cb: (code: number) => void): () => void
  }
  fs: {
    readdir(path: string): Promise<DirEntry[]>
    exists(path: string): Promise<boolean>
  }
  themes: {
    list(): Promise<ThemeSpec[]>
    current(): Promise<ResolvedTheme>
    onChange(cb: (t: ResolvedTheme) => void): () => void
  }
  settings: {
    get(): Promise<Settings>
    set(patch: Partial<Settings>): Promise<Settings>
    onChange(cb: (s: Settings) => void): () => void
  }
  claude: {
    /** Follows the Claude session of a tab (claude tab, or `claude` typed in a shell). */
    track(tabId: string, cwd: string, opts?: { resume?: string; reuse?: boolean }): void
    untrack(tabId: string): void
    onUpdate(cb: (u: { tabId: string; state: SessionState; newEvents: ToolEvent[] }) => void): () => void
    setPlan(tabId: string, path: string | null): void
    plans(): Promise<PlanInfo[]>
    sessions(cwd: string): Promise<SessionInfo[]>
    allSessions(): Promise<SessionInfo[]>
    hasSessions(cwd: string): Promise<boolean>
    deleteSession(s: SessionInfo): Promise<void>
    sessionDiff(path: string, backupName: string | null, sessionId: string): Promise<string>
    readText(path: string): Promise<string>
    onAttention(cb: (u: { tabId: string; attention: Attention | null }) => void): () => void
    clearAttention(tabId: string): void
    /** the tab currently visible (for notification and attention decisions) */
    visibleTab(tabId: string | null): void
    onFocusTab(cb: (tabId: string) => void): () => void
    hooksInstalled(): Promise<boolean>
    setHooksInstalled(on: boolean): Promise<{ ok: boolean; error?: string }>
  }
  setHooks(on: boolean): Promise<{ ok: boolean; error?: string }>
  app: {
    pickFolder(): Promise<string | null>
    openExternal(path: string): void
    revealInFinder(path: string): void
  }
}
