/** Plugin catalogue: registry format, version rules and install checks (pure, see DESIGN.md §7.1). */
import { HOST, validateManifest, PLUGIN_PERMISSIONS, type PluginManifest, type PluginInfo, type PluginPermission } from './plugins'

export const DEFAULT_REGISTRY = 'https://raw.githubusercontent.com/sunstan/claudeterm-plugins/main/registry.json'

export interface RegistryEntry {
  id: string
  name: string
  description?: string
  version: string
  /** minimal app version: ">=2.0.0" or "2.0.0" */
  engine?: string
  permissions: PluginPermission[]
  /** the hosts "network" reaches (plugin.json "hosts") */
  hosts?: string[]
  /** plugin repository (shown, not fetched) */
  repo?: string
  /** .tgz archive */
  url: string
  sha256: string
}

export type CatalogueState = 'available' | 'installed' | 'update' | 'incompatible' | 'builtin'
export interface CatalogueItem extends RegistryEntry { state: CatalogueState; installedVersion?: string }
export interface Catalogue { url: string; items: CatalogueItem[]; error?: string; skipped: string[] }

/** Parses registry.json; invalid entries are skipped and reported, not fatal. */
export function parseRegistry(text: string): { entries: RegistryEntry[]; skipped: string[] } {
  let data: any
  try { data = JSON.parse(text) } catch { throw new Error('registry.json illisible') }
  if (!data || typeof data !== 'object' || data.version !== 1 || !Array.isArray(data.plugins)) throw new Error('registry.json : format inconnu (version 1 attendue)')
  const entries: RegistryEntry[] = []
  const skipped: string[] = []
  const seen = new Set<string>()
  for (const e of data.plugins) {
    const err = entryError(e)
    if (err || seen.has(e.id)) { skipped.push(`${typeof e?.id === 'string' ? e.id : '?'} : ${err ?? 'id en double'}`); continue }
    seen.add(e.id)
    entries.push({ id: e.id, name: e.name, description: typeof e.description === 'string' ? e.description : undefined, version: e.version, engine: e.engine, permissions: e.permissions ?? [], hosts: e.hosts, repo: typeof e.repo === 'string' ? e.repo : undefined, url: e.url, sha256: e.sha256.toLowerCase() })
  }
  return { entries, skipped }
}

function entryError(e: any): string | null {
  if (!e || typeof e !== 'object') return 'entrée invalide'
  if (typeof e.id !== 'string' || !/^[a-z0-9][a-z0-9.-]*$/.test(e.id)) return 'id invalide'
  if (typeof e.name !== 'string' || !e.name) return 'name manquant'
  if (typeof e.version !== 'string' || !parseVersion(e.version)) return 'version invalide'
  if (e.engine !== undefined && (typeof e.engine !== 'string' || !parseVersion(e.engine.replace(/^>=\s*/, '')))) return 'engine invalide'
  if (e.permissions !== undefined && (!Array.isArray(e.permissions) || e.permissions.some((p: unknown) => typeof p !== 'string' || !Object.hasOwn(PLUGIN_PERMISSIONS, p)))) return 'permissions invalides'
  if (e.hosts !== undefined && (!Array.isArray(e.hosts) || e.hosts.some((h: unknown) => typeof h !== 'string' || !HOST.test(h)))) return 'hosts invalides'
  if (typeof e.url !== 'string' || !allowedUrl(e.url)) return 'url refusée'
  if (typeof e.sha256 !== 'string' || !/^[0-9a-fA-F]{64}$/.test(e.sha256)) return 'sha256 invalide'
  return null
}

/** https anywhere; http only on localhost; file: for local registries. */
export function allowedUrl(url: string): boolean {
  let u: URL
  try { u = new URL(url) } catch { return false }
  if (u.protocol === 'https:' || u.protocol === 'file:') return true
  return u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1')
}

function parseVersion(v: string): { nums: number[]; pre: string } | null {
  const m = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?$/.exec(v.trim())
  return m ? { nums: [+m[1], +(m[2] ?? 0), +(m[3] ?? 0)], pre: m[4] ?? '' } : null
}

/** -1 / 0 / 1; a pre-release sorts before its release; unparsable versions sort first. */
export function compareVersions(a: string, b: string): number {
  const x = parseVersion(a), y = parseVersion(b)
  if (!x || !y) return x ? 1 : y ? -1 : 0
  for (let i = 0; i < 3; i++) if (x.nums[i] !== y.nums[i]) return x.nums[i] < y.nums[i] ? -1 : 1
  if (x.pre === y.pre) return 0
  if (!x.pre || !y.pre) return x.pre ? -1 : 1
  return x.pre < y.pre ? -1 : 1
}

export function satisfiesEngine(engine: string | undefined, appVersion: string): boolean {
  return !engine || compareVersions(appVersion, engine.replace(/^>=\s*/, '')) >= 0
}

export function catalogueItems(entries: RegistryEntry[], installed: PluginInfo[], appVersion: string): CatalogueItem[] {
  return entries.map((e) => {
    const p = installed.find((i) => i.manifest.id === e.id)
    const installedVersion = p?.manifest.version
    const state: CatalogueState = p?.builtin ? 'builtin'
      : !satisfiesEngine(e.engine, appVersion) ? 'incompatible'
      : !p ? 'available'
      : compareVersions(e.version, installedVersion ?? '') > 0 ? 'update' : 'installed'
    return { ...e, state, installedVersion }
  })
}

/** Permissions asked by `wanted` and missing from `approved`. */
export function missingPermissions(wanted: readonly PluginPermission[] = [], approved: readonly string[] = []): PluginPermission[] {
  return wanted.filter((p) => !approved.includes(p))
}

/**
 * Checks an unpacked manifest before it replaces anything: valid, not a built-in id, same id / version as the
 * catalogue entry, engine satisfied, permissions within what the entry announced.
 */
export function checkCandidate(m: unknown, ctx: { entry?: RegistryEntry; builtinIds: string[]; appVersion: string }): string | null {
  const err = validateManifest(m)
  if (err) return err
  const man = m as PluginManifest
  if (typeof man.version !== 'string' || !parseVersion(man.version)) return 'version manquante ou invalide'
  if (ctx.builtinIds.includes(man.id)) return `« ${man.id} » est un plugin intégré`
  const engine = (m as any).engine
  if (engine !== undefined && typeof engine !== 'string') return 'engine invalide'
  if (!satisfiesEngine(engine ?? ctx.entry?.engine, ctx.appVersion)) return `demande ClaudeTerm ${engine ?? ctx.entry?.engine}`
  if (ctx.entry) {
    if (man.id !== ctx.entry.id) return `id « ${man.id} » ≠ catalogue « ${ctx.entry.id} »`
    if (man.version !== ctx.entry.version) return `version ${man.version} ≠ catalogue ${ctx.entry.version}`
    const extra = missingPermissions(man.permissions, ctx.entry.permissions)
    if (extra.length) return `permissions non annoncées par le catalogue : ${extra.join(', ')}`
    const hosts = man.permissions?.includes('network') ? (man.hosts ?? []).filter((h) => !(ctx.entry!.hosts ?? []).includes(h)) : []
    if (hosts.length) return `domaines non annoncés par le catalogue : ${hosts.join(', ')}`
  }
  return null
}
