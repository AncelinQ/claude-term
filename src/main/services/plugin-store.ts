import { createHash, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { readTarGz, stripTopFolder } from './tar'
import { allowedUrl, checkCandidate, parseRegistry, type RegistryEntry } from '@shared/plugin-registry'
import { grantsOf, pendingPermissions, type PluginManifest, type PluginPermission } from '@shared/plugins'

export const LIMITS = { archive: 20 * 1024 * 1024, unpacked: 50 * 1024 * 1024, files: 2000, registry: 2 * 1024 * 1024 }

export interface ApprovalRequest {
  id: string; name: string; version: string; source: string; sha256: string
  permissions: PluginPermission[]
  /** the hosts "network" reaches */
  hosts?: string[]
  /** installed version when this is an update */
  update?: string
  /** true when the catalogue checksum was verified (false: install from URL) */
  verified: boolean
}

export interface StoreHost {
  download(url: string, maxBytes: number): Promise<Buffer>
  builtinIds(): string[]
  installedVersion(id: string): string | undefined
  approved(id: string): string[] | undefined
  /** native confirmation listing the permissions */
  approve(req: ApprovalRequest): Promise<boolean>
  /** what was approved: permissions and "network:<host>" grants (shared/plugins grantsOf) */
  setApproved(id: string, grants: string[] | null): void
  /** deactivate and forget a plugin before its folder changes */
  unload(id: string): void
  /** load (and activate) the plugin folder */
  load(dir: string): void
}

export type InstallResult = { ok: true; id: string } | { ok: false; error: string; cancelled?: boolean }

/** Catalogue fetch and plugin install / update / uninstall into `userData/plugins/<id>` (DESIGN.md §7.1). */
export class PluginStore {
  constructor(private userDir: string, private appVersion: string, private host: StoreHost) {}

  async registry(url: string): Promise<{ entries: RegistryEntry[]; skipped: string[] }> {
    if (!allowedUrl(url)) throw new Error('adresse du catalogue refusée (https, http://localhost ou file:)')
    return parseRegistry((await this.host.download(url, LIMITS.registry)).toString('utf8'))
  }

  async install(src: { entry: RegistryEntry } | { url: string }): Promise<InstallResult> {
    const entry = 'entry' in src ? src.entry : undefined
    const url = entry?.url ?? (src as { url: string }).url.trim()
    const staging = join(this.userDir, '.staging', randomBytes(6).toString('hex'))
    try {
      if (!allowedUrl(url)) throw new Error('adresse refusée (https, http://localhost ou file:)')
      const gz = await this.host.download(url, LIMITS.archive)
      const sha256 = createHash('sha256').update(gz).digest('hex')
      if (entry && sha256 !== entry.sha256) throw new Error(`sha256 différent du catalogue (${sha256.slice(0, 12)}… ≠ ${entry.sha256.slice(0, 12)}…)`)
      const files = stripTopFolder(readTarGz(gz, { maxBytes: LIMITS.unpacked, maxFiles: LIMITS.files }))
      const mf = files.find((f) => f.path === 'plugin.json')
      if (!mf) throw new Error('plugin.json absent de l\'archive')
      let manifest: PluginManifest
      try { manifest = JSON.parse(mf.data.toString('utf8')) } catch { throw new Error('plugin.json illisible') }
      const err = checkCandidate(manifest, { entry, builtinIds: this.host.builtinIds(), appVersion: this.appVersion })
      if (err) throw new Error(err)
      if (!files.some((f) => f.path === manifest.main.replace(/^\.\//, ''))) throw new Error(`${manifest.main} absent de l'archive`)
      const update = this.host.installedVersion(manifest.id)
      const perms = manifest.permissions ?? []
      const approved = this.host.approved(manifest.id)
      // a fresh install always asks; an update only when it asks for more permissions or new hosts
      if (!update || !approved || pendingPermissions(manifest, approved).length) {
        const ok = await this.host.approve({ id: manifest.id, name: manifest.name, version: manifest.version, source: url, sha256, permissions: perms, hosts: perms.includes('network') ? manifest.hosts : undefined, update, verified: !!entry })
        if (!ok) return { ok: false, error: 'installation annulée', cancelled: true }
      }
      for (const f of files) {
        const p = join(staging, ...f.path.split('/'))
        mkdirSync(dirname(p), { recursive: true })
        writeFileSync(p, f.data)
      }
      const target = join(this.userDir, manifest.id)
      this.host.unload(manifest.id)
      const trash = join(this.userDir, '.staging', `old-${manifest.id}-${Date.now()}`)
      if (existsSync(target)) renameSync(target, trash)
      renameSync(staging, target)
      rmSync(trash, { recursive: true, force: true })
      this.host.setApproved(manifest.id, grantsOf(manifest))
      this.host.load(target)
      return { ok: true, id: manifest.id }
    } catch (e) {
      return { ok: false, error: String((e as Error)?.message ?? e) }
    } finally {
      rmSync(staging, { recursive: true, force: true })
    }
  }

  /** Removes a user plugin folder (built-ins are refused). Its storage file is kept. */
  uninstall(id: string, dir: string): InstallResult {
    if (this.host.builtinIds().includes(id)) return { ok: false, error: 'plugin intégré : désactivez-le plutôt' }
    if (dirname(dir) !== this.userDir) return { ok: false, error: 'dossier hors de userData/plugins' }
    this.host.unload(id)
    rmSync(dir, { recursive: true, force: true })
    this.host.setApproved(id, null)
    return { ok: true, id }
  }

  /** Clears leftovers of an interrupted install. */
  cleanStaging() { rmSync(join(this.userDir, '.staging'), { recursive: true, force: true }) }
}
