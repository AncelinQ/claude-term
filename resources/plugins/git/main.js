// Git plugin. Reads through git's porcelain outputs; writes are plain git commands run in a visible shell tab.
const { parseStatus, parseLog, parseBranches, LOG_FORMAT, LABELS } = require('./git')

exports.activate = (ctx) => {
  const changes = ctx.ui.view('changes'), detail = ctx.ui.view('detail'), log = ctx.ui.view('log')
  let root = null, status = null, selected = null, unwatch = [], timer = null
  const git = (args) => ctx.process.exec('git', args, { cwd: root })
  const q = (s) => "'" + String(s).replace(/'/g, "'\\''") + "'"
  const run = (args) => ctx.terminal.run({ cwd: root, command: 'git ' + args.map(q).join(' '), tab: 'reuse' })

  async function refresh() {
    root = ctx.workspace.project
    if (!root) { status = null; changes.set({ kind: 'empty', text: 'Ouvre un projet' }); detail.set({ kind: 'empty', text: '' }); log.set({ kind: 'empty', text: '' }); return }
    const top = await git(['rev-parse', '--show-toplevel'])
    if (top.code !== 0) { status = null; changes.set({ kind: 'empty', text: 'Pas un dépôt git' }); detail.set({ kind: 'empty', text: '' }); log.set({ kind: 'empty', text: '' }); return }
    const st = await git(['status', '--porcelain=v2', '--branch', '-z'])
    if (st.code !== 0) { changes.set({ kind: 'empty', text: 'git status a échoué : ' + st.stderr.trim() }); return }
    status = parseStatus(st.stdout)
    const staged = status.entries.filter((e) => e.staged && !e.conflict)
    const unstaged = status.entries.filter((e) => e.unstaged && !e.untracked && !e.conflict)
    const untracked = status.entries.filter((e) => e.untracked)
    const conflicts = status.entries.filter((e) => e.conflict)
    const item = (e, kind) => ({
      id: kind + ':' + e.path, label: e.path.split('/').pop(), detail: e.path, icon: 'file',
      badges: [LABELS[(kind === 'staged' ? e.staged : e.unstaged) || (e.untracked ? 'A' : 'M')] || ''].filter(Boolean),
      actions: kind === 'staged' ? [{ id: 'unstage', title: 'Retirer de l’index (git restore --staged)', icon: 'minus' }]
        : [{ id: 'stage', title: 'Ajouter à l’index (git add)', icon: 'plus' }],
    })
    const groups = []
    if (conflicts.length) groups.push({ id: 'g:conflicts', label: `Conflits (${conflicts.length})`, children: conflicts.map((e) => ({ id: 'conflict:' + e.path, label: e.path.split('/').pop(), detail: e.path, icon: 'file', badges: ['conflit'] })) })
    groups.push({ id: 'g:staged', label: `Indexés (${staged.length})`, children: staged.map((e) => item(e, 'staged')) })
    groups.push({ id: 'g:unstaged', label: `Modifiés (${unstaged.length})`, children: unstaged.map((e) => item(e, 'unstaged')) })
    if (untracked.length) groups.push({ id: 'g:untracked', label: `Non suivis (${untracked.length})`, children: untracked.map((e) => item(e, 'untracked')) })
    const head = status.detached ? 'HEAD détachée' : (status.branch || '?')
    const ab = (status.ahead ? ` ↑${status.ahead}` : '') + (status.behind ? ` ↓${status.behind}` : '')
    changes.set({ kind: 'tree', items: groups, toolbar: [
      { id: 'branch', title: `Branche : ${head}${ab} — changer`, icon: 'git' },
      { id: 'stageAll', title: 'Tout indexer (git add -A)', icon: 'plus' },
      { id: 'commit', title: 'Commit (git commit -m …)', icon: 'check' },
      { id: 'refresh', title: 'Actualiser', icon: 'activity' },
    ] })
    const lg = await git(['log', '-n', '60', '--format=' + LOG_FORMAT])
    const commits = lg.code === 0 ? parseLog(lg.stdout) : []
    log.set({ kind: 'list', items: commits.map((c) => ({ id: 'commit:' + c.hash, label: c.subject, detail: `${c.short} · ${c.author} · ${c.when}`, icon: 'clock' })) })
    if (!commits.length) log.set({ kind: 'empty', text: 'Aucun commit' })
    if (selected) showDetail(selected)
    else detail.set({ kind: 'empty', text: 'Sélectionne un fichier ou un commit' })
  }

  async function showDetail(id) {
    selected = id
    const [kind, ...rest] = id.split(':'); const target = rest.join(':')
    let r
    if (kind === 'staged') r = await git(['diff', '--cached', '--', target])
    else if (kind === 'unstaged' || kind === 'conflict') r = await git(['diff', '--', target])
    else if (kind === 'untracked') r = await git(['diff', '--no-index', '--', '/dev/null', target])
    else if (kind === 'commit') r = await git(['show', '--stat', '--format=%H%n%an <%ae>%n%ad%n%n%s%n%n%b', target])
    else return
    const text = (r.stdout || '').trim()
    detail.set(text ? { kind: 'diff', text } : { kind: 'empty', text: 'Aucune différence' })
  }

  changes.onEvent(async (e) => {
    if (!root) return
    if (e.type === 'toolbar') {
      if (e.actionId === 'refresh') return refresh()
      if (e.actionId === 'stageAll') return run(['add', '-A'])
      if (e.actionId === 'commit') {
        if (!status || !status.entries.some((x) => x.staged)) return ctx.ui.notify('Git', 'Rien dans l’index : ajoute des fichiers avant de committer.')
        const msg = await ctx.ui.prompt({ title: 'Message du commit', placeholder: 'Résumé en une ligne' })
        if (msg && msg.trim()) run(['commit', '-m', msg.trim()])
        return
      }
      if (e.actionId === 'branch') {
        const br = await git(['branch', '--format=%(HEAD)%(refname:short)'])
        const branches = br.code === 0 ? parseBranches(br.stdout) : []
        const name = await ctx.ui.prompt({ title: 'Changer de branche (git checkout)', placeholder: 'nom de branche', options: branches.filter((b) => !b.current).map((b) => b.name) })
        if (name && branches.some((b) => b.name === name)) run(['checkout', name])
        return
      }
    }
    if (e.type === 'select' && e.itemId) return showDetail(e.itemId)
    if (e.type === 'open' && e.itemId) { const p = e.itemId.split(':').slice(1).join(':'); if (p) ctx.workspace.openFile(root + '/' + p); return }
    if (e.type === 'action' && e.itemId) {
      const p = e.itemId.split(':').slice(1).join(':')
      if (e.actionId === 'stage') return run(['add', '--', p])
      if (e.actionId === 'unstage') return run(['restore', '--staged', '--', p])
    }
  })
  log.onEvent((e) => { if ((e.type === 'select' || e.type === 'open') && e.itemId) showDetail(e.itemId) })

  function watchRepo() {
    unwatch.forEach((u) => u()); unwatch = []
    if (!root) return
    const bump = () => { clearTimeout(timer); timer = setTimeout(refresh, 500) }
    for (const p of [root, root + '/.git', root + '/.git/refs/heads']) if (ctx.workspace.fs.exists(p)) unwatch.push(ctx.workspace.fs.watch(p, bump))
  }
  ctx.workspace.onDidChangeProject(async () => { selected = null; await refresh(); watchRepo() })
  ctx.terminal.onCommandEnd(() => { if (root) { clearTimeout(timer); timer = setTimeout(refresh, 300) } })
  refresh().then(watchRepo)
}
