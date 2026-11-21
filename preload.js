const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sp', {
  store: {
    get: () => ipcRenderer.invoke('store:get'),
    put: (data) => ipcRenderer.invoke('store:put', data)
  },
  http: (url, options) => ipcRenderer.invoke('http:fetch', { url, options }),
  notify: (title, body) => ipcRenderer.invoke('app:notify', { title, body }),
  openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
  openPath: (p) => ipcRenderer.invoke('app:open-path', p),
  pickAudio: () => ipcRenderer.invoke('dialog:pick-audio'),
  pickFolder: () => ipcRenderer.invoke('dialog:pick-folder'),
  pickImage: () => ipcRenderer.invoke('dialog:pick-image'),
  focus: {
    start: (cfg) => ipcRenderer.invoke('focus:start', cfg),
    stop: () => ipcRenderer.invoke('focus:stop'),
    state: () => ipcRenderer.invoke('focus:state'),
    onViolation: (cb) => ipcRenderer.on('focus:violation', (e, data) => cb(data))
  },
  ytdlp: {
    check: () => ipcRenderer.invoke('ytdlp:check'),
    download: (url, outDir) => ipcRenderer.invoke('ytdlp:download', { url, outDir })
  }
});
