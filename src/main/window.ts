import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import type { ResolvedTheme } from '@shared/theme'
import { isWebUrl } from '@shared/external'
import { lookTokens, type Look } from '@shared/looks'

/** Windows/Linux: recolors the native caption buttons with the title strip (the theme's, or the look's canvas and ink). */
export function applyOverlayTheme(win: BrowserWindow, theme: ResolvedTheme, look?: Look) {
  if (process.platform === 'darwin') return
  const tokens = { ...theme.tokens, ...lookTokens(look, theme.tokens) }
  try { win.setTitleBarOverlay({ color: tokens['activity.bg'], symbolColor: tokens['activity.active'] ?? tokens['text'], height: 38 }) } catch { /* not supported */ }
}

export function createWindow(theme: ResolvedTheme): BrowserWindow {
  const mac = process.platform === 'darwin'
  const win = new BrowserWindow({
    width: 1400, height: 850, minWidth: 1000, minHeight: 600,
    show: false,
    backgroundColor: theme.tokens['window.bg'],
    // macOS: traffic lights over our title strip; others: native caption buttons overlaid on it
    titleBarStyle: mac ? 'hiddenInset' : 'hidden',
    trafficLightPosition: mac ? { x: 14, y: 12 } : undefined,
    titleBarOverlay: mac ? undefined : { color: theme.tokens['activity.bg'], symbolColor: theme.tokens['text'], height: 38 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
    },
  })
  win.once('ready-to-show', () => win.show())
  if (!app.isPackaged) win.webContents.on('console-message', (e) => { if (e.level === 'error' || e.level === 'warning') console.log(`[renderer ${e.level}] ${e.message} (${e.sourceId}:${e.lineNumber})`) })
  // links the page opens go to the default browser (web and mail only); the workbench itself never navigates away
  win.webContents.setWindowOpenHandler(({ url }) => { if (isWebUrl(url)) shell.openExternal(url); return { action: 'deny' } })
  win.webContents.on('will-navigate', (e, url) => {
    if (url === win.webContents.getURL()) return   // reloads (dev HMR)
    e.preventDefault()
    if (isWebUrl(url)) shell.openExternal(url)
  })
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(join(__dirname, '../renderer/index.html'))
  return win
}
