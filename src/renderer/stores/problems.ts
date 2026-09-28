import { create } from 'zustand'
import type { Diagnostic, Todo } from '@shared/problems'
import { useWorkbench } from './workbench'

type Tool = { tool: 'tsc' | 'eslint'; dir: string; config?: string; ok: boolean; error?: string }

/**
 * Errors and TODO of the active project. Checked when the project opens, after a save and when a Claude turn ends
 * (the files it edited), and on the refresh button; debounced, one check at a time (main queues the next).
 */
interface ProblemsStore {
  root: string | null
  diagnostics: Diagnostic[]
  tools: Tool[] | null
  todos: Todo[]
  checking: boolean
  at: number
  load(root: string | null): void
  /** a check soon (saves, Claude turns): debounced */
  soon(): void
}

let timer: ReturnType<typeof setTimeout> | undefined

export const useProblems = create<ProblemsStore>((set, get) => ({
  root: null,
  diagnostics: [],
  tools: null,
  todos: [],
  checking: false,
  at: 0,
  load(root) {
    if (root !== get().root) set({ root, diagnostics: [], tools: null, todos: [], at: 0 })
    if (!root) return
    set({ checking: true })
    window.ct.problems.check(root).then((r) => { if (get().root === root) set({ diagnostics: r.diagnostics, tools: r.tools, at: r.at, checking: false }) })
    window.ct.problems.todos(root).then((todos) => { if (get().root === root) set({ todos }) })
  },
  soon() { clearTimeout(timer); timer = setTimeout(() => get().load(get().root), 1500) },
}))

// the active project, and the end of Claude turns (attention "done")
let lastRoot: string | null = null
let done = new Set<string>()
useWorkbench.subscribe((s) => {
  const root = s.projects.find((p) => p.id === s.activeProjectId)?.root ?? null
  if (root !== lastRoot) { lastRoot = root; useProblems.getState().load(root) }
  const now = new Set(s.projects.flatMap((p) => p.tabs).filter((t) => t.attention?.kind === 'done').map((t) => t.id))
  if ([...now].some((id) => !done.has(id))) useProblems.getState().soon()
  done = now
})
