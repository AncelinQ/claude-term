// Detects what a project can run. Pure: takes an fs-like object { exists, read, list }.
const FAVORITES = ['dev', 'start', 'build', 'test', 'lint', 'preview', 'typecheck', 'check']

function join(a, b) { return a.replace(/[\\/]+$/, '') + '/' + b }

function npm(fs, dir, label) {
  if (!fs.exists(join(dir, 'package.json'))) return null
  let pkg
  try { pkg = JSON.parse(fs.read(join(dir, 'package.json'))) } catch { return null }
  const manager = fs.exists(join(dir, 'pnpm-lock.yaml')) ? 'pnpm' : fs.exists(join(dir, 'yarn.lock')) ? 'yarn' : fs.exists(join(dir, 'bun.lockb')) || fs.exists(join(dir, 'bun.lock')) ? 'bun' : 'npm'
  const scripts = Object.entries(pkg.scripts || {}).sort(([a], [b]) => {
    const ia = FAVORITES.indexOf(a), ib = FAVORITES.indexOf(b)
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b)
  })
  const items = scripts.map(([name, cmd]) => ({ id: 'npm:' + dir + ':' + name, label: name, detail: cmd, icon: 'box', cwd: dir, command: `${manager} run ${name}`, actions: [{ id: 'run', title: 'Lancer', icon: 'play', primary: true }] }))
  const ws = Array.isArray(pkg.workspaces) ? pkg.workspaces : Array.isArray(pkg.workspaces && pkg.workspaces.packages) ? pkg.workspaces.packages : []
  return { id: 'npm:' + dir, label: `${label || pkg.name || 'package.json'} · ${manager}`, icon: 'box', children: items, workspaces: ws }
}

function make(fs, dir) {
  const f = ['Makefile', 'makefile', 'GNUmakefile'].map((n) => join(dir, n)).find((p) => fs.exists(p))
  if (!f) return null
  const targets = []
  for (const line of fs.read(f).split('\n')) {
    const m = line.match(/^([A-Za-z0-9_.-]+)\s*:(?!=)/)
    if (m && !m[1].startsWith('.') && !targets.includes(m[1])) targets.push(m[1])
  }
  if (!targets.length) return null
  return { id: 'make:' + dir, label: 'Makefile', icon: 'box', children: targets.map((t) => ({ id: 'make:' + dir + ':' + t, label: t, icon: 'terminal', cwd: dir, command: `make ${t}`, actions: [{ id: 'run', title: 'Lancer', icon: 'play', primary: true }] })) }
}

function cargo(fs, dir) {
  if (!fs.exists(join(dir, 'Cargo.toml'))) return null
  const cmds = ['cargo run', 'cargo build', 'cargo test', 'cargo check', 'cargo clippy']
  return { id: 'cargo:' + dir, label: 'Cargo', icon: 'box', children: cmds.map((c) => ({ id: 'cargo:' + dir + ':' + c, label: c.slice(6), detail: c, icon: 'terminal', cwd: dir, command: c, actions: [{ id: 'run', title: 'Lancer', icon: 'play', primary: true }] })) }
}

function go(fs, dir) {
  if (!fs.exists(join(dir, 'go.mod'))) return null
  const cmds = ['go run .', 'go build ./...', 'go test ./...', 'go vet ./...']
  return { id: 'go:' + dir, label: 'Go', icon: 'box', children: cmds.map((c) => ({ id: 'go:' + dir + ':' + c, label: c.slice(3), detail: c, icon: 'terminal', cwd: dir, command: c, actions: [{ id: 'run', title: 'Lancer', icon: 'play', primary: true }] })) }
}

function python(fs, dir) {
  const items = []
  if (fs.exists(join(dir, 'pyproject.toml'))) {
    const text = fs.read(join(dir, 'pyproject.toml'))
    const m = text.match(/\[project\.scripts\]([\s\S]*?)(\n\[|$)/)
    if (m) for (const line of m[1].split('\n')) { const s = line.match(/^\s*([A-Za-z0-9_-]+)\s*=/); if (s) items.push({ name: s[1], cmd: s[1] }) }
    if (/\[tool\.pytest/.test(text) || fs.exists(join(dir, 'tests'))) items.push({ name: 'pytest', cmd: 'pytest' })
  }
  if (fs.exists(join(dir, 'manage.py'))) items.push({ name: 'runserver', cmd: 'python manage.py runserver' }, { name: 'migrate', cmd: 'python manage.py migrate' })
  if (fs.exists(join(dir, 'main.py'))) items.push({ name: 'main.py', cmd: 'python main.py' })
  if (fs.exists(join(dir, 'app.py'))) items.push({ name: 'app.py', cmd: 'python app.py' })
  if (!items.length) return null
  return { id: 'py:' + dir, label: 'Python', icon: 'box', children: items.map((i) => ({ id: 'py:' + dir + ':' + i.name, label: i.name, detail: i.cmd, icon: 'terminal', cwd: dir, command: i.cmd, actions: [{ id: 'run', title: 'Lancer', icon: 'play', primary: true }] })) }
}

function shell(fs, dir) {
  const scripts = fs.list(dir).filter((e) => !e.dir && /\.sh$/.test(e.name)).map((e) => e.name).sort()
  if (!scripts.length) return null
  return { id: 'sh:' + dir, label: 'Scripts shell', icon: 'terminal', children: scripts.map((s) => ({ id: 'sh:' + dir + ':' + s, label: s, icon: 'terminal', cwd: dir, command: `./${s}`, actions: [{ id: 'run', title: 'Lancer', icon: 'play', primary: true }] })) }
}

/** Groups of runnable items for a project root (workspaces of the root package included). */
function detect(fs, root) {
  const groups = []
  const rootNpm = npm(fs, root, null)
  if (rootNpm) {
    groups.push(rootNpm)
    for (const ws of rootNpm.workspaces || []) {
      const dirs = ws.endsWith('/*') ? fs.list(join(root, ws.slice(0, -2))).filter((e) => e.dir).map((e) => join(join(root, ws.slice(0, -2)), e.name)) : [join(root, ws)]
      for (const d of dirs) { const g = npm(fs, d, d.split('/').pop()); if (g) groups.push(g) }
    }
  }
  for (const f of [make, cargo, go, python, shell]) { const g = f(fs, root); if (g) groups.push(g) }
  return groups.map(({ workspaces, ...g }) => g)
}

module.exports = { detect, FAVORITES }
