// Lanceur: lists what the project can run, runs it in a shell tab, shows what is running and stops it.
const { detect } = require('./detect')
const { withRuns, runOf } = require('./runs')

exports.activate = (ctx) => {
  const view = ctx.ui.view('runnables')
  const commands = new Map()
  const launched = new Map()   // run id → item id
  let groups = [], runs = ctx.terminal.runs(), unwatch = null

  const render = () => {
    if (!ctx.workspace.project) return view.set({ kind: 'empty', text: 'Ouvre un projet' })
    if (!groups.length && !runs.length) return view.set({ kind: 'empty', text: 'Rien à lancer ici : pas de package.json, Makefile, Cargo.toml, go.mod ni script.' })
    // closed by default (a monorepo can have dozens of packages); the workbench remembers what the user opens
    const items = withRuns(groups.map((g) => ({ ...g, expanded: groups.length === 1 })), runs, launched)
    view.set({ kind: 'tree', search: true, items, toolbar: [{ id: 'refresh', title: 'Actualiser', icon: 'activity' }] })
  }

  const refresh = () => {
    const root = ctx.workspace.project
    commands.clear()
    groups = root ? detect(ctx.workspace.fs, root) : []
    for (const g of groups) for (const it of g.children) commands.set(it.id, { cwd: it.cwd, command: it.command, label: it.label })
    render()
  }

  const watchRoot = () => {
    if (unwatch) { unwatch(); unwatch = null }
    const root = ctx.workspace.project
    if (root) unwatch = ctx.workspace.fs.watch(root, () => { clearTimeout(watchRoot.t); watchRoot.t = setTimeout(refresh, 400) })
  }

  view.onEvent((e) => {
    if (e.type === 'toolbar' && e.actionId === 'refresh') return refresh()
    if (e.type === 'action' && (e.actionId === 'stop' || e.actionId === 'show')) {
      const id = runOf(e.itemId, runs, launched)
      if (id) e.actionId === 'stop' ? ctx.terminal.stop(id) : ctx.terminal.show(id)
      return
    }
    if (e.type === 'open' && e.itemId.startsWith('run:')) return ctx.terminal.show(e.itemId.slice(4))
    if ((e.type === 'action' && e.actionId === 'run') || e.type === 'open') {
      const c = commands.get(e.itemId)
      if (c) launched.set(ctx.terminal.run({ cwd: c.cwd, command: c.command, label: c.label, tab: 'reuse' }), e.itemId)
    }
  })
  ctx.terminal.onDidChangeRuns((list) => {
    runs = list
    for (const id of [...launched.keys()]) if (!runs.some((r) => r.id === id)) launched.delete(id)
    render()
  })
  ctx.workspace.onDidChangeProject(() => { refresh(); watchRoot() })
  refresh(); watchRoot()
}
