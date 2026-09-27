// Pure model of the git plugin: state + event → new state, effects (git commands, views, prompts).
// No I/O here. main.js executes the effects. Every write is a plain git command; nothing destructive.
const { LABELS } = require('./git')

const RUN = (args) => ({ type: 'run', args })
const initialState = () => ({ root: null, status: null, commits: [], refs: { local: [], remote: [] }, checked: {}, message: '', amend: false, detail: null, collapsed: {}, groupByDir: false })

/** Files grouped by directory, single-child chains compacted ("src/main/services"), like JetBrains. */
function dirTree(entries, checked, group, collapsed) {
  const root = { dirs: {}, files: [] }
  for (const e of entries) {
    const parts = e.path.split('/'); let node = root
    for (const d of parts.slice(0, -1)) node = node.dirs[d] = node.dirs[d] || { dirs: {}, files: [] }
    node.files.push(e)
  }
  const build = (node, prefix) => {
    const items = []
    for (const name of Object.keys(node.dirs).sort()) {
      let label = name, child = node.dirs[name], path = prefix ? `${prefix}/${name}` : name
      while (child.files.length === 0 && Object.keys(child.dirs).length === 1) { const only = Object.keys(child.dirs)[0]; label += '/' + only; path += '/' + only; child = child.dirs[only] }
      const id = `dir:${group}:${path}`
      items.push({ id, label, icon: 'folder', color: 'accent', expanded: !collapsed[id], checked: false, children: build(child, path) })
    }
    for (const e of node.files) items.push({ ...fileItem(e, checked, group), label: e.path.split('/').pop(), detail: '' })
    return items
  }
  return build(root, '')
}

function fileItem(e, checked, group) {
  // no badge for what the group already says (modified in "Modifications", untracked in "Non versionnés")
  const code = e.conflict ? 'U' : e.untracked ? 'M' : (e.unstaged || e.staged)
  return {
    id: `file:${e.path}`, label: e.path.split('/').pop(), detail: e.path.includes('/') ? e.path.slice(0, e.path.lastIndexOf('/')) : '',
    file: e.path, checked: !!checked[e.path], badges: e.conflict ? ['conflit'] : e.from ? ['renommé'] : code !== 'M' && LABELS[code] ? [LABELS[code]] : [],
    contextMenu: [
      { id: 'diff', title: 'Diff côte à côte', icon: 'columns' },
      { id: 'openFile', title: 'Ouvrir le fichier', icon: 'file' },
      'sep',
      ...(group === 'untracked' ? [{ id: 'add', title: 'Suivre (git add)', icon: 'plus' }] : []),
      ...(e.staged && !e.conflict ? [{ id: 'unstage', title: "Retirer de l'index (git restore --staged)", icon: 'minus' }] : []),
    ],
  }
}

/** Changes island: checkbox tree + commit footer. */
function changesView(s) {
  if (!s.root) return { kind: 'empty', text: 'Ouvre un projet' }
  if (!s.status) return { kind: 'empty', text: 'Pas un dépôt git' }
  const entries = s.status.entries
  const conflicts = entries.filter((e) => e.conflict), tracked = entries.filter((e) => !e.conflict && !e.untracked), untracked = entries.filter((e) => e.untracked)
  const items = []
  const kids = (es, group) => (s.groupByDir ? dirTree(es, s.checked, group, s.collapsed) : es.map((e) => fileItem(e, s.checked, group)))
  if (conflicts.length) items.push({ id: 'g:conflicts', label: `Conflits`, detail: `${conflicts.length}`, expanded: !s.collapsed['g:conflicts'], children: kids(conflicts, 'conflicts') })
  items.push({ id: 'g:changes', label: 'Modifications', detail: `${tracked.length} fichier${tracked.length > 1 ? 's' : ''}`, expanded: !s.collapsed['g:changes'], children: kids(tracked, 'changes') })
  if (untracked.length) items.push({ id: 'g:untracked', label: 'Non versionnés', detail: `${untracked.length} fichier${untracked.length > 1 ? 's' : ''}`, expanded: !s.collapsed['g:untracked'], children: kids(untracked, 'untracked') })
  const head = s.status.detached ? 'HEAD détachée' : (s.status.branch || '?')
  const ab = (s.status.ahead ? ` ↑${s.status.ahead}` : '') + (s.status.behind ? ` ↓${s.status.behind}` : '')
  const nChecked = Object.keys(s.checked).filter((p) => s.checked[p]).length
  return {
    kind: 'tree', items,
    toolbar: [
      { id: 'branch', title: `Branche : ${head}${ab}`, icon: 'git' },
      { id: 'refresh', title: 'Actualiser', icon: 'activity' },
      { id: 'groupDirs', title: s.groupByDir ? 'Liste à plat' : 'Grouper par dossier', icon: s.groupByDir ? 'list' : 'folder' },
      { id: 'toggleAll', title: 'Tout replier / déplier', icon: 'chevronDown' },
    ],
    footer: {
      fields: [{ id: 'message', placeholder: 'Message du commit', value: s.message, multiline: true }],
      checks: [{ id: 'amend', label: 'Amend', checked: s.amend }],
      buttons: [
        { id: 'commit', title: nChecked ? `Commit (${nChecked})` : 'Commit', icon: 'check', primary: true, disabled: !nChecked || !s.message.trim() },
        { id: 'commitPush', title: 'Commit + push', disabled: !nChecked || !s.message.trim() },
      ],
    },
  }
}

const branchMenu = (b) => [
  { id: 'switch', title: `Basculer sur ${b.name} (git switch)`, icon: 'git', disabled: b.current },
  { id: 'newFrom', title: `Nouvelle branche depuis ${b.name}…`, icon: 'plus' },
  { id: 'diffWorkTree', title: "Diff avec l'arbre de travail", icon: 'columns' },
  'sep',
  { id: 'update', title: 'Mettre à jour (git pull)', icon: 'arrowUp', disabled: !b.current },
  { id: 'push', title: 'Push (git push)', icon: 'arrowUp', disabled: !b.current },
  'sep',
  { id: 'rename', title: 'Renommer…', icon: 'list' },
  { id: 'delete', title: 'Supprimer (git branch -d, refusé si non fusionnée)', icon: 'x', disabled: b.current },
]

/** Branches island: HEAD, local, remote by remote. */
function branchesView(s) {
  if (!s.root || !s.status) return { kind: 'empty', text: '' }
  const cur = s.status.detached ? 'HEAD détachée' : (s.status.branch || '?')
  const local = s.refs.local.map((b) => ({
    id: `local:${b.name}`, label: b.name, icon: 'git', color: b.current ? 'accent' : undefined,
    extra: (b.ahead ? `↑${b.ahead} ` : '') + (b.behind ? `↓${b.behind}` : ''), detail: b.upstream ? (b.gone ? `${b.upstream} (disparue)` : b.upstream) : '',
    badges: b.current ? ['HEAD'] : [], contextMenu: branchMenu(b),
  }))
  const byRemote = {}
  for (const r of s.refs.remote) (byRemote[r.remote] = byRemote[r.remote] || []).push({ id: `remote:${r.full}`, label: r.name, icon: 'git', muted: true, contextMenu: [
    { id: 'switchRemote', title: `Basculer sur ${r.name} (git switch, suit ${r.full})`, icon: 'git' },
    { id: 'newFrom', title: `Nouvelle branche depuis ${r.full}…`, icon: 'plus' },
    { id: 'diffWorkTree', title: "Diff avec l'arbre de travail", icon: 'columns' },
  ] })
  const items = [
    { id: 'head', label: `HEAD (${cur})`, icon: 'git', color: 'accent' },
    { id: 'g:local', label: 'Local', detail: `${local.length}`, expanded: !s.collapsed['g:local'], children: local },
    ...Object.keys(byRemote).sort().map((r) => ({ id: `g:remote:${r}`, label: r, detail: `${byRemote[r].length}`, expanded: !s.collapsed[`g:remote:${r}`], children: byRemote[r] })),
  ]
  return { kind: 'tree', items, toolbar: [{ id: 'fetch', title: 'Récupérer (git fetch --all --prune)', icon: 'activity' }, { id: 'newBranch', title: 'Nouvelle branche…', icon: 'plus' }] }
}

/** Commits (bottom block): list + detail. */
function commitsView(s) {
  if (!s.root || !s.status) return { kind: 'empty', text: 'Pas un dépôt git' }
  if (!s.commits.length) return { kind: 'empty', text: 'Aucun commit' }
  return {
    kind: 'list', search: true,
    items: s.commits.map((c) => ({ id: `commit:${c.hash}`, label: c.subject, detail: `${c.short} · ${c.author} · ${c.when}`, icon: 'clock', contextMenu: [
      { id: 'diffCommit', title: 'Diff du commit (onglet)', icon: 'columns' },
      { id: 'copyHash', title: 'Copier le hash', icon: 'list' },
    ] })),
    detail: s.detail ? { kind: 'diff', text: s.detail } : { kind: 'empty', text: 'Sélectionne un commit' },
  }
}

/** Branch popover: actions then recent / local / remote branches. */
function branchPopover(s) {
  const local = [...s.refs.local].sort((a, b) => b.date - a.date)
  const recent = local.slice(0, 5)
  const b = (x, id) => ({ id, label: x.name, icon: 'git', color: x.current ? 'accent' : undefined, extra: (x.ahead ? `↑${x.ahead} ` : '') + (x.behind ? `↓${x.behind}` : ''), detail: x.upstream || '' })
  return {
    kind: 'tree', search: true,
    items: [
      { id: 'g:actions', label: 'Actions', expanded: true, children: [
        { id: 'update', label: 'Mettre à jour le projet (git pull)', icon: 'arrowUp' },
        { id: 'push', label: 'Push (git push)', icon: 'arrowUp' },
        { id: 'fetch', label: 'Récupérer (git fetch --all --prune)', icon: 'activity' },
        { id: 'newBranch', label: 'Nouvelle branche…', icon: 'plus' },
        { id: 'checkoutRev', label: 'Checkout tag ou révision…', icon: 'clock' },
      ] },
      { id: 'g:recent', label: 'Récentes', expanded: true, children: recent.map((x) => b(x, `local:${x.name}`)) },
      { id: 'g:local', label: 'Locales', expanded: false, children: local.map((x) => b(x, `local:${x.name}`)) },
      { id: 'g:remote', label: 'Distantes', expanded: false, children: s.refs.remote.map((r) => ({ id: `remote:${r.full}`, label: r.full, icon: 'git', muted: true })) },
    ].filter((g) => g.children.length),
  }
}

const checkedPaths = (s) => Object.keys(s.checked).filter((p) => s.checked[p])
const setChecked = (s, paths, on) => { const checked = { ...s.checked }; for (const p of paths) checked[p] = on; return { ...s, checked } }
const groupPaths = (s, gid) => {
  const es = s.status ? s.status.entries : []
  if (gid.startsWith('dir:')) { const [, group, dir] = gid.split(/:(.*?):(.*)$/s); return groupPaths(s, 'g:' + group).filter((p) => p.startsWith(dir + '/')) }
  if (gid === 'g:conflicts') return es.filter((e) => e.conflict).map((e) => e.path)
  if (gid === 'g:untracked') return es.filter((e) => e.untracked).map((e) => e.path)
  return es.filter((e) => !e.conflict && !e.untracked).map((e) => e.path)
}
const localName = (fullRemote) => fullRemote.slice(fullRemote.indexOf('/') + 1)

/** Commit command sequence for the checked files. */
function commitCommands(s, push) {
  const files = checkedPaths(s)
  const untracked = files.filter((p) => s.status.entries.some((e) => e.path === p && e.untracked))
  const cmds = []
  if (untracked.length) cmds.push(RUN(['add', '--', ...untracked]))
  cmds.push(RUN(['commit', ...(s.amend ? ['--amend'] : []), '-m', s.message.trim(), '--', ...files]))
  if (push) cmds.push(RUN(['push']))
  return cmds
}

/**
 * Reduces an event. Returns { state, effects }. Effects:
 *  run {args} · refresh · detailFile {path} · detailCommit {hash} · diffFile {path} · diffRef {ref} · diffCommit {hash}
 *  openFile {path} · prompt {req, then} (then: event to dispatch with value) · popover {model} · closePopover · notify {title, body} · copy {text}
 */
function reduce(s, e) {
  const ef = []
  const view = e.viewId ? e.viewId.split(':').pop() : ''
  const pop = e.viewId && e.viewId.startsWith('popover:')
  // footer / checks
  if (e.type === 'input' && e.fieldId === 'message') return { state: { ...s, message: String(e.value) }, effects: ef }
  if (e.type === 'check' && e.itemId === 'amend') return { state: { ...s, amend: !!e.value }, effects: ef }
  if (e.type === 'check' && e.itemId) {
    const paths = e.itemId.startsWith('g:') || e.itemId.startsWith('dir:') ? groupPaths(s, e.itemId) : [e.itemId.slice(5)]
    return { state: setChecked(s, paths, !!e.value), effects: ef }
  }
  if (e.type === 'button') {
    if (!s.status) return { state: s, effects: ef }
    if (!checkedPaths(s).length) return { state: s, effects: [{ type: 'notify', title: 'Git', body: 'Coche les fichiers à committer.' }] }
    if (!s.message.trim()) return { state: s, effects: [{ type: 'notify', title: 'Git', body: 'Écris un message de commit.' }] }
    if (e.actionId === 'commit' || e.actionId === 'commitPush') return { state: { ...s, message: '', amend: false, checked: {} }, effects: commitCommands(s, e.actionId === 'commitPush') }
    return { state: s, effects: ef }
  }
  if (e.type === 'toolbar') {
    if (e.actionId === 'refresh') return { state: s, effects: [{ type: 'refresh' }] }
    if (e.actionId === 'fetch') return { state: s, effects: [RUN(['fetch', '--all', '--prune'])] }
    if (e.actionId === 'newBranch') return { state: s, effects: [{ type: 'prompt', req: { title: 'Nouvelle branche (git switch -c)', placeholder: 'nom' }, then: { type: 'promptResult', action: 'newBranch' } }] }
    if (e.actionId === 'branch') return { state: s, effects: [{ type: 'popover', view: 'changes', model: branchPopover(s) }] }
    if (e.actionId === 'groupDirs') return { state: { ...s, groupByDir: !s.groupByDir }, effects: [{ type: 'persist', key: 'groupByDir', value: !s.groupByDir }] }
    if (e.actionId === 'toggleAll') {
      const keys = ['g:conflicts', 'g:changes', 'g:untracked']
      const allCollapsed = keys.every((k) => s.collapsed[k])
      const collapsed = { ...s.collapsed }; for (const k of keys) collapsed[k] = !allCollapsed
      return { state: { ...s, collapsed }, effects: ef }
    }
    return { state: s, effects: ef }
  }
  if (e.type === 'promptResult') {
    const v = e.value == null ? '' : String(e.value).trim()
    if (!v) return { state: s, effects: ef }
    if (e.action === 'newBranch') return { state: s, effects: [RUN(['switch', '-c', v, ...(e.from ? [e.from] : [])])] }
    if (e.action === 'rename') return { state: s, effects: [RUN(['branch', '-m', e.from, v])] }
    if (e.action === 'checkoutRev') return { state: s, effects: [RUN(['switch', '--detach', v])] }
    return { state: s, effects: ef }
  }
  const id = e.itemId || ''
  if (e.type === 'select' || e.type === 'open') {
    if (pop) {
      const effects = [{ type: 'closePopover' }]
      if (id === 'update') effects.push(RUN(['pull']))
      else if (id === 'push') effects.push(RUN(['push']))
      else if (id === 'fetch') effects.push(RUN(['fetch', '--all', '--prune']))
      else if (id === 'newBranch') effects.push({ type: 'prompt', req: { title: 'Nouvelle branche (git switch -c)', placeholder: 'nom' }, then: { type: 'promptResult', action: 'newBranch' } })
      else if (id === 'checkoutRev') effects.push({ type: 'prompt', req: { title: 'Checkout tag ou révision (git switch --detach)', placeholder: 'v1.2.0, abc123…' }, then: { type: 'promptResult', action: 'checkoutRev' } })
      else if (id.startsWith('local:')) { const b = s.refs.local.find((x) => x.name === id.slice(6)); if (b && !b.current) effects.push(RUN(['switch', b.name])) }
      else if (id.startsWith('remote:')) effects.push(RUN(['switch', localName(id.slice(7))]))
      return { state: s, effects }
    }
    if (id.startsWith('file:')) return { state: s, effects: [e.type === 'open' ? { type: 'diffFile', path: id.slice(5) } : { type: 'detailFile', path: id.slice(5) }] }
    if (id.startsWith('commit:')) return { state: s, effects: [e.type === 'open' ? { type: 'diffCommit', hash: id.slice(7) } : { type: 'detailCommit', hash: id.slice(7) }] }
    if (id.startsWith('local:') && e.type === 'open') { const b = s.refs.local.find((x) => x.name === id.slice(6)); return { state: s, effects: b && !b.current ? [RUN(['switch', b.name])] : ef } }
    return { state: s, effects: ef }
  }
  if (e.type === 'menu') {
    const a = e.actionId
    if (id.startsWith('file:')) {
      const p = id.slice(5)
      if (a === 'diff') return { state: s, effects: [{ type: 'diffFile', path: p }] }
      if (a === 'openFile') return { state: s, effects: [{ type: 'openFile', path: p }] }
      if (a === 'add') return { state: s, effects: [RUN(['add', '--', p])] }
      if (a === 'unstage') return { state: s, effects: [RUN(['restore', '--staged', '--', p])] }
      return { state: s, effects: ef }
    }
    if (id.startsWith('commit:')) {
      const h = id.slice(7)
      if (a === 'diffCommit') return { state: s, effects: [{ type: 'diffCommit', hash: h }] }
      if (a === 'copyHash') return { state: s, effects: [{ type: 'copy', text: h }] }
      return { state: s, effects: ef }
    }
    const isRemote = id.startsWith('remote:')
    const name = isRemote ? id.slice(7) : id.slice(6)
    if (a === 'switch') return { state: s, effects: [RUN(['switch', name])] }
    if (a === 'switchRemote') return { state: s, effects: [RUN(['switch', localName(name)])] }
    if (a === 'newFrom') return { state: s, effects: [{ type: 'prompt', req: { title: `Nouvelle branche depuis ${name}`, placeholder: 'nom' }, then: { type: 'promptResult', action: 'newBranch', from: name } }] }
    if (a === 'diffWorkTree') return { state: s, effects: [{ type: 'diffRef', ref: name }] }
    if (a === 'update') return { state: s, effects: [RUN(['pull'])] }
    if (a === 'push') return { state: s, effects: [RUN(['push'])] }
    if (a === 'rename') return { state: s, effects: [{ type: 'prompt', req: { title: `Renommer ${name}`, placeholder: 'nouveau nom' }, then: { type: 'promptResult', action: 'rename', from: name } }] }
    if (a === 'delete') return { state: s, effects: [RUN(['branch', '-d', name])] }
    return { state: s, effects: ef }
  }
  return { state: s, effects: ef }
}

/** After a refresh: keeps checked paths that still exist. */
function withData(s, root, status, commits, refs) {
  const checked = {}
  if (status) for (const e of status.entries) if (s.checked[e.path]) checked[e.path] = true
  return { ...s, root, status, commits, refs, checked }
}

module.exports = { initialState, changesView, branchesView, commitsView, branchPopover, reduce, withData, commitCommands, checkedPaths, dirTree }
