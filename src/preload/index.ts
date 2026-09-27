import { contextBridge, ipcRenderer } from 'electron'
import type { CtApi } from '@shared/ipc'

function channel<T>(name: string, filter: (payload: any) => boolean, map: (payload: any) => T, cb: (v: T) => void) {
  const handler = (_e: unknown, payload: any) => { if (filter(payload)) cb(map(payload)) }
  ipcRenderer.on(name, handler)
  return () => ipcRenderer.removeListener(name, handler)
}

const api: CtApi = {
  platform: process.platform,
  home: process.env.HOME || process.env.USERPROFILE || '',
  pty: {
    create: (opts) => ipcRenderer.invoke('pty:create', opts),
    write: (id, data) => ipcRenderer.send('pty:write', { id, data }),
    resize: (id, cols, rows) => ipcRenderer.send('pty:resize', { id, cols, rows }),
    kill: (id) => ipcRenderer.send('pty:kill', { id }),
    onData: (id, cb) => channel('pty:data', (p) => p.id === id, (p) => p.data as string, cb),
    onExit: (id, cb) => channel('pty:exit', (p) => p.id === id, (p) => p.code as number, cb),
  },
  fs: {
    readdir: (path) => ipcRenderer.invoke('fs:readdir', path),
    exists: (path) => ipcRenderer.invoke('fs:exists', path),
  },
  themes: {
    list: () => ipcRenderer.invoke('themes:list'),
    current: () => ipcRenderer.invoke('themes:current'),
    onChange: (cb) => channel('themes:changed', () => true, (p) => p, cb),
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (patch) => ipcRenderer.invoke('settings:set', patch),
    onChange: (cb) => channel('settings:changed', () => true, (p) => p, cb),
  },
  app: {
    pickFolder: () => ipcRenderer.invoke('app:pickFolder'),
    openExternal: (path) => ipcRenderer.send('app:openExternal', path),
    revealInFinder: (path) => ipcRenderer.send('app:reveal', path),
  },
}

contextBridge.exposeInMainWorld('ct', api)
