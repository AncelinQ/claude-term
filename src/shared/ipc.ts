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

export interface LinkedProject { path: string; role: string; readOnly: boolean }

export interface SkillInfo {
  name: string
  description: string
  path: string
  source: 'project' | 'linked' | 'personal' | 'plugin'
  isCommand: boolean
  manualOnly: boolean
  autoOnly: boolean
}

export interface MCPServer {
  name: string
  transport: 'stdio' | 'http' | 'sse'
  command: string
  args: string[]
  url: string
  env: Record<string, string>
  headers: Record<string, string>
  scope: 'project' | 'linked' | 'local' | 'user' | 'claudeAI' | 'plugin'
  sourcePath: string
  disabled: boolean
  health?: 'unknown' | 'connected' | 'needsAuth' | 'failed'
}

export interface ClaudeProcess {
  pid: number
  started: number
  elapsed: string
  cpu: string
  memMB: number
  cwd: string
  children: { pid: number; command: string; cpu: string }[]
}

export interface DirEntry {
  name: string
  path: string
  isDir: boolean
  hidden: boolean
}

export interface Settings {
  language: 'system' | 'fr' | 'en'
  themeFollowSystem: boolean
  themeDark: string
  themeLight: string
  themeFixed: string
  /** terminal font (empty = default mono stack) */
  fontFamily: string
  fontSize: number
  /** editor font, independent from the terminal */
  editorFontFamily: string
  editorFontSize: number
  editorLineHeight: number
  editorWordWrap: boolean
  editorMinimap: boolean
  /** editor: write the file after a pause in typing (ms), 0 = off */
  autoSave: boolean
  autoSaveDelay: number
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
  language: 'system',
  themeFollowSystem: true,
  themeDark: 'claudeterm-dark',
  themeLight: 'claudeterm-light',
  themeFixed: 'claudeterm-dark',
  fontFamily: '',
  fontSize: 13,
  editorFontFamily: '',
  editorFontSize: 13,
  editorLineHeight: 0,
  editorWordWrap: false,
  editorMinimap: false,
  autoSave: true,
  autoSaveDelay: 1000,
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
    /** editor: kind by content; text or image data URL */
    readFile(path: string): Promise<{ kind: 'text' | 'image' | 'other'; text?: string; dataUrl?: string; error?: string }>
    writeFile(path: string, text: string): Promise<{ ok: boolean; error?: string }>
    watch(path: string): void
    unwatch(path: string): void
    onChanged(cb: (path: string) => void): () => void
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
  links: {
    load(root: string): Promise<LinkedProject[]>
    save(root: string, links: LinkedProject[]): Promise<{ ok: boolean; error?: string }>
  }
  skills: {
    project(root: string): Promise<SkillInfo[]>
    linked(root: string): Promise<SkillInfo[]>
    personal(): Promise<SkillInfo[]>
    plugins(): Promise<SkillInfo[]>
    create(name: string, description: string, root: string | null): Promise<{ ok: boolean; path?: string; error?: string }>
    remove(s: SkillInfo): Promise<{ ok: boolean; error?: string }>
  }
  mcp: {
    project(root: string): Promise<MCPServer[]>
    linked(root: string): Promise<MCPServer[]>
    user(): Promise<MCPServer[]>
    local(root: string): Promise<MCPServer[]>
    library(root: string | null): Promise<MCPServer[]>
    write(server: MCPServer, root: string, replacing?: string): Promise<{ ok: boolean; error?: string }>
    remove(name: string, root: string): Promise<{ ok: boolean; error?: string }>
    cli(args: string[], cwd: string | null): Promise<{ code: number; output: string }>
    /** `claude mcp list` parsed: name → health */
    health(cwd: string | null): Promise<Record<string, 'connected' | 'needsAuth' | 'failed'>>
  }
  processes: {
    scan(): Promise<ClaudeProcess[]>
    kill(pid: number, signal?: 'SIGTERM' | 'SIGKILL'): void
  }
  search: {
    files(root: string, query: string): Promise<string[]>
  }
  app: {
    /** "Enregistrer" | "Ne pas enregistrer" | "Annuler" → 'save' | 'discard' | 'cancel' */
    confirmSave(name: string): Promise<'save' | 'discard' | 'cancel'>
    pickFolder(): Promise<string | null>
    openExternal(path: string): void
    revealInFinder(path: string): void
  }
}
