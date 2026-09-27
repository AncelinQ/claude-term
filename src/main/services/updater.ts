import { app, net } from 'electron'
import { createHash } from 'node:crypto'
import { execFile, spawn } from 'node:child_process'
import { mkdtempSync, readdirSync, rmSync, writeFileSync, accessSync, constants } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { compareVersions } from '@shared/plugin-registry'
import { parseFeed, pickMacZip, type UpdateState } from '@shared/update'

const run = promisify(execFile)
/** GitHub releases of the app (also the `publish` target in electron-builder.yml) */
export const RELEASES = process.env.CT_UPDATE_URL || 'https://github.com/sunstan/claude-term/releases'  // CT_UPDATE_URL: local feed for tests
const EVERY = 6 * 3600_000

/**
 * Automatic updates from the GitHub releases. Windows / Linux: electron-updater (NSIS, AppImage). macOS: the
 * builds are unsigned and Squirrel.Mac refuses unsigned updates, so the zip is downloaded and checked (sha512
 * from latest-mac.yml), then a detached script swaps the .app once the app has quit and reopens it.
 */
export class Updater {
  private state: UpdateState = { status: 'idle' }
  private timer: ReturnType<typeof setInterval> | null = null
  private staged: { app: string; version: string; dir: string } | null = null
  private installing = false
  private electronUpdater: any = null

  constructor(private emit: (s: UpdateState) => void, private enabled: () => boolean) {}

  get(): UpdateState { return { ...this.state, current: app.getVersion() } }

  start() {
    const reason = this.unsupported()
    if (reason) { this.set({ status: 'unsupported', reason }); return }
    setTimeout(() => this.auto(), 10_000)
    this.timer = setInterval(() => this.auto(), EVERY)
  }

  private auto() { if (this.enabled() && this.state.status !== 'ready' && this.state.status !== 'downloading') this.check() }

  private unsupported(): string | null {
    if (!app.isPackaged) return 'version de développement'
    if (process.platform === 'linux' && !process.env.APPIMAGE) return 'installation hors AppImage'
    if (process.platform === 'darwin') {
      const bundle = this.bundle()
      if (!bundle) return 'application introuvable'
      if (bundle.startsWith('/Volumes/')) return 'lancée depuis l\'image disque : copiez-la dans Applications'
      try { accessSync(dirname(bundle), constants.W_OK) } catch { return `dossier ${dirname(bundle)} non modifiable` }
    }
    return null
  }

  private set(s: UpdateState) { this.state = s; this.emit(this.get()) }

  /** /Applications/ClaudeTerm.app from …/Contents/MacOS/ClaudeTerm */
  private bundle(): string | null {
    const b = resolve(process.execPath, '..', '..', '..')
    return b.endsWith('.app') ? b : null
  }

  async check(): Promise<UpdateState> {
    if (this.state.status === 'unsupported' || this.state.status === 'checking' || this.state.status === 'downloading') return this.get()
    if (this.state.status === 'ready') return this.get()
    this.set({ status: 'checking' })
    try {
      if (process.platform === 'darwin') await this.checkMac()
      else await this.checkElectronUpdater()
    } catch (e) {
      this.set({ status: 'error', error: String((e as Error)?.message ?? e), checkedAt: Date.now() })
    }
    return this.get()
  }

  // MARK: macOS

  private async checkMac() {
    const feed = parseFeed((await get(`${RELEASES}/latest/download/latest-mac.yml`)).toString('utf8'))
    if (compareVersions(feed.version, app.getVersion()) <= 0) { this.set({ status: 'none', checkedAt: Date.now() }); return }
    const file = pickMacZip(feed, process.arch)
    if (!file) throw new Error(`pas d'archive macOS ${process.arch} dans la version ${feed.version}`)
    this.set({ status: 'downloading', version: feed.version, progress: 0 })
    const zip = await get(`${RELEASES}/download/v${feed.version}/${encodeURIComponent(file.url)}`, (p) => this.set({ status: 'downloading', version: feed.version, progress: p }), file.size)
    if (createHash('sha512').update(zip).digest('base64') !== file.sha512) throw new Error('archive corrompue (sha512 différent)')
    const dir = mkdtempSync(join(tmpdir(), 'claudeterm-update-'))
    writeFileSync(join(dir, 'update.zip'), zip)
    await run('/usr/bin/ditto', ['-x', '-k', join(dir, 'update.zip'), join(dir, 'app')])
    const name = readdirSync(join(dir, 'app')).find((n) => n.endsWith('.app'))
    if (!name) throw new Error('pas d\'application dans l\'archive')
    const staged = join(dir, 'app', name)
    const { stdout } = await run('/usr/bin/defaults', ['read', join(staged, 'Contents', 'Info'), 'CFBundleShortVersionString'])
    if (stdout.trim() !== feed.version) throw new Error(`l'archive contient la version ${stdout.trim()}, pas ${feed.version}`)
    rmSync(join(dir, 'update.zip'))
    if (this.staged) rmSync(this.staged.dir, { recursive: true, force: true })
    this.staged = { app: staged, version: feed.version, dir }
    this.set({ status: 'ready', version: feed.version, checkedAt: Date.now() })
  }

  /** Swaps the bundle once this process has exited; restores the old one if the move fails. */
  private swapMac(relaunch: boolean) {
    const target = this.bundle()
    if (!target || !this.staged) return
    const q = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`
    const script = join(this.staged.dir, 'swap.sh')
    writeFileSync(script, [
      '#!/bin/sh',
      `while kill -0 ${process.pid} 2>/dev/null; do sleep 0.2; done`,
      `T=${q(target)}; N=${q(this.staged.app)}`,
      'rm -rf "$T.old"',
      'if mv "$T" "$T.old"; then',
      '  if mv "$N" "$T"; then rm -rf "$T.old"; else mv "$T.old" "$T"; fi',
      'fi',
      'xattr -dr com.apple.quarantine "$T" 2>/dev/null',
      relaunch ? 'open "$T"' : '',
      `rm -rf ${q(this.staged.dir)}`,
    ].join('\n') + '\n')
    spawn('/bin/sh', [script], { detached: true, stdio: 'ignore' }).unref()
  }

  // MARK: Windows / Linux

  private async checkElectronUpdater() {
    if (!this.electronUpdater) {
      const { autoUpdater } = await import('electron-updater')
      autoUpdater.autoDownload = true
      autoUpdater.autoInstallOnAppQuit = true
      autoUpdater.on('download-progress', (p: { percent: number }) => this.set({ status: 'downloading', version: this.state.version, progress: Math.round(p.percent) }))
      autoUpdater.on('update-downloaded', (i: { version: string }) => this.set({ status: 'ready', version: i.version, checkedAt: Date.now() }))
      autoUpdater.on('error', (e: Error) => this.set({ status: 'error', error: e.message, checkedAt: Date.now() }))
      this.electronUpdater = autoUpdater
    }
    const r = await this.electronUpdater.checkForUpdates()
    const v = r?.updateInfo?.version
    if (!v || compareVersions(v, app.getVersion()) <= 0) this.set({ status: 'none', checkedAt: Date.now() })
    else if (this.state.status === 'checking') this.set({ status: 'downloading', version: v, progress: 0 })
  }

  // MARK: install

  /** Quits and installs the downloaded version, then reopens the app. */
  install() {
    if (this.state.status !== 'ready' || this.installing) return
    this.installing = true
    if (process.platform === 'darwin') { this.swapMac(true); app.quit() }
    else this.electronUpdater?.quitAndInstall(false, true)
  }

  /** A downloaded update is applied when the app quits normally (without reopening it). */
  onQuit() {
    if (this.timer) clearInterval(this.timer)
    if (process.platform === 'darwin' && this.state.status === 'ready' && !this.installing) { this.installing = true; this.swapMac(false) }
  }
}

/** GET following redirects (GitHub → objects CDN), no HTTP cache, with progress. */
async function get(url: string, progress?: (pct: number) => void, expected?: number): Promise<Buffer> {
  const res = await net.fetch(url, { redirect: 'follow', cache: 'no-store' })
  if (res.status === 404) throw new Error('aucune version publiée')
  if (!res.ok) throw new Error(`mise à jour : HTTP ${res.status}`)
  const total = expected ?? Number(res.headers.get('content-length') ?? 0)
  const chunks: Uint8Array[] = []
  let size = 0, last = -1
  const reader = res.body!.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value); size += value.length
    const pct = total ? Math.floor((size / total) * 100) : 0
    if (progress && pct !== last) { last = pct; progress(pct) }
  }
  return Buffer.concat(chunks)
}

