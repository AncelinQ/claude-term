import { app } from 'electron'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, statSync, watch, type FSWatcher } from 'node:fs'
import { join, resolve, dirname, relative } from 'node:path'
import { execFile } from 'node:child_process'
import vm from 'node:vm'
import type { PluginManifest, PluginInfo, ViewModel, ViewEvent, RunRequest, PromptRequest } from '@shared/plugins'

export interface HostBridge {
  send(channel: string, payload: unknown): void
  /** current project root of the active window, null on the welcome screen */
  projectRoot(): string | null
  settings(): Record<string, any>
}

/**
 * Plugin host (phase 5.0: runs in the main process, one `vm` context per plugin; the API boundary
 * is the same one a utility-process host will get later). Plugins are folders with `plugin.json`
 * and `main.js`; built-ins ship in resources/plugins, user plugins in userData/plugins.
 */
export class PluginHost {
  readonly userDir: string
  private plugins = new Map<string, Loaded>()
  private views = new Map<string, ViewModel>()
  private prompts = new Map<number, (v: string | null) => void>()
  private promptSeq = 0
  private watchers: FSWatcher[] = []

  constructor(private builtinDir: string, private bridge: HostBridge, userDir = join(app.getPath('userData'), 'plugins')) {
    this.userDir = userDir
    mkdirSync(userDir, { recursive: true })
  }

  list(): PluginInfo[] { return [...this.plugins.values()].map((p) => p.info) }
  viewModel(viewId: string) { return this.views.get(viewId) ?? null }

  loadAll() {
    for (const [dir, builtin] of [[this.builtinDir, true], [this.userDir, false]] as const) {
      if (!existsSync(dir)) continue
      for (const name of readdirSync(dir)) {
        const pdir = join(dir, name)
        try { if (!statSync(pdir).isDirectory() || !existsSync(join(pdir, 'plugin.json'))) continue } catch { continue }
        this.load(pdir, builtin)
      }
    }
    this.bridge.send('plugins:changed', this.list())
  }

  private load(dir: string, builtin: boolean) {
    let manifest: PluginManifest
    try { manifest = JSON.parse(readFileSync(join(dir, 'plugin.json'), 'utf8')) } catch (e) { return }
    const err = validateManifest(manifest)
    const info: PluginInfo = { manifest, dir, builtin, enabled: !err, error: err ?? undefined }
    const loaded: Loaded = { info, ctx: null, disposers: [] }
    this.plugins.set(manifest.id, loaded)
    if (!err) this.activate(loaded)
  }

  private activate(p: Loaded) {
    const { manifest, dir } = p.info
    const api = this.makeApi(p)
    const context = vm.createContext({ console: scopedConsole(manifest.id), setTimeout, clearTimeout, setInterval, clearInterval, Promise, JSON, Math, Date, RegExp, Error, Map, Set, Array, Object, String, Number, Boolean })
    const requireLocal = (name: string) => {
      const file = resolve(dir, name.endsWith('.js') ? name : name + '.js')
      if (relative(dir, file).startsWith('..')) throw new Error('require outside the plugin folder')
      const mod: any = { exports: {} }
      vm.runInContext(`(function (module, exports, require) {\n${readFileSync(file, 'utf8')}\n})`, context, { filename: file })(mod, mod.exports, requireLocal)
      return mod.exports
    }
    try {
      const main = requireLocal(manifest.main)
      const activate = main.activate ?? main.default?.activate
      if (typeof activate !== 'function') throw new Error('main.js exports no activate(ctx)')
      p.ctx = api
      Promise.resolve(activate(api)).catch((e) => this.fail(p, e))
    } catch (e) { this.fail(p, e) }
  }

  private fail(p: Loaded, e: unknown) {
    p.info.error = String((e as Error)?.message ?? e); p.info.enabled = false
    console.error(`[plugin ${p.info.manifest.id}]`, e)
    this.bridge.send('plugins:changed', this.list())
  }

  /** The `ctx` object handed to `activate`. */
  private makeApi(p: Loaded) {
    const id = p.info.manifest.id
    const perms = new Set(p.info.manifest.permissions ?? [])
    const need = (perm: string) => { if (!perms.has(perm as any)) throw new Error(`permission "${perm}" not declared in plugin.json`) }
    const listeners = new Map<string, Set<(...a: any[]) => void>>()
    const on = (ev: string, cb: (...a: any[]) => void) => { (listeners.get(ev) ?? listeners.set(ev, new Set()).get(ev)!).add(cb); return () => listeners.get(ev)?.delete(cb) }
    p.emit = (ev, ...a) => listeners.get(ev)?.forEach((cb) => { try { cb(...a) } catch (e) { console.error(`[plugin ${id}] ${ev}`, e) } })
    const host = this
    return {
      plugin: { id, dir: p.info.dir },
      workspace: {
        get project() { return host.bridge.projectRoot() },
        onDidChangeProject: (cb: (root: string | null) => void) => on('project', cb),
        openFile: (path: string) => host.bridge.send('plugins:openFile', { path }),
        fs: {
          exists: (path: string) => existsSync(path),
          read: (path: string) => readFileSync(path, 'utf8'),
          list: (path: string) => { try { return readdirSync(path, { withFileTypes: true }).map((d) => ({ name: d.name, dir: d.isDirectory() })) } catch { return [] } },
          watch: (path: string, cb: () => void) => { try { const w = watch(path, { recursive: false }, () => cb()); host.watchers.push(w); p.disposers.push(() => w.close()); return () => w.close() } catch { return () => {} } },
        },
      },
      ui: {
        view: (localId: string) => {
          const viewId = `${id}:${localId}`   // views are namespaced by plugin id
          return {
            set: (model: ViewModel) => { host.views.set(viewId, model); host.bridge.send('plugins:view', { viewId, model }) },
            onEvent: (cb: (e: ViewEvent) => void) => on('view:' + viewId, cb),
          }
        },
        notify: (title: string, body?: string) => host.bridge.send('plugins:notify', { title, body }),
        /** modal text prompt; resolves null when cancelled */
        prompt: (req: Omit<PromptRequest, 'id'>) => new Promise<string | null>((res) => { const pid = ++host.promptSeq; host.prompts.set(pid, res); host.bridge.send('plugins:prompt', { id: pid, ...req }) }),
      },
      terminal: {
        run: (req: RunRequest) => host.bridge.send('plugins:run', req),
        /** a foreground command ended in a shell tab of the active project (shell integration) */
        onCommandEnd: (cb: (info: { command: string; exit: number | null }) => void) => on('commandEnd', cb),
      },
      process: {
        exec: (file: string, args: string[] = [], opts: { cwd?: string } = {}) => {
          need('process')
          return new Promise<{ code: number; stdout: string; stderr: string }>((res) => execFile(file, args, { cwd: opts.cwd, maxBuffer: 8_000_000 }, (err, stdout, stderr) => res({ code: err ? ((err as any).code ?? 1) : 0, stdout: String(stdout), stderr: String(stderr) })))
        },
      },
      settings: {
        get: (key: string) => { const s = host.bridge.settings(); return s.plugins?.[id]?.[key] ?? p.info.manifest.contributes?.settings?.[key]?.default },
      },
      storage: storageFor(join(this.userDir, '.storage', id + '.json')),
    }
  }

  // MARK: renderer → host

  viewEvent(e: ViewEvent) {
    for (const p of this.plugins.values()) p.emit?.('view:' + e.viewId, e)
  }
  projectChanged(root: string | null) {
    for (const p of this.plugins.values()) p.emit?.('project', root)
  }
  commandEnd(info: { command: string; exit: number | null }) {
    for (const p of this.plugins.values()) p.emit?.('commandEnd', info)
  }
  promptReply(id: number, value: string | null) { this.prompts.get(id)?.(value); this.prompts.delete(id) }
  dispose() { this.watchers.forEach((w) => w.close()); for (const p of this.plugins.values()) p.disposers.forEach((d) => d()) }
}

interface Loaded { info: PluginInfo; ctx: any; disposers: (() => void)[]; emit?: (ev: string, ...a: any[]) => void }

export function validateManifest(m: any): string | null {
  if (!m || typeof m !== 'object') return 'plugin.json invalide'
  if (typeof m.id !== 'string' || !/^[a-z0-9][a-z0-9.-]*$/.test(m.id)) return 'id manquant ou invalide'
  if (typeof m.name !== 'string' || !m.name) return 'name manquant'
  if (typeof m.main !== 'string' || !m.main) return 'main manquant'
  for (const a of m.contributes?.activity ?? []) if (!a.id || !a.title || (a.side !== 'left' && a.side !== 'right')) return 'contributes.activity invalide'
  for (const v of m.contributes?.views ?? []) if (!v.id || !v.activity) return 'contributes.views invalide'
  return null
}

function scopedConsole(id: string) {
  const tag = `[plugin ${id}]`
  return { log: (...a: unknown[]) => console.log(tag, ...a), warn: (...a: unknown[]) => console.warn(tag, ...a), error: (...a: unknown[]) => console.error(tag, ...a) }
}

function storageFor(file: string) {
  const read = (): Record<string, unknown> => { try { return JSON.parse(readFileSync(file, 'utf8')) } catch { return {} } }
  return {
    get: (k: string) => read()[k],
    set: (k: string, v: unknown) => { mkdirSync(dirname(file), { recursive: true }); const d = read(); d[k] = v; writeFileSync(file, JSON.stringify(d, null, 2)) },
  }
}
