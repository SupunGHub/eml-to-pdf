const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openEml: () => ipcRenderer.invoke('open-eml'),
  selectOutputDir: () => ipcRenderer.invoke('select-output-dir'),
  convertBatch: (args) => ipcRenderer.invoke('convert-batch', args),
  onConversionProgress: (callback) => {
    ipcRenderer.on('conversion-progress', (_event, value) => callback(value));
  },
  onConversionError: (callback) => {
    ipcRenderer.on('conversion-error', (_event, value) => callback(value));
  },
  onConversionComplete: (callback) => {
    ipcRenderer.on('conversion-complete', (_event, value) => callback(value));
  },
  setTheme: (theme) => ipcRenderer.invoke('set-theme', theme),
  onThemeUpdated: (callback) => {
    ipcRenderer.on('theme-updated', (_event, ...args) => callback(...args));
  },
}); 