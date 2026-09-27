/** Typed contract between renderer (`window.ct`) and main. */
import type { ThemeSpec, ResolvedTheme } from './theme'

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
  app: {
    pickFolder(): Promise<string | null>
    openExternal(path: string): void
    revealInFinder(path: string): void
  }
}
