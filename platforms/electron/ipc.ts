import * as path from 'node:path'
import {
  BrowserWindow,
  dialog,
  ipcMain,
  shell,
  type IpcMainEvent,
  type OpenDialogSyncOptions,
  type SaveDialogSyncOptions,
} from 'electron'
import { ELECTRON_IPC, type IpcResult } from '../../shared/electron-ipc'
import type { OpenDialogOptions, SaveDialogOptions } from '../../preload/host'
import { getSecureValue, removeSecureValue, setSecureValue } from './storage'

const OPEN_PROPERTIES = new Set(['openFile', 'openDirectory', 'multiSelections', 'createDirectory'])

function reply<T>(event: IpcMainEvent, operation: () => T): void {
  try {
    event.returnValue = { ok: true, value: operation() } satisfies IpcResult<T>
  } catch (error) {
    event.returnValue = {
      ok: false,
      error: error instanceof Error ? error.message : 'Electron 系统调用失败',
    } satisfies IpcResult<T>
  }
}

function assertTrustedSender(event: IpcMainEvent): BrowserWindow {
  const owner = BrowserWindow.fromWebContents(event.sender)
  if (!owner || owner.isDestroyed()) throw new Error('调用窗口无效')
  const senderFrame = event.senderFrame
  if (!senderFrame || senderFrame !== event.sender.mainFrame) throw new Error('只允许应用主页面调用系统服务')
  const senderUrl = senderFrame.url
  const isDevelopmentPage = senderUrl.startsWith('http://localhost:5173/')
  const isProductionPage = senderUrl.startsWith('file:')
    && new URL(senderUrl).pathname.endsWith('/dist/electron/renderer/index.html')
  if (!isDevelopmentPage && !isProductionPage) {
    throw new Error('拒绝来自非应用页面的系统调用')
  }
  return owner
}

function normalizeFilters(filters: unknown): Electron.FileFilter[] | undefined {
  if (filters === undefined) return undefined
  if (!Array.isArray(filters) || filters.length > 20) throw new Error('文件过滤器无效')
  return filters.map((filter) => {
    if (!filter || typeof filter !== 'object') throw new Error('文件过滤器无效')
    const { name, extensions } = filter as Record<string, unknown>
    if (typeof name !== 'string' || !name || name.length > 100
      || !Array.isArray(extensions) || extensions.length === 0 || extensions.length > 20
      || extensions.some((extension) => typeof extension !== 'string'
        || !extension || extension.length > 20 || /[\\/\0]/.test(extension))) {
      throw new Error('文件过滤器无效')
    }
    return { name, extensions: extensions as string[] }
  })
}

function normalizeCommonOptions(options: unknown) {
  if (!options || typeof options !== 'object') throw new Error('对话框参数无效')
  const value = options as Record<string, unknown>
  if (typeof value.title !== 'string' || !value.title || value.title.length > 200) {
    throw new Error('对话框标题无效')
  }
  if (value.buttonLabel !== undefined
    && (typeof value.buttonLabel !== 'string' || value.buttonLabel.length > 50)) {
    throw new Error('对话框按钮文字无效')
  }
  if (value.defaultPath !== undefined && typeof value.defaultPath !== 'string') {
    throw new Error('默认路径无效')
  }
  return {
    title: value.title,
    buttonLabel: value.buttonLabel as string | undefined,
    defaultPath: value.defaultPath as string | undefined,
    filters: normalizeFilters(value.filters),
  }
}

function normalizeOpenOptions(options: unknown): OpenDialogSyncOptions {
  const value = options as OpenDialogOptions
  const common = normalizeCommonOptions(options)
  if (!Array.isArray(value.properties) || value.properties.length === 0
    || value.properties.some((property) => !OPEN_PROPERTIES.has(property))) {
    throw new Error('文件选择属性无效')
  }
  return { ...common, properties: value.properties }
}

function normalizeSaveOptions(options: unknown): SaveDialogSyncOptions {
  return normalizeCommonOptions(options as SaveDialogOptions)
}

export function registerIpcHandlers(): void {
  ipcMain.on(ELECTRON_IPC.openDialog, (event, options) => reply(event, () => {
    const owner = assertTrustedSender(event)
    return dialog.showOpenDialogSync(owner, normalizeOpenOptions(options))
  }))

  ipcMain.on(ELECTRON_IPC.saveDialog, (event, options) => reply(event, () => {
    const owner = assertTrustedSender(event)
    return dialog.showSaveDialogSync(owner, normalizeSaveOptions(options))
  }))

  ipcMain.on(ELECTRON_IPC.showItemInFolder, (event, filePath) => reply(event, () => {
    assertTrustedSender(event)
    if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) throw new Error('文件路径无效')
    shell.showItemInFolder(path.resolve(filePath))
  }))

  ipcMain.on(ELECTRON_IPC.storageGet, (event, key) => reply(event, () => {
    assertTrustedSender(event)
    return getSecureValue(key)
  }))

  ipcMain.on(ELECTRON_IPC.storageSet, (event, key, value) => reply(event, () => {
    assertTrustedSender(event)
    setSecureValue(key, value)
  }))

  ipcMain.on(ELECTRON_IPC.storageRemove, (event, key) => reply(event, () => {
    assertTrustedSender(event)
    removeSecureValue(key)
  }))
}
