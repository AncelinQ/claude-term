import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { CtApi } from '@shared/ipc'

function channel<T>(name: string, filter: (payload: any) => boolean, map: (payload: any) => T, cb: (v: T) => void) {
  const handler = (_e: unknown, payload: any) => { if (filter(payload)) cb(map(payload)) }
  ipcRenderer.on(name, handler)
  return () => ipcRenderer.removeListener(name, handler)
}

const api: CtApi = {
  platform: process.platform,
  debug: !!process.env.CT_CDP_PORT || !!process.env.ELECTRON_RENDERER_URL,
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
    readFile: (path) => ipcRenderer.invoke('fs:readFile', path),
    writeFile: (path, text) => ipcRenderer.invoke('fs:writeFile', { path, text }),
    watch: (path) => ipcRenderer.send('fs:watch', path),
    unwatch: (path) => ipcRenderer.send('fs:unwatch', path),
    onChanged: (cb) => channel('fs:changed', () => true, (p) => p.path as string, cb),
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
  claude: {
    track: (tabId, cwd, opts) => ipcRenderer.send('claude:track', { tabId, cwd, opts }),
    untrack: (tabId) => ipcRenderer.send('claude:untrack', { tabId }),
    onUpdate: (cb) => channel('claude:update', () => true, (p) => p, cb),
    setPlan: (tabId, path) => ipcRenderer.send('claude:setPlan', { tabId, path }),
    plans: () => ipcRenderer.invoke('claude:plans'),
    sessions: (cwd) => ipcRenderer.invoke('claude:sessions', cwd),
    allSessions: () => ipcRenderer.invoke('claude:allSessions'),
    hasSessions: (cwd) => ipcRenderer.invoke('claude:hasSessions', cwd),
    deleteSession: (s) => ipcRenderer.invoke('claude:deleteSession', s),
    sessionDiff: (path, backupName, sessionId) => ipcRenderer.invoke('claude:sessionDiff', { path, backupName, sessionId }),
    readText: (path) => ipcRenderer.invoke('claude:readText', path),
    onAttention: (cb) => channel('claude:attention', () => true, (p) => p, cb),
    clearAttention: (tabId) => ipcRenderer.send('claude:clearAttention', { tabId }),
    visibleTab: (tabId) => ipcRenderer.send('ui:visibleTab', { tabId }),
    onFocusTab: (cb) => channel('claude:focusTab', () => true, (p) => p.tabId as string, cb),
    hooksInstalled: () => ipcRenderer.invoke('hooks:installed'),
    setHooksInstalled: (on) => ipcRenderer.invoke('hooks:set', on),
  },
  setHooks: (on) => ipcRenderer.invoke('hooks:set', on),
  claudeSettings: {
    read: () => ipcRenderer.invoke('claudeSettings:read'),
    write: (data) => ipcRenderer.invoke('claudeSettings:write', data),
  },
  links: {
    load: (root) => ipcRenderer.invoke('links:load', root),
    save: (root, links) => ipcRenderer.invoke('links:save', { root, links }),
  },
  skills: {
    project: (root) => ipcRenderer.invoke('skills:project', root),
    linked: (root) => ipcRenderer.invoke('skills:linked', root),
    personal: () => ipcRenderer.invoke('skills:personal'),
    plugins: () => ipcRenderer.invoke('skills:plugins'),
    create: (name, description, root) => ipcRenderer.invoke('skills:create', { name, description, root }),
    remove: (s) => ipcRenderer.invoke('skills:remove', s),
  },
  mcp: {
    project: (root) => ipcRenderer.invoke('mcp:project', root),
    linked: (root) => ipcRenderer.invoke('mcp:linked', root),
    user: () => ipcRenderer.invoke('mcp:user'),
    local: (root) => ipcRenderer.invoke('mcp:local', root),
    library: (root) => ipcRenderer.invoke('mcp:library', root),
    write: (server, root, replacing) => ipcRenderer.invoke('mcp:write', { server, root, replacing }),
    remove: (name, root) => ipcRenderer.invoke('mcp:remove', { name, root }),
    cli: (args, cwd) => ipcRenderer.invoke('mcp:cli', { args, cwd }),
    health: (cwd) => ipcRenderer.invoke('mcp:health', cwd),
  },
  processes: {
    scan: () => ipcRenderer.invoke('proc:scan'),
    kill: (pid, signal) => ipcRenderer.send('proc:kill', { pid, signal }),
  },
  search: {
    files: (root, query) => ipcRenderer.invoke('search:files', { root, query }),
  },
  attachments: {
    pathForFile: (file) => webUtils.getPathForFile(file),
    saveDataUrl: (dataUrl) => ipcRenderer.invoke('att:saveDataUrl', dataUrl),
    clipboardImage: () => ipcRenderer.invoke('att:clipboardImage'),
    captureScreen: () => ipcRenderer.invoke('att:captureScreen'),
  },
  app: {
    confirmSave: (name) => ipcRenderer.invoke('app:confirmSave', name),
    pickFolder: () => ipcRenderer.invoke('app:pickFolder'),
    openExternal: (path) => ipcRenderer.send('app:openExternal', path),
    revealInFinder: (path) => ipcRenderer.send('app:reveal', path),
  },
}

contextBridge.exposeInMainWorld('ct', api)
