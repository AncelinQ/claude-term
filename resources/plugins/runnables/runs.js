// Lanceur: what is running (pure, tested). `runs` are the host's (terminal.runs), `launched` maps a run id to the item
// the user ran, so the tree can mark the item and list it in the "En cours" group with stop / show actions.
const STOP = { id: 'stop', title: 'Arrêter (Ctrl+C)', icon: 'stop', primary: true }
const SHOW = { id: 'show', title: 'Afficher le terminal', icon: 'terminal' }

function withRuns(groups, runs, launched) {
  const byItem = new Map()
  for (const r of runs) { const item = launched.get(r.id); if (item) (byItem.get(item) || byItem.set(item, []).get(item)).push(r) }
  const find = (id) => { for (const g of groups) for (const c of g.children) if (c.id === id) return { g, c }; return null }
  const running = runs.map((r) => {
    const f = find(launched.get(r.id))
    return { id: 'run:' + r.id, label: f ? f.c.label : r.label || r.command, detail: f ? f.g.label.split(' ·')[0] : r.command, icon: 'play', color: 'badge.ok',
      badges: r.started ? [] : ['démarrage'], actions: [STOP, SHOW] }
  })
  const tree = groups.map((g) => ({
    ...g,
    children: g.children.map((c) => (byItem.has(c.id) ? { ...c, badges: [...(c.badges || []), 'en cours'], actions: [STOP, SHOW] } : c)),
  }))
  return running.length ? [{ id: 'g:running', label: `En cours · ${running.length}`, icon: 'play', expanded: true, children: running }, ...tree] : tree
}

/** the run a click targets: an item of "En cours" (run:<id>), or the latest run of a script item */
function runOf(itemId, runs, launched) {
  if (itemId.startsWith('run:')) return itemId.slice(4)
  const mine = runs.filter((r) => launched.get(r.id) === itemId)
  return mine.length ? mine[mine.length - 1].id : null
}

module.exports = { withRuns, runOf }
