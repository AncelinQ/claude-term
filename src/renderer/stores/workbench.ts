import { create } from 'zustand'
import type { ResolvedTheme } from '@shared/theme'
import type { Settings, TabKind, SessionState } from '@shared/ipc'

export interface Tab {
  id: string
  kind: TabKind | 'file'
  title: string
  cwd: string
  ptyId?: string
  path?: string
  alive: boolean
  exitCode?: number
  /** a foreground command is running (shell integration) */
  busy: boolean
  lastCommand: string
  lastExit: number | null
  /** `claude` typed in a shell tab */
  claudeRunning: boolean
  /** derived Claude session state (main's SessionTracker) */
  session?: SessionState
}

export const isClaude = (t: Tab) => t.kind === 'claude' || t.claudeRunning

export interface Project {
  id: string
  root: string | null
  tabs: Tab[]
  currentTabId: string | null
  selectedPath: string | null
  selectedFolder: string
}

export type LeftActivity = 'explorer' | 'search' | 'scripts' | 'skills' | 'mcp' | 'plugins'
export type RightActivity = 'process' | 'history' | 'skills'

interface Workbench {
  theme: ResolvedTheme | null
  settings: Settings | null
  projects: Project[]
  activeProjectId: string | null
  /** last Claude tab shown per project: the session block keeps following it */
  lastClaudeTab: Record<string, string>
  sessionMode: 'plan' | 'activity' | 'files'
  setSessionMode(m: 'plan' | 'activity' | 'files'): void
  leftActivity: LeftActivity | null
  rightActivity: RightActivity | null
  layout: Record<string, number | boolean>
  /** Updates a layout value; the settings file is written after a short delay (drags). */
  setLayout(key: string, value: number | boolean | ((prev: number) => number)): void

  init(): Promise<void>
  setLeft(a: LeftActivity | null): void
  setRight(a: RightActivity | null): void
  newProject(root?: string | null): Project
  setRoot(id: string, root: string): void
  closeProject(id: string): void
  setActiveProject(id: string): void
  select(projectId: string, path: string, isDir: boolean): void
  newTab(projectId: string, kind: TabKind, cwd?: string): Promise<void>
  closeTab(projectId: string, tabId: string): void
  setCurrentTab(projectId: string, tabId: string): void
  tabExited(ptyId: string, code: number): void
  /** "start;<cmd>" | "end;<exit>" from the shell hooks (OSC 7770) */
  shellEvent(tabId: string, msg: string): void
  setCwd(tabId: string, cwd: string): void
}

let seq = 0
const nid = () => 'p' + ++seq
const name = (root: string | null) => (root ? root.split(/[\\/]/).filter(Boolean).pop() ?? root : 'Nouveau projet')

export const useWorkbench = create<Workbench>((set, get) => ({
  theme: null,
  settings: null,
  projects: [],
  activeProjectId: null,
  lastClaudeTab: {},
  sessionMode: 'plan',
  setSessionMode(m) { set({ sessionMode: m }) },
  leftActivity: 'explorer',
  rightActivity: null,
  layout: {},

  async init() {
    const [theme, settings] = await Promise.all([window.ct.themes.current(), window.ct.settings.get()])
    const projects: Project[] = []
    for (const root of settings.openProjects) {
      if (await window.ct.fs.exists(root)) projects.push({ id: nid(), root, tabs: [], currentTabId: null, selectedPath: null, selectedFolder: root })
    }
    if (projects.length === 0) projects.push({ id: nid(), root: null, tabs: [], currentTabId: null, selectedPath: null, selectedFolder: window.ct.home })
    set({ theme, settings, projects, activeProjectId: projects[0].id, leftActivity: settings.leftActivity as LeftActivity | null, rightActivity: settings.rightActivity as RightActivity | null, layout: settings.layout ?? {} })
    window.ct.themes.onChange((theme) => set({ theme }))
    window.ct.settings.onChange((settings) => set({ settings }))
    window.ct.claude.onUpdate(({ tabId, state }) => patchTab(set, tabId, () => ({ session: state, title: state.title ?? undefined })))
  },

  setLeft(a) { set({ leftActivity: a }); window.ct.settings.set({ leftActivity: a }) },
  setRight(a) { set({ rightActivity: a }); window.ct.settings.set({ rightActivity: a }) },
  setLayout(key, value) {
    set((s) => {
      const prev = s.layout[key]
      const next = typeof value === 'function' ? value(typeof prev === 'number' ? prev : 0) : value
      return { layout: { ...s.layout, [key]: next } }
    })
    scheduleLayoutSave(get)
  },

  newProject(root = null) {
    const p: Project = { id: nid(), root, tabs: [], currentTabId: null, selectedPath: null, selectedFolder: root ?? window.ct.home }
    set((s) => ({ projects: [...s.projects, p], activeProjectId: p.id }))
    persistProjects(get)
    return p
  },
  setRoot(id, root) {
    set((s) => ({ projects: s.projects.map((p) => (p.id === id ? { ...p, root, selectedFolder: root, selectedPath: null } : p)) }))
    persistProjects(get)
    const st = get().settings
    if (st) window.ct.settings.set({ recentProjects: [root, ...st.recentProjects.filter((r) => r !== root)].slice(0, 15) })
  },
  closeProject(id) {
    const p = get().projects.find((x) => x.id === id)
    p?.tabs.forEach((t) => t.ptyId && window.ct.pty.kill(t.ptyId))
    set((s) => {
      const projects = s.projects.filter((x) => x.id !== id)
      const active = s.activeProjectId === id ? projects[0]?.id ?? null : s.activeProjectId
      return { projects, activeProjectId: active }
    })
    if (get().projects.length === 0) get().newProject(null)
    persistProjects(get)
  },
  setActiveProject(id) { set({ activeProjectId: id }) },

  select(projectId, path, isDir) {
    const folder = isDir ? path : path.replace(/[\\/][^\\/]*$/, '')
    set((s) => ({ projects: s.projects.map((p) => (p.id === projectId ? { ...p, selectedPath: path, selectedFolder: folder } : p)) }))
  },

  async newTab(projectId, kind, cwd) {
    const p = get().projects.find((x) => x.id === projectId)
    if (!p) return
    const dir = cwd ?? p.selectedFolder
    const { id: ptyId, error } = await window.ct.pty.create({ cwd: dir, kind, projectRoot: p.root ?? undefined })
    const tab: Tab = { id: 't' + ++seq, kind, title: name(dir), cwd: dir, ptyId, alive: !error, busy: false, lastCommand: '', lastExit: null, claudeRunning: false }
    if (error) tab.title += ' (erreur)'
    set((s) => ({ projects: s.projects.map((x) => (x.id === projectId ? { ...x, tabs: [...x.tabs, tab], currentTabId: tab.id } : x)), lastClaudeTab: kind === 'claude' ? { ...s.lastClaudeTab, [projectId]: tab.id } : s.lastClaudeTab }))
    if (error) console.error(error)
    else if (kind === 'claude') window.ct.claude.track(tab.id, dir)
  },
  closeTab(projectId, tabId) {
    const p = get().projects.find((x) => x.id === projectId)
    const t = p?.tabs.find((x) => x.id === tabId)
    if (t?.ptyId) window.ct.pty.kill(t.ptyId)
    window.ct.claude.untrack(tabId)
    set((s) => ({
      projects: s.projects.map((x) => {
        if (x.id !== projectId) return x
        const idx = x.tabs.findIndex((y) => y.id === tabId)
        const tabs = x.tabs.filter((y) => y.id !== tabId)
        const current = x.currentTabId === tabId ? tabs[Math.min(idx, tabs.length - 1)]?.id ?? null : x.currentTabId
        return { ...x, tabs, currentTabId: current }
      }),
    }))
  },
  setCurrentTab(projectId, tabId) {
    set((s) => {
      const t = s.projects.find((p) => p.id === projectId)?.tabs.find((x) => x.id === tabId)
      return { projects: s.projects.map((x) => (x.id === projectId ? { ...x, currentTabId: tabId } : x)), lastClaudeTab: t && isClaude(t) ? { ...s.lastClaudeTab, [projectId]: tabId } : s.lastClaudeTab }
    })
  },
  tabExited(ptyId, code) {
    set((s) => ({ projects: s.projects.map((p) => ({ ...p, tabs: p.tabs.map((t) => (t.ptyId === ptyId ? { ...t, alive: false, exitCode: code, busy: false, claudeRunning: false } : t)) })) }))
  },
  shellEvent(tabId, msg) {
    const [kind, rest = ''] = msg.split(/;(.*)/s)
    patchTab(set, tabId, (t) => {
      if (kind === 'start') {
        const claude = /^\s*claude(\s|$)/.test(rest)
        if (claude) {
          const resume = rest.match(/(?:--resume|-r)\s+(\S+)/)?.[1]
          const reuse = /--continue|--resume|\s-c\b|\s-r\b/.test(rest)
          window.ct.claude.track(t.id, t.cwd, { resume, reuse })
          set((s) => ({ lastClaudeTab: { ...s.lastClaudeTab, [projectOf(s, t.id)]: t.id } }))
          return { busy: true, lastCommand: rest, lastExit: null, claudeRunning: true, session: undefined }
        }
        return { busy: true, lastCommand: rest, lastExit: null }
      }
      if (kind === 'end') {
        if (t.claudeRunning) window.ct.claude.untrack(t.id)
        return { busy: false, lastExit: rest === '' ? null : +rest, claudeRunning: false, title: name(t.cwd) }
      }
      return {}
    })
  },
  setCwd(tabId, cwd) { patchTab(set, tabId, (t) => (t.cwd === cwd ? {} : { cwd, title: name(cwd) })) },
}))

function projectOf(s: Workbench, tabId: string): string {
  return s.projects.find((p) => p.tabs.some((t) => t.id === tabId))?.id ?? ''
}

function patchTab(set: (fn: (s: Workbench) => Partial<Workbench>) => void, tabId: string, patch: (t: Tab) => Partial<Tab>) {
  set((s) => ({ projects: s.projects.map((p) => ({ ...p, tabs: p.tabs.map((t) => (t.id === tabId ? { ...t, ...patch(t) } : t)) })) }))
}

let layoutTimer: ReturnType<typeof setTimeout> | undefined
function scheduleLayoutSave(get: () => Workbench) {
  clearTimeout(layoutTimer)
  layoutTimer = setTimeout(() => window.ct.settings.set({ layout: get().layout }), 400)
}

function persistProjects(get: () => Workbench) {
  window.ct.settings.set({ openProjects: get().projects.map((p) => p.root).filter((r): r is string => !!r) })
}

export const useActiveProject = () => useWorkbench((s) => s.projects.find((p) => p.id === s.activeProjectId) ?? null)

/** The Claude tab the session block shows: the current tab if it is Claude, else the last Claude tab used. */
export function sessionTab(s: Workbench, p: Project): Tab | null {
  const cur = p.tabs.find((t) => t.id === p.currentTabId)
  if (cur && isClaude(cur)) return cur
  const last = p.tabs.find((t) => t.id === s.lastClaudeTab[p.id])
  return last && isClaude(last) ? last : null
}
