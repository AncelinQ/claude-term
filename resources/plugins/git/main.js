// Git plugin glue: runs git (read), executes the model's effects (writes go through a visible shell tab).
const { parseStatus, parseLog, parseRefs, parseNameStatus, parseCommitInfo, LOG_FORMAT, REF_FORMAT, INFO_FORMAT } = require('./git')
const M = require('./model')

exports.activate = (ctx) => {
  const changes = ctx.ui.view('changes'), branches = ctx.ui.view('branches'), commits = ctx.ui.view('commits')
  let s = { ...M.initialState(), groupByDir: !!ctx.storage.get('groupByDir') }, popover = null, unwatch = [], timer = null
  // reads never take .git/index.lock: a status refresh would otherwise fire the .git watcher, which refreshes again
  const git = (args) => ctx.process.exec('git', ['--no-optional-locks', ...args], { cwd: s.root || ctx.workspace.project || undefined })
  const render = () => { changes.set(M.changesView(s)); branches.set(M.branchesView(s)); commits.set(M.commitsView(s)) }

  async function refresh() {
    const root = ctx.workspace.project
    if (!root) { s = M.withData(s, null, null, [], { local: [], remote: [] }); return render() }
    const top = await ctx.process.exec('git', ['rev-parse', '--show-toplevel'], { cwd: root })
    if (top.code !== 0) { s = M.withData(s, root, null, [], { local: [], remote: [] }); return render() }
    // porcelain paths are relative to the repository, which may be above the project folder (monorepo package)
    const repo = top.stdout.trim()
    if (repo !== s.root) { s = { ...s, root: repo }; watchRepo() }
    const [st, lg, rf] = await Promise.all([git(['status', '--porcelain=v2', '--branch', '-z', '--untracked-files=all']), git(['log', '--all', '--topo-order', '-n', '400', '--format=' + LOG_FORMAT]), git(['for-each-ref', '--format=' + REF_FORMAT, 'refs/heads', 'refs/remotes'])])
    if (st.code !== 0) { changes.set({ kind: 'empty', text: 'git status a échoué : ' + st.stderr.trim() }); return }
    s = M.withData(s, repo, parseStatus(st.stdout), lg.code === 0 ? parseLog(lg.stdout) : [], rf.code === 0 ? parseRefs(rf.stdout) : { local: [], remote: [] })
    render()
  }

  async function effect(f) {
    if (f.type === 'run') return ctx.terminal.run({ cwd: s.root, argv: (f.seq || [f.args]).map((a) => ['git', ...a]), tab: 'reuse' })
    if (f.type === 'refresh') return refresh()
    if (f.type === 'persist') return ctx.storage.set(f.key, f.value)
    if (f.type === 'notify') return ctx.ui.notify(f.title, f.body)
    if (f.type === 'copy') return ctx.ui.notify('Git', f.text)
    if (f.type === 'openFile') return ctx.workspace.openFile(s.root + '/' + f.path)
    if (f.type === 'closePopover') { if (popover) { popover.close(); popover = null } return }
    if (f.type === 'popover') { popover = ctx.ui.popover(f.view, f.model); popover.onEvent(dispatch); return }
    if (f.type === 'prompt') { const v = await ctx.ui.prompt(f.req); return dispatch({ ...f.then, value: v }) }
    if (f.type === 'detailFile') { const r = await git(['diff', 'HEAD', '--', f.path]); const alt = r.stdout.trim() ? r.stdout : (await git(['diff', '--no-index', '--', '/dev/null', f.path])).stdout; s = { ...s, detail: alt.trim() }; return commits.set(M.commitsView(s)) }
    if (f.type === 'loadCommit') {
      commits.set(M.commitsView(s))
      const info = parseCommitInfo((await git(['show', '-s', '--date=format:%d/%m/%Y %H:%M', '--format=' + INFO_FORMAT, f.hash])).stdout)
      const base = info.parents[0]
      const ns = await git(base ? ['diff-tree', '--no-commit-id', '-r', '-z', '--name-status', '-M', base, f.hash] : ['diff-tree', '--no-commit-id', '-r', '-z', '--name-status', '-M', '--root', f.hash])
      s = M.withCommit(s, f.hash, parseNameStatus(ns.stdout), info)
      return commits.set(M.commitsView(s))
    }
    if (f.type === 'diffCommitFile') {
      const orig = f.parent && f.file.status !== 'A' ? await git(['show', `${f.parent}:${f.file.from || f.file.path}`]) : { code: 0, stdout: '' }
      const mod = f.file.status !== 'D' ? await git(['show', `${f.hash}:${f.file.path}`]) : { code: 0, stdout: '' }
      return ctx.workspace.openDiff({ title: `${f.file.path.split('/').pop()} @ ${f.hash.slice(0, 7)}`, path: s.root + '/' + f.file.path, original: orig.stdout, modified: mod.stdout })
    }
    if (f.type === 'diffFile') {
      const head = await git(['show', 'HEAD:' + f.path])
      let modified = ''
      try { modified = ctx.workspace.fs.read(s.root + '/' + f.path) } catch { modified = '' }
      return ctx.workspace.openDiff({ title: f.path.split('/').pop() + ' (diff)', path: s.root + '/' + f.path, original: head.code === 0 ? head.stdout : '', modified })
    }
    if (f.type === 'diffRef') { const r = await git(['diff', f.ref]); return ctx.workspace.openDiff({ title: `diff ${f.ref}`, unified: r.stdout || '(aucune différence)' }) }
    if (f.type === 'diffCommit') { const r = await git(['show', f.hash]); return ctx.workspace.openDiff({ title: `commit ${f.hash.slice(0, 7)}`, unified: r.stdout }) }
  }

  async function dispatch(e) {
    const { state, effects } = M.reduce(s, e)
    s = state
    if (e.type === 'check' || e.type === 'input' || (e.type === 'toolbar' && (e.actionId === 'toggleAll' || e.actionId === 'groupDirs'))) changes.set(M.changesView(s))
    if (e.type === 'button') render()
    for (const f of effects) await effect(f)
  }

  changes.onEvent(dispatch); branches.onEvent(dispatch); commits.onEvent(dispatch)
  function watchRepo() {
    unwatch.forEach((u) => u()); unwatch = []
    if (!s.root) return
    // lock files come and go with every git command (ours included): they are not changes
    const bump = (name) => { if (name && /\.lock$/.test(name)) return; clearTimeout(timer); timer = setTimeout(refresh, 500) }
    for (const p of [s.root, s.root + '/.git', s.root + '/.git/refs/heads']) if (ctx.workspace.fs.exists(p)) unwatch.push(ctx.workspace.fs.watch(p, bump))
  }
  ctx.workspace.onDidChangeProject(async () => { unwatch.forEach((u) => u()); unwatch = []; s = { ...M.initialState(), groupByDir: s.groupByDir }; await refresh(); watchRepo() })
  ctx.terminal.onCommandEnd(() => { if (s.root) { clearTimeout(timer); timer = setTimeout(refresh, 300) } })
  refresh().then(watchRepo)
}
