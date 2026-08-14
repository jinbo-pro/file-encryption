import { ipcRenderer } from 'electron'
import { ELECTRON_IPC, type IpcResult } from '../../shared/electron-ipc'
import { setHostAdapter, type OpenDialogOptions, type SaveDialogOptions } from '../../preload/host'
import { services } from '../../preload/services'

function sendSync<T>(channel: string, ...args: unknown[]): T {
  const result = ipcRenderer.sendSync(channel, ...args) as IpcResult<T>
  if (!result || typeof result !== 'object') throw new Error('Electron 主进程返回了无效结果')
  if (!result.ok) throw new Error(result.error)
  return result.value
}

setHostAdapter({
  openDialog(options: OpenDialogOptions) {
    return sendSync<string[] | undefined>(ELECTRON_IPC.openDialog, options)
  },
  saveDialog(options: SaveDialogOptions) {
    return sendSync<string | undefined>(ELECTRON_IPC.saveDialog, options)
  },
  showItemInFolder(filePath: string) {
    sendSync<void>(ELECTRON_IPC.showItemInFolder, filePath)
  },
  storage: {
    getItem(key) {
      return sendSync<unknown>(ELECTRON_IPC.storageGet, key)
    },
    setItem(key, value) {
      sendSync<void>(ELECTRON_IPC.storageSet, key, value)
    },
    removeItem(key) {
      sendSync<void>(ELECTRON_IPC.storageRemove, key)
    },
  },
})

Object.defineProperties(window, {
  services: {
    value: Object.freeze(services),
    configurable: false,
    enumerable: true,
    writable: false,
  },
  runtime: {
    value: 'electron',
    configurable: false,
    enumerable: true,
    writable: false,
  },
})
