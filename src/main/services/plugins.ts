import { app } from 'electron'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, statSync, watch, type FSWatcher } from 'node:fs'
import { join, resolve, dirname, relative } from 'node:path'
import { execFile } from 'node:child_process'
import vm from 'node:vm'
import { missingPermissions } from '@shared/plugin-registry'
import { validateManifest, type PluginManifest, type PluginInfo, type ViewModel, type ViewEvent, type RunRequest, type PromptRequest, type DiffRequest } from '@shared/plugins'

export { validateManifest }

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
  private popoverSeq = 0
  private watchers: FSWatcher[] = []

  constructor(private builtinDir: string, private bridge: HostBridge, userDir = join(app.getPath('userData'), 'plugins')) {
    this.userDir = userDir
    mkdirSync(userDir, { recursive: true })
  }

  list(): PluginInfo[] { return [...this.plugins.values()].map((p) => p.info) }
  get(id: string): PluginInfo | undefined { return this.plugins.get(id)?.info }
  builtinIds(): string[] {
    try { return readdirSync(this.builtinDir).filter((n) => existsSync(join(this.builtinDir, n, 'plugin.json'))).map((n) => JSON.parse(readFileSync(join(this.builtinDir, n, 'plugin.json'), 'utf8')).id) } catch { return [] }
  }
  viewModel(viewId: string) { return this.views.get(viewId) ?? null }

  loadAll() {
    for (const [dir, builtin] of [[this.builtinDir, true], [this.userDir, false]] as const) {
      if (!existsSync(dir)) continue
      for (const name of readdirSync(dir)) {
        if (name.startsWith('.')) continue
        const pdir = join(dir, name)
        try { if (!statSync(pdir).isDirectory() || !existsSync(join(pdir, 'plugin.json'))) continue } catch { continue }
        this.load(pdir, builtin)
      }
    }
    this.bridge.send('plugins:changed', this.list())
  }

  /**
   * Loads a plugin folder: activated unless invalid, disabled by the user (settings.disabledPlugins) or, for a
   * user plugin, asking for permissions that were not approved (settings.pluginPermissions).
   */
  load(dir: string, builtin = false) {
    let manifest: PluginManifest
    try { manifest = JSON.parse(readFileSync(join(dir, 'plugin.json'), 'utf8')) } catch (e) { return }
    const err = validateManifest(manifest)
    if (!err && this.plugins.has(manifest.id) && this.plugins.get(manifest.id)!.info.dir !== dir) {
      console.warn(`[plugins] ${manifest.id}: already loaded from ${this.plugins.get(manifest.id)!.info.dir}, ${dir} ignored`)
      return
    }
    const s = this.bridge.settings()
    const disabled = !err && (s.disabledPlugins ?? []).includes(manifest.id)
    const pending = err || builtin ? [] : missingPermissions(manifest.permissions, s.pluginPermissions?.[manifest.id])
    const info: PluginInfo = { manifest, dir, builtin, enabled: !err && !disabled && !pending.length, disabled: disabled || undefined, pendingPermissions: pending.length ? pending : undefined, error: err ?? undefined }
    const loaded: Loaded = { info, ctx: null, disposers: [] }
    this.plugins.set(manifest.id, loaded)
    if (info.enabled) this.activate(loaded)
  }

  /** Deactivates a plugin (deactivate(), disposers, timers, views) and forgets it. */
  unload(id: string) {
    const p = this.plugins.get(id)
    if (!p) return
    try { p.deactivate?.() } catch (e) { console.error(`[plugin ${id}] deactivate`, e) }
    p.disposers.forEach((d) => { try { d() } catch { /* already gone */ } })
    p.emit = undefined
    for (const v of [...this.views.keys()]) if (v.startsWith(id + ':')) this.views.delete(v)
    this.plugins.delete(id)
    this.bridge.send('plugins:changed', this.list())
  }

  /** Reloads a plugin from its folder after a settings change (enable, disable, approval). */
  reload(id: string) {
    const p = this.plugins.get(id)
    if (!p) return
    const { dir, builtin } = p.info
    this.unload(id)
    this.load(dir, builtin)
    this.bridge.send('plugins:changed', this.list())
  }

  private activate(p: Loaded) {
    const { manifest, dir } = p.info
    const api = this.makeApi(p)
    // timers are tracked so that disabling a plugin stops them
    const timers = new Set<ReturnType<typeof setTimeout>>()
    p.disposers.push(() => { timers.forEach((t) => clearTimeout(t)); timers.clear() })
    const track = (t: ReturnType<typeof setTimeout>) => (timers.add(t), t)
    const untrack = (t: ReturnType<typeof setTimeout>) => { timers.delete(t); clearTimeout(t) }
    const context = vm.createContext({
      console: scopedConsole(manifest.id),
      setTimeout: (cb: () => void, ms?: number) => { const t: ReturnType<typeof setTimeout> = track(setTimeout(() => { timers.delete(t); cb() }, ms)); return t },
      clearTimeout: untrack, setInterval: (cb: () => void, ms?: number) => track(setInterval(cb, ms)), clearInterval: untrack,
      Promise, JSON, Math, Date, RegExp, Error, Map, Set, Array, Object, String, Number, Boolean })
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
      if (typeof (main.deactivate ?? main.default?.deactivate) === 'function') p.deactivate = main.deactivate ?? main.default.deactivate
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
        /** side-by-side (original/modified) or unified diff in a center tab */
        openDiff: (req: DiffRequest) => host.bridge.send('plugins:openDiff', req),
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
        /** popover under a view's header: a searchable list/tree; events arrive on onEvent with the popover id */
        popover: (localViewId: string, model: ViewModel) => {
          const pid = `popover:${++host.popoverSeq}`
          host.bridge.send('plugins:popover', { id: pid, anchorViewId: `${id}:${localViewId}`, model })
          return {
            id: pid,
            update: (m: ViewModel) => host.bridge.send('plugins:popover', { id: pid, anchorViewId: `${id}:${localViewId}`, model: m }),
            close: () => host.bridge.send('plugins:popoverClose', { id: pid }),
            onEvent: (cb: (e: ViewEvent) => void) => on('view:' + pid, cb),
          }
        },
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

interface Loaded { info: PluginInfo; ctx: any; disposers: (() => void)[]; emit?: (ev: string, ...a: any[]) => void; deactivate?: () => void }

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
