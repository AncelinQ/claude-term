import { create } from 'zustand'
import type { ResolvedTheme } from '@shared/theme'
import type { Settings, TabKind } from '@shared/ipc'

export interface Tab {
  id: string
  kind: TabKind | 'file'
  title: string
  cwd: string
  ptyId?: string
  path?: string
  alive: boolean
  exitCode?: number
}

export interface Project {
  id: string
  root: string | null
  tabs: Tab[]
  currentTabId: string | null
  selectedPath: string | null
  selectedFolder: string
}

export type LeftActivity = 'explorer' | 'search' | 'scripts' | 'mcp' | 'plugins'
export type RightActivity = 'process' | 'history' | 'skills'

interface Workbench {
  theme: ResolvedTheme | null
  settings: Settings | null
  projects: Project[]
  activeProjectId: string | null
  leftActivity: LeftActivity | null
  rightActivity: RightActivity | null
  sessionCollapsed: boolean

  init(): Promise<void>
  setLeft(a: LeftActivity | null): void
  setRight(a: RightActivity | null): void
  toggleSession(): void
  newProject(root?: string | null): Project
  setRoot(id: string, root: string): void
  closeProject(id: string): void
  setActiveProject(id: string): void
  select(projectId: string, path: string, isDir: boolean): void
  newTab(projectId: string, kind: TabKind, cwd?: string): Promise<void>
  closeTab(projectId: string, tabId: string): void
  setCurrentTab(projectId: string, tabId: string): void
  tabExited(ptyId: string, code: number): void
}

let seq = 0
const nid = () => 'p' + ++seq
const name = (root: string | null) => (root ? root.split(/[\\/]/).filter(Boolean).pop() ?? root : 'Nouveau projet')

export const useWorkbench = create<Workbench>((set, get) => ({
  theme: null,
  settings: null,
  projects: [],
  activeProjectId: null,
  leftActivity: 'explorer',
  rightActivity: null,
  sessionCollapsed: false,

  async init() {
    const [theme, settings] = await Promise.all([window.ct.themes.current(), window.ct.settings.get()])
    const projects: Project[] = []
    for (const root of settings.openProjects) {
      if (await window.ct.fs.exists(root)) projects.push({ id: nid(), root, tabs: [], currentTabId: null, selectedPath: null, selectedFolder: root })
    }
    if (projects.length === 0) projects.push({ id: nid(), root: null, tabs: [], currentTabId: null, selectedPath: null, selectedFolder: window.ct.home })
    set({ theme, settings, projects, activeProjectId: projects[0].id, leftActivity: settings.leftActivity as LeftActivity | null, rightActivity: settings.rightActivity as RightActivity | null })
    window.ct.themes.onChange((theme) => set({ theme }))
    window.ct.settings.onChange((settings) => set({ settings }))
  },

  setLeft(a) { set({ leftActivity: a }); window.ct.settings.set({ leftActivity: a }) },
  setRight(a) { set({ rightActivity: a }); window.ct.settings.set({ rightActivity: a }) },
  toggleSession() { set((s) => ({ sessionCollapsed: !s.sessionCollapsed })) },

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
    const { id: ptyId, error } = await window.ct.pty.create({ cwd: dir, kind })
    const tab: Tab = { id: 't' + ++seq, kind, title: (kind === 'claude' ? '✳ ' : '') + name(dir), cwd: dir, ptyId, alive: !error }
    if (error) tab.title += ' (erreur)'
    set((s) => ({ projects: s.projects.map((x) => (x.id === projectId ? { ...x, tabs: [...x.tabs, tab], currentTabId: tab.id } : x)) }))
    if (error) console.error(error)
  },
  closeTab(projectId, tabId) {
    const p = get().projects.find((x) => x.id === projectId)
    const t = p?.tabs.find((x) => x.id === tabId)
    if (t?.ptyId) window.ct.pty.kill(t.ptyId)
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
    set((s) => ({ projects: s.projects.map((x) => (x.id === projectId ? { ...x, currentTabId: tabId } : x)) }))
  },
  tabExited(ptyId, code) {
    set((s) => ({ projects: s.projects.map((p) => ({ ...p, tabs: p.tabs.map((t) => (t.ptyId === ptyId ? { ...t, alive: false, exitCode: code } : t)) })) }))
  },
}))

function persistProjects(get: () => Workbench) {
  window.ct.settings.set({ openProjects: get().projects.map((p) => p.root).filter((r): r is string => !!r) })
}

export const useActiveProject = () => useWorkbench((s) => s.projects.find((p) => p.id === s.activeProjectId) ?? null)
