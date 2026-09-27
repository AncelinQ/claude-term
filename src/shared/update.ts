/** Update feed (electron-builder's latest-*.yml) and states shown by the UI (pure, tested). */

export type UpdateStatus = 'idle' | 'checking' | 'none' | 'downloading' | 'ready' | 'error' | 'unsupported'
export interface UpdateState {
  status: UpdateStatus
  /** available / downloaded version */
  version?: string
  /** 0–100 while downloading */
  progress?: number
  error?: string
  /** why updates are off (dev build, read-only location…) */
  reason?: string
  checkedAt?: number
  /** running app version */
  current?: string
}

export interface FeedFile { url: string; sha512: string; size?: number }
export interface Feed { version: string; files: FeedFile[] }

/** Parses the subset of latest-mac.yml electron-builder writes: version and the files list. */
export function parseFeed(text: string): Feed {
  const unq = (v: string) => v.trim().replace(/^(['"])(.*)\1$/, '$2')
  let version = ''
  const files: FeedFile[] = []
  let cur: Partial<FeedFile> | null = null
  let inFiles = false
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim() || raw.trimStart().startsWith('#')) continue
    const top = /^([A-Za-z0-9_]+):\s*(.*)$/.exec(raw)
    if (top) {
      inFiles = top[1] === 'files'
      if (top[1] === 'version') version = unq(top[2])
      continue
    }
    if (!inFiles) continue
    const item = /^\s*-\s+([A-Za-z0-9_]+):\s*(.*)$/.exec(raw)
    const field = /^\s+([A-Za-z0-9_]+):\s*(.*)$/.exec(raw)
    const kv = item ?? field
    if (!kv) continue
    if (item) { cur = {}; files.push(cur as FeedFile) }
    if (!cur) continue
    const v = unq(kv[2])
    if (kv[1] === 'url') cur.url = v
    else if (kv[1] === 'sha512') cur.sha512 = v
    else if (kv[1] === 'size') cur.size = Number(v)
  }
  const valid = files.filter((f) => f.url && f.sha512)
  if (!version || !valid.length) throw new Error('flux de mise à jour invalide')
  return { version, files: valid }
}

/** The macOS zip for this architecture: "-arm64" in the name for Apple silicon, the other one for Intel. */
export function pickMacZip(feed: Feed, arch: string): FeedFile | null {
  const zips = feed.files.filter((f) => f.url.endsWith('.zip'))
  const arm = zips.find((f) => /arm64/.test(f.url))
  const intel = zips.find((f) => !/arm64|universal/.test(f.url))
  const universal = zips.find((f) => /universal/.test(f.url))
  return (arch === 'arm64' ? arm : intel) ?? universal ?? null
}
