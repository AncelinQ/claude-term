// Pure parsers over git's tool-oriented outputs. No git logic of our own: the binary is the truth.

/** `git status --porcelain=v2 --branch -z` */
function parseStatus(text) {
  const out = { branch: null, upstream: null, ahead: 0, behind: 0, detached: false, entries: [] }
  const records = text.split('\0')
  for (let i = 0; i < records.length; i++) {
    const line = records[i]
    if (!line) continue
    if (line.startsWith('# branch.head ')) { const b = line.slice(14); out.branch = b === '(detached)' ? null : b; out.detached = b === '(detached)'; continue }
    if (line.startsWith('# branch.upstream ')) { out.upstream = line.slice(18); continue }
    if (line.startsWith('# branch.ab ')) { const m = line.match(/\+(\d+) -(\d+)/); if (m) { out.ahead = +m[1]; out.behind = +m[2] } continue }
    if (line.startsWith('# ')) continue
    const kind = line[0]
    if (kind === '1') {
      // "1 XY sub mH mI mW hH hI path"
      const m = line.match(/^1 (.)(.) \S+ \S+ \S+ \S+ \S+ \S+ (.+)$/)
      if (m) out.entries.push({ path: m[3], staged: m[1] === '.' ? null : m[1], unstaged: m[2] === '.' ? null : m[2], untracked: false, conflict: false })
    } else if (kind === '2') {
      // "2 XY sub mH mI mW hH hI Xscore path\0origPath"
      const m = line.match(/^2 (.)(.) \S+ \S+ \S+ \S+ \S+ \S+ \S+ (.+)$/)
      const orig = records[++i]
      // renames are index-only in porcelain v2, so X is never "."
      if (m) out.entries.push({ path: m[3], from: orig, staged: m[1], unstaged: m[2] === '.' ? null : m[2], untracked: false, conflict: false })
    } else if (kind === 'u') {
      // "u XY sub m1 m2 m3 mW h1 h2 h3 path"
      const m = line.match(/^u (.)(.) \S+ \S+ \S+ \S+ \S+ \S+ \S+ \S+ (.+)$/)
      if (m) out.entries.push({ path: m[3], staged: null, unstaged: m[1] + m[2], untracked: false, conflict: true })
    } else if (kind === '?') {
      out.entries.push({ path: line.slice(2), staged: null, unstaged: null, untracked: true, conflict: false })
    }
  }
  return out
}

const LOG_FORMAT = '%H%x1f%h%x1f%an%x1f%ar%x1f%s%x1f%P%x1f%D%x1e'
/** `git log --format=<LOG_FORMAT>` */
function parseLog(text) {
  return text.split('\x1e').map((r) => r.replace(/^\n/, '')).filter((r) => r.trim()).map((r) => {
    const [hash, short, author, when, subject, parents = '', refs = ''] = r.split('\x1f')
    return { hash, short, author, when, subject, parents: parents.split(' ').filter(Boolean), refs: parseDecorations(refs) }
  })
}

/** "%D" decorations: "HEAD -> main, origin/main, tag: v1" → [{ name, kind }] */
function parseDecorations(text) {
  return text.split(', ').map((d) => d.trim()).filter(Boolean).map((d) => {
    if (d.startsWith('HEAD -> ')) return { name: d.slice(8), kind: 'head' }
    if (d === 'HEAD') return { name: 'HEAD', kind: 'head' }
    if (d.startsWith('tag: ')) return { name: d.slice(5), kind: 'tag' }
    return { name: d, kind: d.includes('/') ? 'remote' : 'local' }
  })
}

/** `git diff-tree -r -z --name-status -M …` → [{ status, path, from? }] */
function parseNameStatus(text) {
  const out = [], f = text.split('\0')
  for (let i = 0; i < f.length; i++) {
    const st = f[i]
    if (!st) continue
    const code = st[0]
    if (code === 'R' || code === 'C') { out.push({ status: code, from: f[i + 1], path: f[i + 2] }); i += 2 }
    else { out.push({ status: code, path: f[i + 1] }); i += 1 }
  }
  return out
}

const INFO_FORMAT = '%H%x1f%an%x1f%ae%x1f%ad%x1f%cn%x1f%cd%x1f%P%x1f%D%x1f%B'
/** `git show -s --date=format:%d/%m/%Y %H:%M --format=<INFO_FORMAT>` */
function parseCommitInfo(text) {
  const [hash, author, email, authorDate, committer, commitDate, parents = '', refs = '', ...body] = text.split('\x1f')
  const message = body.join('\x1f').replace(/\s+$/, '')
  return { hash, author, email, authorDate, committer, commitDate, parents: parents.split(' ').filter(Boolean), refs: parseDecorations(refs), message }
}

const REF_FORMAT = '%(refname)%09%(objectname:short)%09%(upstream:short)%09%(upstream:track)%09%(HEAD)%09%(committerdate:unix)'
/** `git for-each-ref --format=<REF_FORMAT> refs/heads refs/remotes` → { local: [...], remote: [...] } */
function parseRefs(text) {
  const local = [], remote = []
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    const [refname, short, upstream, track, head, date] = line.split('\t')
    const ahead = +(track.match(/ahead (\d+)/) || [0, 0])[1], behind = +(track.match(/behind (\d+)/) || [0, 0])[1]
    if (refname.startsWith('refs/heads/')) local.push({ name: refname.slice(11), hash: short, upstream: upstream || null, ahead, behind, gone: /gone/.test(track), current: head === '*', date: +date || 0 })
    else if (refname.startsWith('refs/remotes/')) {
      const full = refname.slice(13)
      if (full.endsWith('/HEAD')) continue
      const slash = full.indexOf('/')
      remote.push({ remote: full.slice(0, slash), name: full.slice(slash + 1), full, hash: short, date: +date || 0 })
    }
  }
  return { local, remote }
}

const LABELS = { M: 'modifié', A: 'ajouté', D: 'supprimé', R: 'renommé', C: 'copié', T: 'type', U: 'conflit' }

module.exports = { parseStatus, parseLog, parseRefs, parseDecorations, parseNameStatus, parseCommitInfo, LOG_FORMAT, REF_FORMAT, INFO_FORMAT, LABELS }
