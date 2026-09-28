import { create } from 'zustand'
import type { RunGroup, RunItem, Running } from '@shared/runnables'
import type { RunLine } from '@shared/run-lines'
import { normId } from '@shared/run-lines'
import { useWorkbench } from './workbench'

/**
 * The Exécuter panel's state (Scripts tab): what the active project can run, and the commands it started, followed
 * through the tab that runs them (tab.run, shell integration) until they end. The editor's gutter ▶ goes through here
 * too, so a line started from a file shows in "En cours" and can be stopped.
 */
interface RunnablesStore {
  root: string | null
  groups: RunGroup[]
  /** run id → what was started */
  launched: Record<string, { itemId: string; label: string; command: string }>
  load(root: string | null): Promise<void>
  item(itemId: string): RunItem | undefined
  runItem(itemId: string): void
  runLine(line: RunLine): void
  stop(runId: string): void
  show(runId: string): void
  /** runs still alive, from the tabs */
  running(): Running[]
  /** the run of an item (or of a gutter line), matched across path spellings */
  runOf(itemId: string): string | undefined
}

let seq = 0

export const useRunnables = create<RunnablesStore>((set, get) => ({
  root: null,
  groups: [],
  launched: {},
  async load(root) {
    set({ root })
    const groups = root ? await window.ct.runnables.detect(root) : []
    if (get().root === root) set({ groups })
  },
  item(itemId) {
    const want = normId(itemId)
    for (const g of get().groups) for (const c of g.children) if (normId(c.id) === want) return c
    return undefined
  },
  runItem(itemId) {
    const it = get().item(itemId)
    if (it) start(it.id, it.label, it.cwd, it.command)
  },
  runLine(line) {
    // a script the tab lists runs as its item (its package manager), any other line as is
    const it = get().item(line.itemId)
    if (it) start(it.id, it.label, it.cwd, it.command)
    else start(line.itemId, line.label, line.cwd, line.command)
  },
  stop(runId) { const t = tabOfRun(runId); if (t?.ptyId) window.ct.pty.write(t.ptyId, '\x03') },
  show(runId) {
    const st = useWorkbench.getState()
    for (const p of st.projects) { const t = p.tabs.find((x) => x.run?.id === runId); if (t) { st.setActiveProject(p.id); st.setCurrentTab(p.id, t.id); return } }
  },
  running() {
    const launched = get().launched
    return useWorkbench.getState().projects.flatMap((p) => p.tabs).filter((t) => t.alive && t.run && launched[t.run.id])
      .map((t) => ({ runId: t.run!.id, itemId: launched[t.run!.id].itemId, label: launched[t.run!.id].label, command: t.lastCommand || launched[t.run!.id].command, started: t.run!.started }))
  },
  runOf(itemId) {
    const want = normId(itemId)
    return get().running().find((r) => r.itemId && normId(r.itemId) === want)?.runId
  },
}))

function start(itemId: string, label: string, cwd: string, command: string) {
  const st = useWorkbench.getState()
  if (!st.activeProjectId) return
  const id = `run:${++seq}`
  useRunnables.setState((s) => ({ launched: { ...s.launched, [id]: { itemId, label, command } } }))
  st.runCommand(st.activeProjectId, cwd, [command], 'reuse', { id, label })
}

function tabOfRun(runId: string) {
  for (const p of useWorkbench.getState().projects) { const t = p.tabs.find((x) => x.run?.id === runId); if (t) return t }
  return undefined
}

/** forget runs whose tab no longer carries them */
useWorkbench.subscribe((s) => {
  const alive = new Set(s.projects.flatMap((p) => p.tabs).filter((t) => t.run).map((t) => t.run!.id))
  const l = useRunnables.getState().launched
  // a run shows on its tab a moment after start(): only those already seen on a tab are forgotten
  const gone = Object.keys(l).filter((id) => !alive.has(id))
  if (gone.length) {
    const next = { ...l }
    for (const id of gone) if (seenOnTab.has(id)) { delete next[id]; seenOnTab.delete(id) }
    if (Object.keys(next).length !== Object.keys(l).length) useRunnables.setState({ launched: next })
  }
  for (const id of alive) if (l[id]) seenOnTab.add(id)
})
const seenOnTab = new Set<string>()
