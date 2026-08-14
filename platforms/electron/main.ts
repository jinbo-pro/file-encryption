import * as path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { app, BrowserWindow, Menu, shell } from 'electron'
import { registerIpcHandlers } from './ipc'

const currentDirectory = path.dirname(fileURLToPath(import.meta.url))
const developmentUrl = process.env.ELECTRON_RENDERER_URL
const developmentOrigin = developmentUrl ? new URL(developmentUrl).origin : undefined
const productionPage = path.join(currentDirectory, '../renderer/index.html')
const productionUrl = pathToFileURL(productionPage).href

function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1120,
    height: 760,
    minWidth: 860,
    minHeight: 600,
    show: false,
    title: '文件安全工具',
    webPreferences: {
      preload: path.join(currentDirectory, '../preload/index.cjs'),
      contextIsolation: false,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: false,
    },
  })

  mainWindow.once('ready-to-show', () => mainWindow.show())
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowed = developmentOrigin ? new URL(url).origin === developmentOrigin : url === productionUrl
    if (!allowed) event.preventDefault()
  })

  if (developmentUrl) void mainWindow.loadURL(developmentUrl)
  else void mainWindow.loadFile(productionPage)
  return mainWindow
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null)
  registerIpcHandlers()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
