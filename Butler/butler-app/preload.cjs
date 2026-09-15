const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('butler', {
  start: () => ipcRenderer.invoke('butler:start'),
  stop: () => ipcRenderer.invoke('butler:stop'),
  status: () => ipcRenderer.invoke('butler:status'),
  sidecarStart: () => ipcRenderer.invoke('sidecar:start'),
  sidecarStatus: () => ipcRenderer.invoke('sidecar:status'),
  records: () => ipcRenderer.invoke('records:recent'),
  summaryDates: () => ipcRenderer.invoke('summary:dates'),
  summaryDay: (ymd) => ipcRenderer.invoke('summary:day', ymd),
  summaryUpdate: (args) => ipcRenderer.invoke('summary:update', args),
  engineState: () => ipcRenderer.invoke('butler:state'),
  qaAsk: (q) => ipcRenderer.invoke('qa:ask', q),
  qaOnProgress: (cb) => ipcRenderer.on('qa:progress', (_e, data) => cb(data)),
  // ---- 管家桌宠 ----
  petLaunch: () => ipcRenderer.invoke('pet:launch'),
  petStatus: () => ipcRenderer.invoke('pet:status'),
  petAutoLaunch: (on) => ipcRenderer.invoke('pet:autolaunch', on),
  avatarUpload: (bytes) => ipcRenderer.invoke('avatar:upload', bytes),
  avatarCurrent: () => ipcRenderer.invoke('avatar:current'),
});
