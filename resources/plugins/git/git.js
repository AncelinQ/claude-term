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
      // renamed/copied: "2 XY sub mH mI mW hH hI Xscore path\0origPath"
      const m = line.match(/^2 (.)(.) \S+ \S+ \S+ \S+ \S+ \S+ \S+ (.+)$/)
      const orig = records[++i]
      if (m) out.entries.push({ path: m[3], from: orig, staged: m[1] === '.' ? null : m[1], unstaged: m[2] === '.' ? null : m[2], untracked: false, conflict: false })
    } else if (kind === 'u') {
      const m = line.match(/^u (.)(.) \S+ \S+ \S+ \S+ \S+ \S+ \S+ \S+ (.+)$/)
      if (m) out.entries.push({ path: m[3], staged: null, unstaged: m[1] + m[2], untracked: false, conflict: true })
    } else if (kind === '?') {
      out.entries.push({ path: line.slice(2), staged: null, unstaged: null, untracked: true, conflict: false })
    }
    // '!' ignored entries are not requested
  }
  return out
}

const LOG_FORMAT = '%H%x1f%h%x1f%an%x1f%ar%x1f%s%x1e'
/** `git log --format=<LOG_FORMAT>` */
function parseLog(text) {
  return text.split('\x1e').map((r) => r.replace(/^\n/, '')).filter((r) => r.trim()).map((r) => {
    const [hash, short, author, when, subject] = r.split('\x1f')
    return { hash, short, author, when, subject }
  })
}

/** `git branch --format=%(HEAD)%(refname:short)` ("*" marks the current branch, a space otherwise) */
function parseBranches(text) {
  return text.split('\n').filter((l) => l.trim()).map((l) => ({ name: l.slice(1), current: l[0] === '*' }))
}

const LABELS = { M: 'modifié', A: 'ajouté', D: 'supprimé', R: 'renommé', C: 'copié', T: 'type', U: 'conflit' }

module.exports = { parseStatus, parseLog, parseBranches, LOG_FORMAT, LABELS }
