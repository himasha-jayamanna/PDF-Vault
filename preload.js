const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  showSaveDialog: (options) => ipcRenderer.invoke('show-save-dialog', options),
  showDirectoryDialog: (options) => ipcRenderer.invoke('show-directory-dialog', options),
  saveFile: ({ filePath, arrayBuffer }) => ipcRenderer.invoke('save-file', { filePath, arrayBuffer })
});
