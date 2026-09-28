// Preload of a plugin window (sandboxed renderer, no Node). The plugin only sees `ctPlugin`: calls to the host in main,
// which knows the caller from its webContents and checks every call against the plugin's permissions.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('ctPlugin', {
  call: (method, args) => ipcRenderer.sendSync('plugin:call', method, args),
  callAsync: (method, args) => ipcRenderer.invoke('plugin:callAsync', method, args),
  send: (method, args) => ipcRenderer.send('plugin:send', method, args),
  onEvent: (cb) => { ipcRenderer.on('plugin:event', (_e, ev, args) => cb(ev, args)) },
})
