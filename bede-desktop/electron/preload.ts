import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('bede', {
  getConfig:    ()       => ipcRenderer.invoke('bede:get-config'),
  saveConfig:   (cfg: unknown) => ipcRenderer.invoke('bede:save-config', cfg),
  serverStart:  ()       => ipcRenderer.invoke('bede:server-start'),
  serverStop:   ()       => ipcRenderer.invoke('bede:server-stop'),
  serverStatus: ()       => ipcRenderer.invoke('bede:server-status'),
  openBrowser:  ()       => ipcRenderer.invoke('bede:open-browser'),
  onStatusChange: (fn: (status: string, error: string) => void) => {
    const wrapped = (_: unknown, status: string, error: string) => fn(status, error)
    ipcRenderer.on('bede:status', wrapped)
    return () => ipcRenderer.removeListener('bede:status', wrapped)
  },
})
