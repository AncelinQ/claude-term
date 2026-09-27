import { app, BrowserWindow, dialog, ipcMain, shell, nativeTheme, session, net } from 'electron'
import { join } from 'node:path'
import { readdirSync, statSync, existsSync } from 'node:fs'
import { SettingsService } from './services/settings'
import { ThemeService } from './services/themes'
import { PtyService } from './services/pty'
import { createWindow, applyOverlayTheme } from './window'
import { ClaudeData } from './services/claude-data'
import { SessionTracker } from './services/session-tracker'
import { ClaudeSettings } from './services/claude-settings'
import { HookHub } from './services/hooks'
import { FileService } from './services/files'
import { Links } from './services/links'
import { Skills } from './services/skills'
import { Mcp } from './services/mcp'
import { scanClaudeProcesses } from './services/process'
import { FileIndex } from './services/search'
import { Attachments } from './services/attachments'
import { PluginHost } from './services/plugins'
import { PluginStore, type ApprovalRequest } from './services/plugin-store'
import { catalogueItems, type Catalogue, type RegistryEntry } from '@shared/plugin-registry'
import { PLUGIN_PERMISSIONS, type PluginPermission } from '@shared/plugins'
import type { DirEntry } from '@shared/ipc'

// Chrome DevTools Protocol for scripted UI checks (scripts/ui.ts): always in dev, on demand (CT_CDP_PORT) when packaged
if (!app.isPackaged || process.env.CT_CDP_PORT) app.commandLine.appendSwitch('remote-debugging-port', process.env.CT_CDP_PORT || '9333')

const settings = new SettingsService()
const builtinThemes = app.isPackaged ? join(process.resourcesPath, 'themes') : join(app.getAppPath(), 'resources', 'themes')
const themes = new ThemeService(settings, builtinThemes)

let win: BrowserWindow | null = null
const send = (channel: string, payload: unknown) => { if (win && !win.isDestroyed()) win.webContents.send(channel, payload) }

const ptys = new PtyService(() => settings.get(), (id, data) => send('pty:data', { id, data }), (id, code) => send('pty:exit', { id, code }))

// pty
ipcMain.handle('pty:create', (_e, opts) => ptys.create(opts))
ipcMain.on('pty:write', (_e, { id, data }) => ptys.write(id, data))
ipcMain.on('pty:resize', (_e, { id, cols, rows }) => ptys.resize(id, cols, rows))
ipcMain.on('pty:kill', (_e, { id }) => ptys.kill(id))

// fs
ipcMain.handle('fs:readdir', (_e, path: string): DirEntry[] => {
  try {
    return readdirSync(path, { withFileTypes: true })
      .map((d) => {
        let isDir = d.isDirectory()
        if (d.isSymbolicLink()) { try { isDir = statSync(join(path, d.name)).isDirectory() } catch { /* dangling */ } }
        return { name: d.name, path: join(path, d.name), isDir, hidden: d.name.startsWith('.') }
      })
      .sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) : a.isDir ? -1 : 1))
  } catch { return [] }
})
ipcMain.handle('fs:exists', (_e, path: string) => existsSync(path))
const files = new FileService((path) => send('fs:changed', { path }))
ipcMain.handle('fs:readFile', (_e, path: string) => files.read(path))
ipcMain.handle('fs:writeFile', (_e, { path, text }) => files.write(path, text))
ipcMain.on('fs:watch', (_e, path: string) => files.watch(path))
ipcMain.on('fs:unwatch', (_e, path: string) => files.unwatch(path))
ipcMain.handle('app:confirmSave', async (_e, name: string) => {
  const r = await dialog.showMessageBox(win!, { type: 'question', message: `Enregistrer les modifications de ${name} ?`, detail: 'Sinon elles seront perdues.', buttons: ['Enregistrer', 'Ne pas enregistrer', 'Annuler'], defaultId: 0, cancelId: 2 })
  return (['save', 'discard', 'cancel'] as const)[r.response]
})

// themes / settings
ipcMain.handle('themes:list', () => themes.list())
ipcMain.handle('themes:current', () => themes.current())
themes.onChange((t) => { send('themes:changed', t); if (win) applyOverlayTheme(win, t) })
ipcMain.handle('settings:get', () => settings.get())
ipcMain.handle('settings:set', (_e, patch) => settings.set(patch))
settings.onChange((s) => send('settings:changed', s))

// claude sessions
const claudeData = new ClaudeData()
const trackers = new Map<string, SessionTracker>()
const claimed = new Set<string>()
ipcMain.on('claude:track', (_e, { tabId, cwd, opts }) => {
  trackers.get(tabId)?.stop()
  trackers.set(tabId, new SessionTracker(tabId, cwd, claudeData, claimed, (id, state, newEvents) => send('claude:update', { tabId: id, state, newEvents }), opts ?? {}))
})
ipcMain.on('claude:untrack', (_e, { tabId }) => { trackers.get(tabId)?.stop(); trackers.delete(tabId) })
ipcMain.on('claude:setPlan', (_e, { tabId, path }) => trackers.get(tabId)?.setPlan(path))
ipcMain.handle('claude:plans', () => claudeData.plans())
ipcMain.handle('claude:sessions', (_e, cwd: string) => claudeData.sessions(cwd))
ipcMain.handle('claude:allSessions', () => claudeData.allSessions())
ipcMain.handle('claude:hasSessions', (_e, cwd: string) => claudeData.hasSessions(cwd))
ipcMain.handle('claude:deleteSession', (_e, s) => claudeData.deleteSession(s, (p) => shell.trashItem(p)))
ipcMain.handle('claude:sessionDiff', (_e, { path, backupName, sessionId }) => claudeData.sessionDiff(path, backupName, sessionId))
ipcMain.handle('claude:readText', (_e, path: string) => claudeData.readText(path))

// hooks → attention, notifications, dock badge
let visibleTab: string | null = null
ipcMain.on('ui:visibleTab', (_e, { tabId }) => { visibleTab = tabId })
const hooks = new HookHub(new ClaudeSettings(claudeData.settingsPath), () => trackers, send, (id) => id === visibleTab,
  () => { const s = settings.get(); return { notifyOS: s.notifyOS, dockBadge: s.dockBadge } }, (tabId) => send('claude:focusTab', { tabId }))
ipcMain.on('claude:clearAttention', (_e, { tabId }) => hooks.clear(tabId))
ipcMain.on('claude:untrack', (_e, { tabId }) => hooks.clear(tabId))
ipcMain.handle('hooks:installed', () => hooks.installed())
const claudeSettingsFile = new ClaudeSettings(claudeData.settingsPath)
ipcMain.handle('claudeSettings:read', () => ({ ...claudeSettingsFile.read(), path: claudeData.settingsPath }))
ipcMain.handle('claudeSettings:write', (_e, data) => { try { claudeSettingsFile.write(data); return { ok: true } } catch (e) { return { ok: false, error: String(e) } } })
ipcMain.handle('hooks:set', (_e, on: boolean) => hooks.setInstalled(on))

// npm, links, skills, mcp, processes, search
const ok = (fn: () => unknown) => { try { const r = fn(); return { ok: true, ...(typeof r === 'string' ? { path: r } : {}) } } catch (e) { return { ok: false, error: (e as Error).message } } }
ipcMain.handle('links:load', (_e, root: string) => Links.load(root))
ipcMain.handle('links:save', (_e, { root, links }) => ok(() => Links.save(root, links)))
const skills = new Skills()
ipcMain.handle('skills:project', (_e, root: string) => skills.project(root))
ipcMain.handle('skills:linked', (_e, root: string) => Links.load(root).flatMap((l) => skills.project(l.path, 'linked')))
ipcMain.handle('skills:personal', () => skills.personal())
ipcMain.handle('skills:plugins', () => skills.plugins())
ipcMain.handle('skills:create', (_e, { name, description, root }) => ok(() => skills.create(name, description, root)))
ipcMain.handle('skills:remove', (_e, s) => ok(() => skills.remove(s)))
const mcp = new Mcp(undefined, () => ptys.claudeBinary())
ipcMain.handle('mcp:project', (_e, root: string) => mcp.project(root))
ipcMain.handle('mcp:linked', (_e, root: string) => Links.load(root).flatMap((l) => mcp.project(l.path, 'linked')))
ipcMain.handle('mcp:user', () => mcp.user())
ipcMain.handle('mcp:local', (_e, root: string) => mcp.local(root))
ipcMain.handle('mcp:library', (_e, root: string | null) => mcp.library(root, settings.get().recentProjects))
ipcMain.handle('mcp:write', (_e, { server, root, replacing }) => ok(() => mcp.write(server, root, replacing)))
ipcMain.handle('mcp:remove', (_e, { name, root }) => ok(() => mcp.remove(name, root)))
ipcMain.handle('mcp:cli', (_e, { args, cwd }) => mcp.cli(args, cwd))
ipcMain.handle('mcp:health', async (_e, cwd: string | null) => {
  const r = await mcp.cli(['list'], cwd)
  return Object.fromEntries(Mcp.parseList(r.output).map((x) => [x.name, x.health]))
})
ipcMain.handle('proc:scan', () => scanClaudeProcesses())
ipcMain.on('proc:kill', (_e, { pid, signal }) => { try { process.kill(pid, signal ?? 'SIGTERM') } catch { /* gone */ } })
const index = new FileIndex()
ipcMain.handle('search:files', (_e, { root, query }) => index.search(root, query))

// attachments (images → files → prompt)
const attachments = new Attachments()
ipcMain.handle('att:saveDataUrl', (_e, d: string) => attachments.saveDataUrl(d))
ipcMain.handle('att:clipboardImage', () => attachments.clipboardImage())
ipcMain.handle('att:captureScreen', async () => { const p = await attachments.captureScreen(); if (p) { win?.show(); win?.focus() } return p })

// plugins
let activeRoot: string | null = null
const builtinPlugins = app.isPackaged ? join(process.resourcesPath, 'plugins') : join(app.getAppPath(), 'resources', 'plugins')
const pluginHost = new PluginHost(builtinPlugins, { send, projectRoot: () => activeRoot, settings: () => settings.get() as any })
ipcMain.handle('plugins:list', () => pluginHost.list())
ipcMain.handle('plugins:viewModel', (_e, id: string) => pluginHost.viewModel(id))
ipcMain.on('plugins:event', (_e, ev) => pluginHost.viewEvent(ev))
ipcMain.on('plugins:project', (_e, root: string | null) => { if (root !== activeRoot) { activeRoot = root; pluginHost.projectChanged(root) } })
ipcMain.on('plugins:commandEnd', (_e, info) => pluginHost.commandEnd(info))
ipcMain.on('plugins:promptReply', (_e, { id, value }) => pluginHost.promptReply(id, value))

// plugin catalogue (DESIGN.md §7.1)
const setApproved = (id: string, perms: string[] | null) => {
  const all = { ...settings.get().pluginPermissions }
  if (perms) all[id] = perms; else delete all[id]
  settings.set({ pluginPermissions: all })
}
const pluginStore = new PluginStore(pluginHost.userDir, app.getVersion(), {
  download,
  builtinIds: () => pluginHost.builtinIds(),
  installedVersion: (id) => pluginHost.get(id)?.manifest.version,
  approved: (id) => settings.get().pluginPermissions[id],
  approve: approvePlugin,
  setApproved,
  unload: (id) => pluginHost.unload(id),
  load: (dir) => { pluginHost.load(dir); send('plugins:changed', pluginHost.list()) },
})
let registryCache: { url: string; entries: RegistryEntry[]; skipped: string[] } | null = null
ipcMain.handle('plugins:catalogue', async (_e, refresh: boolean): Promise<Catalogue> => {
  const url = settings.get().pluginRegistry
  try {
    if (refresh || registryCache?.url !== url) registryCache = { url, ...(await pluginStore.registry(url)) }
    return { url, items: catalogueItems(registryCache.entries, pluginHost.list(), app.getVersion()), skipped: registryCache.skipped }
  } catch (e) {
    return { url, items: [], skipped: [], error: String((e as Error)?.message ?? e) }
  }
})
ipcMain.handle('plugins:install', async (_e, src: { id: string } | { url: string }) => {
  if ('url' in src) return pluginStore.install({ url: src.url })
  const entry = registryCache?.entries.find((x) => x.id === src.id)
  return entry ? pluginStore.install({ entry }) : { ok: false, error: 'plugin absent du catalogue' }
})
ipcMain.handle('plugins:uninstall', async (_e, id: string) => {
  const p = pluginHost.get(id)
  if (!p) return { ok: false, error: 'plugin inconnu' }
  const r = await dialog.showMessageBox(win!, { type: 'warning', message: `Désinstaller « ${p.manifest.name} » ?`, detail: `Le dossier ${p.dir} sera supprimé. Ses données (storage) sont conservées.`, buttons: ['Désinstaller', 'Annuler'], defaultId: 1, cancelId: 1 })
  if (r.response !== 0) return { ok: false, error: 'annulé' }
  settings.set({ disabledPlugins: settings.get().disabledPlugins.filter((x) => x !== id) })
  return pluginStore.uninstall(id, p.dir)
})
ipcMain.handle('plugins:setEnabled', (_e, { id, enabled }: { id: string; enabled: boolean }) => {
  const others = settings.get().disabledPlugins.filter((x) => x !== id)
  settings.set({ disabledPlugins: enabled ? others : [...others, id] })
  pluginHost.reload(id)
})
ipcMain.handle('plugins:approve', async (_e, id: string) => {
  const p = pluginHost.get(id)
  if (!p?.pendingPermissions) return false
  const perms = p.manifest.permissions ?? []
  if (!(await approvePlugin({ id, name: p.manifest.name, version: p.manifest.version, source: p.dir, sha256: '', permissions: perms, verified: false }))) return false
  setApproved(id, perms)
  pluginHost.reload(id)
  return true
})

async function approvePlugin(req: ApprovalRequest): Promise<boolean> {
  const perms = req.permissions.length ? req.permissions.map((p: PluginPermission) => `• ${p} — ${PLUGIN_PERMISSIONS[p]}`).join('\n') : 'aucune'
  const origin = req.sha256 ? `Source : ${req.source}\nsha256 : ${req.sha256}${req.verified ? ' (vérifié avec le catalogue)' : ' (non vérifié : installation depuis une URL)'}` : `Dossier : ${req.source}`
  const r = await dialog.showMessageBox(win!, {
    type: req.verified ? 'question' : 'warning',
    message: req.update ? `Mettre à jour « ${req.name} » ${req.update} → ${req.version} ?` : req.sha256 ? `Installer « ${req.name} » ${req.version} ?` : `Autoriser « ${req.name} » ?`,
    detail: `Permissions demandées :\n${perms}\n\n${origin}\n\nUn plugin s'exécute avec ces droits dans ClaudeTerm.`,
    buttons: [req.update ? 'Mettre à jour' : req.sha256 ? 'Installer' : 'Autoriser', 'Annuler'], defaultId: 1, cancelId: 1,
  })
  return r.response === 0
}

/** GET with a size cap (file: and http(s) through Electron's net stack). */
async function download(url: string, maxBytes: number): Promise<Buffer> {
  const res = await net.fetch(url, { redirect: 'follow', cache: 'no-store' })
  if (!res.ok) throw new Error(`téléchargement : HTTP ${res.status}`)
  if (Number(res.headers.get('content-length') ?? 0) > maxBytes) throw new Error('fichier trop grand')
  const chunks: Uint8Array[] = []
  let size = 0
  const reader = res.body!.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.length
    if (size > maxBytes) { reader.cancel(); throw new Error('fichier trop grand') }
    chunks.push(value)
  }
  return Buffer.concat(chunks)
}

// app
ipcMain.handle('app:pickFolder', async () => {
  const r = await dialog.showOpenDialog(win!, { properties: ['openDirectory', 'createDirectory', 'showHiddenFiles'] })
  return r.canceled ? null : r.filePaths[0]
})
ipcMain.on('app:openExternal', (_e, p: string) => { shell.openPath(p) })
ipcMain.on('app:reveal', (_e, p: string) => { shell.showItemInFolder(p) })

app.whenReady().then(() => {
  // dev runs the stock Electron binary: show the app icon in the Dock (packaged builds carry icon.icns)
  if (!app.isPackaged && process.platform === 'darwin') app.dock?.setIcon(join(app.getAppPath(), 'build', 'icon.png'))
  // renderer permissions: only the local font list (settings font pickers)
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => permission === 'local-fonts')
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(permission === 'local-fonts'))
  nativeTheme.themeSource = settings.get().themeFollowSystem ? 'system' : themes.current().type
  win = createWindow(themes.current())
  win.on('closed', () => { win = null })
  win.webContents.once('did-finish-load', () => { pluginStore.cleanStaging(); pluginHost.loadAll() })
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) win = createWindow(themes.current()) })
})

app.on('window-all-closed', () => { ptys.killAll(); app.quit() })
app.on('before-quit', () => { ptys.killAll(); pluginHost.dispose() })
