// Lanceur: lists what the project can run and runs it in a shell tab.
const { detect } = require('./detect')

exports.activate = (ctx) => {
  const view = ctx.ui.view('runnables')
  const commands = new Map()
  let unwatch = null

  const refresh = () => {
    const root = ctx.workspace.project
    commands.clear()
    if (!root) { view.set({ kind: 'empty', text: 'Ouvre un projet' }); return }
    const groups = detect(ctx.workspace.fs, root)
    for (const g of groups) for (const it of g.children) commands.set(it.id, { cwd: it.cwd, command: it.command })
    if (!groups.length) { view.set({ kind: 'empty', text: 'Rien à lancer ici : pas de package.json, Makefile, Cargo.toml, go.mod ni script.' }); return }
    view.set({ kind: 'tree', items: groups, toolbar: [{ id: 'refresh', title: 'Actualiser', icon: 'activity' }] })
  }

  const watchRoot = () => {
    if (unwatch) { unwatch(); unwatch = null }
    const root = ctx.workspace.project
    if (root) unwatch = ctx.workspace.fs.watch(root, () => { clearTimeout(watchRoot.t); watchRoot.t = setTimeout(refresh, 400) })
  }

  view.onEvent((e) => {
    if (e.type === 'toolbar' && e.actionId === 'refresh') return refresh()
    if ((e.type === 'action' && e.actionId === 'run') || e.type === 'open') {
      const c = commands.get(e.itemId)
      if (c) ctx.terminal.run({ cwd: c.cwd, command: c.command, tab: 'reuse' })
    }
  })
  ctx.workspace.onDidChangeProject(() => { refresh(); watchRoot() })
  refresh(); watchRoot()
}
