const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  download: (url, format) => ipcRenderer.invoke("download", url, format),
  getInfo: (url) => ipcRenderer.invoke("getInfo", url),
  cancel: (id) => ipcRenderer.invoke("cancel", id),
});
