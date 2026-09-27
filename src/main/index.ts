import { app, BrowserWindow, dialog, ipcMain, shell, nativeTheme } from 'electron'
import { join } from 'node:path'
import { readdirSync, statSync, existsSync } from 'node:fs'
import { SettingsService } from './services/settings'
import { ThemeService } from './services/themes'
import { PtyService } from './services/pty'
import { createWindow } from './window'
import type { DirEntry } from '@shared/ipc'

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
