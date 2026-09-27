import { app, BrowserWindow, dialog, ipcMain, shell, nativeTheme, session } from 'electron'
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

// app
ipcMain.handle('app:pickFolder', async () => {
  const r = await dialog.showOpenDialog(win!, { properties: ['openDirectory', 'createDirectory', 'showHiddenFiles'] })
  return r.canceled ? null : r.filePaths[0]
})
ipcMain.on('app:openExternal', (_e, p: string) => { shell.openPath(p) })
ipcMain.on('app:reveal', (_e, p: string) => { shell.showItemInFolder(p) })

app.whenReady().then(() => {
  // renderer permissions: only the local font list (settings font pickers)
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => permission === 'local-fonts')
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(permission === 'local-fonts'))
  nativeTheme.themeSource = settings.get().themeFollowSystem ? 'system' : themes.current().type
  win = createWindow(themes.current())
  win.on('closed', () => { win = null })
  win.webContents.once('did-finish-load', () => pluginHost.loadAll())
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) win = createWindow(themes.current()) })
})

app.on('window-all-closed', () => { ptys.killAll(); app.quit() })
app.on('before-quit', () => { ptys.killAll(); pluginHost.dispose() })
