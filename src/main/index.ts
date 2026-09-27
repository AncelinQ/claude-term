import { app, BrowserWindow, dialog, ipcMain, shell, nativeTheme } from 'electron'
import { join } from 'node:path'
import { readdirSync, statSync, existsSync } from 'node:fs'
import { SettingsService } from './services/settings'
import { ThemeService } from './services/themes'
import { PtyService } from './services/pty'
import { createWindow } from './window'
import { ClaudeData } from './services/claude-data'
import { SessionTracker } from './services/session-tracker'
import { ClaudeSettings } from './services/claude-settings'
import { HookHub } from './services/hooks'
import type { DirEntry } from '@shared/ipc'

// dev: Chrome DevTools Protocol for scripted UI checks (scripts/ui.ts)
if (!app.isPackaged) app.commandLine.appendSwitch('remote-debugging-port', process.env.CT_CDP_PORT || '9333')

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

// themes / settings
ipcMain.handle('themes:list', () => themes.list())
ipcMain.handle('themes:current', () => themes.current())
themes.onChange((t) => send('themes:changed', t))
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
ipcMain.handle('hooks:set', (_e, on: boolean) => hooks.setInstalled(on))

// app
ipcMain.handle('app:pickFolder', async () => {
  const r = await dialog.showOpenDialog(win!, { properties: ['openDirectory', 'createDirectory', 'showHiddenFiles'] })
  return r.canceled ? null : r.filePaths[0]
})
ipcMain.on('app:openExternal', (_e, p: string) => { shell.openPath(p) })
ipcMain.on('app:reveal', (_e, p: string) => { shell.showItemInFolder(p) })

app.whenReady().then(() => {
  nativeTheme.themeSource = settings.get().themeFollowSystem ? 'system' : themes.current().type
  win = createWindow(themes.current())
  win.on('closed', () => { win = null })
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) win = createWindow(themes.current()) })
})

app.on('window-all-closed', () => { ptys.killAll(); app.quit() })
app.on('before-quit', () => ptys.killAll())
