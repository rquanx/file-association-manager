const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('associationManager', Object.freeze({
  catalog: () => ipcRenderer.invoke('associations:catalog'),
  browse: () => ipcRenderer.invoke('associations:browse'),
  icons: (ids) => ipcRenderer.invoke('associations:icons', ids),
  setTheme: (theme) => ipcRenderer.invoke('associations:theme', theme),
  exportBackup: (collections) => ipcRenderer.invoke('associations:export', collections),
  previewImport: () => ipcRenderer.invoke('associations:preview-import'),
  restore: (mode, selection) => ipcRenderer.invoke('associations:restore', mode, selection),
  mapRestore: (source, appId) => ipcRenderer.invoke('associations:map-restore', source, appId),
  history: () => ipcRenderer.invoke('associations:history'),
  previewRollback: (id) => ipcRenderer.invoke('associations:preview-rollback', id),
  rollback: (id) => ipcRenderer.invoke('associations:rollback', id),
  version: () => ipcRenderer.invoke('associations:version'),
  language: () => ipcRenderer.invoke('preferences:language'),
  setLanguage: (value) => ipcRenderer.invoke('preferences:set-language', value),
  apply: (appId, extensions) => ipcRenderer.invoke('associations:apply', { appId, extensions }),
  windowsSettings: () => ipcRenderer.invoke('associations:settings'),
}));
