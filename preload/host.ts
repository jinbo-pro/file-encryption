import type { CryptoStorage } from './services/types'

export interface DialogFilter {
  name: string
  extensions: string[]
}

export type OpenDialogProperty =
  | 'openFile'
  | 'openDirectory'
  | 'multiSelections'
  | 'createDirectory'

export interface OpenDialogOptions {
  title: string
  buttonLabel?: string
  defaultPath?: string
  filters?: DialogFilter[]
  properties: OpenDialogProperty[]
}

export interface SaveDialogOptions {
  title: string
  buttonLabel?: string
  defaultPath?: string
  filters?: DialogFilter[]
}

export interface HostAdapter {
  openDialog(options: OpenDialogOptions): string[] | undefined
  saveDialog(options: SaveDialogOptions): string | undefined
  showItemInFolder(filePath: string): void
  storage: CryptoStorage
}

let activeHost: HostAdapter | undefined

function createUtoolsHost(): HostAdapter {
  const utools = window.utools
  if (!utools) throw new Error('当前运行环境不支持系统服务')

  return {
    openDialog: (options) => utools.showOpenDialog(options),
    saveDialog: (options) => utools.showSaveDialog(options),
    showItemInFolder: (filePath) => utools.shellShowItemInFolder(filePath),
    storage: {
      getItem(key) {
        if (!utools.dbCryptoStorage) throw new Error('当前运行环境不支持加密存储')
        return utools.dbCryptoStorage.getItem(key)
      },
      setItem(key, value) {
        if (!utools.dbCryptoStorage) throw new Error('当前运行环境不支持加密存储')
        utools.dbCryptoStorage.setItem(key, value)
      },
      removeItem(key) {
        if (!utools.dbCryptoStorage) throw new Error('当前运行环境不支持加密存储')
        utools.dbCryptoStorage.removeItem(key)
      },
    },
  }
}

export function setHostAdapter(host: HostAdapter): void {
  activeHost = host
}

export function getHostAdapter(): HostAdapter {
  activeHost ??= createUtoolsHost()
  return activeHost
}
