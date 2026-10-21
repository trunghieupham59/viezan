import { contextBridge, ipcRenderer } from 'electron'
import type { UpdatePopupApi } from '../shared/updateNotification'

const api: UpdatePopupApi = {
  getSnapshot: () => ipcRenderer.invoke('update-popup:snapshot'),
  act: (action) => ipcRenderer.invoke('update-popup:act', action),
  onSnapshot: (callback) => {
    const listener = (_event: unknown, snapshot: Parameters<typeof callback>[0]) => callback(snapshot)
    ipcRenderer.on('update-popup:snapshot', listener)
    return () => ipcRenderer.removeListener('update-popup:snapshot', listener)
  },
}
contextBridge.exposeInMainWorld('updatePopup', api)
