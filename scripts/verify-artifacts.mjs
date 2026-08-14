import * as fs from 'node:fs'
import * as path from 'node:path'

function assertFile(filePath, message) {
  if (!fs.statSync(filePath, { throwIfNoEntry: false })?.isFile()) throw new Error(message)
}

const utoolsDirectory = path.resolve('dist/utools')
const electronDirectory = path.resolve('dist/electron')

assertFile(path.join(utoolsDirectory, 'plugin.json'), 'uTools 产物缺少 plugin.json')
assertFile(path.join(utoolsDirectory, 'preload/index.js'), 'uTools 产物缺少 preload/index.js')
assertFile(path.join(electronDirectory, 'main/index.js'), 'Electron 产物缺少 main/index.js')
assertFile(path.join(electronDirectory, 'preload/index.cjs'), 'Electron 产物缺少 preload/index.cjs')
assertFile(path.join(electronDirectory, 'renderer/index.html'), 'Electron 产物缺少 renderer/index.html')

if (fs.existsSync(path.join(electronDirectory, 'renderer/plugin.json'))) {
  throw new Error('Electron renderer 不应包含 uTools plugin.json')
}

const rendererFiles = []
function collectFiles(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) collectFiles(entryPath)
    else if (/\.(?:html|js|mjs|cjs)$/.test(entry.name)) rendererFiles.push(entryPath)
  }
}
collectFiles(path.join(electronDirectory, 'renderer'))
const rendererSource = rendererFiles.map((filePath) => fs.readFileSync(filePath, 'utf8')).join('\n')
for (const forbidden of ['ipcRenderer', "require('fs')", 'require("fs")']) {
  if (rendererSource.includes(forbidden)) throw new Error(`Electron renderer 暴露了禁止能力：${forbidden}`)
}

console.log('双端构建产物边界检查通过')
