import type { HostAdapter } from '../preload/host'

globalThis.window = {} as Window & typeof globalThis

const { setHostAdapter } = await import('../preload/host')
const { services } = await import('../preload/services')

const storage = new Map<string, unknown>()
const calls: string[] = []
const host: HostAdapter = {
  openDialog(options) {
    calls.push(`open:${options.title}`)
    return ['C:\\data\\source.txt']
  },
  saveDialog(options) {
    calls.push(`save:${options.title}`)
    return 'C:\\data\\result.txt'
  },
  showItemInFolder(filePath) {
    calls.push(`show:${filePath}`)
  },
  storage: {
    getItem(key) { return storage.get(key) },
    setItem(key, value) { storage.set(key, value) },
    removeItem(key) { storage.delete(key) },
  },
}

setHostAdapter(host)
window.services = services

const record = services.addEncryptionHistory({
  filePath: 'C:\\data\\source.txt',
  outputPath: 'C:\\data\\source.txt.enc',
  password: 'adapter-password',
})
if (!services.getEncryptionHistory().some((item) => item.id === record.id)) {
  throw new Error('宿主存储适配器未被服务使用')
}

services.showItemInFolder('C:\\data\\source.txt.enc')
if (!calls.some((call) => call.startsWith('show:'))) {
  throw new Error('宿主 shell 适配器未被服务使用')
}

const serviceNames = Object.keys(services).sort()
if (serviceNames.length === 0 || !serviceNames.includes('encryptFile')) {
  throw new Error('统一 services 契约无效')
}

console.log('host adapter contract tests passed')
