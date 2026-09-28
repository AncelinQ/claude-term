import { readFileSync, writeFileSync, statSync, openSync, readSync, closeSync, existsSync, watch, type FSWatcher } from 'node:fs'
import { extname } from 'node:path'

export type FileKind = 'text' | 'image' | 'other'
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.ico', '.avif'])
const MIME: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp', '.ico': 'image/x-icon', '.avif': 'image/avif' }
export const MAX_TEXT = 4_000_000

/** Files for the editor: kind detection by content, read/write, change watching. */
export class FileService {
  private watchers = new Map<string, FSWatcher>()

  constructor(private onChanged: (path: string) => void) {}

  /** Text is detected by content (no NUL in the first bytes, valid UTF-8), so Makefile or .zshrc open too. */
  kind(path: string): FileKind {
    if (IMAGE_EXT.has(extname(path).toLowerCase())) return 'image'
    let fd: number
    try { fd = openSync(path, 'r') } catch { return 'other' }
    try {
      if (statSync(path).size > MAX_TEXT) return 'other'
      const buf = Buffer.alloc(8192)
      const n = readSync(fd, buf, 0, 8192, 0)
      if (n === 0) return 'text'
      const head = buf.subarray(0, n)
      if (head.includes(0)) return 'other'
      return n === 8192 || Buffer.from(head.toString('utf8'), 'utf8').equals(head) ? 'text' : 'other'
    } finally { closeSync(fd) }
  }

  read(path: string): { kind: FileKind; text?: string; dataUrl?: string; error?: string } {
    const kind = this.kind(path)
    try {
      if (kind === 'text') return { kind, text: readFileSync(path, 'utf8') }
      if (kind === 'image') return { kind, dataUrl: `data:${MIME[extname(path).toLowerCase()] ?? 'image/png'};base64,${readFileSync(path).toString('base64')}` }
      return { kind }
    } catch (e) { return { kind, error: String(e) } }
  }

  write(path: string, text: string): { ok: boolean; error?: string } {
    try { writeFileSync(path, text); return { ok: true } } catch (e) { return { ok: false, error: String(e) } }
  }

  /** Watches a file; atomic writes replace the inode, so the watcher is re-armed after each event. */
  watch(path: string) {
    this.unwatch(path)
    if (!existsSync(path)) return
    let pending: ReturnType<typeof setTimeout> | undefined
    const arm = () => {
      try {
        const w = watch(path, () => {
          clearTimeout(pending)
          pending = setTimeout(() => { this.onChanged(path); if (this.watchers.has(path)) { w.close(); arm() } }, 150)
        })
        this.watchers.set(path, w)
      } catch { this.watchers.delete(path) }
    }
    arm()
  }
  unwatch(path: string) { this.watchers.get(path)?.close(); this.watchers.delete(path) }
}

/** Watches the folders the explorer shows (not recursive), ref-counted; `onChanged(dir)` debounced. */
export class DirWatcher {
  private dirs = new Map<string, { w: FSWatcher; refs: number; t?: ReturnType<typeof setTimeout> }>()
  constructor(private onChanged: (dir: string) => void) {}
  watch(dir: string) {
    const d = this.dirs.get(dir)
    if (d) { d.refs++; return }
    try {
      const entry: { w: FSWatcher; refs: number; t?: ReturnType<typeof setTimeout> } = { w: undefined as unknown as FSWatcher, refs: 1 }
      entry.w = watch(dir, () => { clearTimeout(entry.t); entry.t = setTimeout(() => this.onChanged(dir), 200) })
      entry.w.on('error', () => this.drop(dir))
      this.dirs.set(dir, entry)
    } catch { /* gone or unreadable */ }
  }
  unwatch(dir: string) { const d = this.dirs.get(dir); if (d && --d.refs <= 0) this.drop(dir) }
  private drop(dir: string) { const d = this.dirs.get(dir); if (d) { clearTimeout(d.t); d.w.close(); this.dirs.delete(dir) } }
}
