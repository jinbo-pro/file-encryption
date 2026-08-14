import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

globalThis.window = {
  utools: {},
} as Window & typeof globalThis

require('../dist/preload/index.js')

const expectedServices = [
  'encryptFile',
  'decryptFile',
  'changeFilePassword',
  'selectSourceFiles',
  'selectOutputDirectory',
  'getBatchOutputPaths',
  'encryptText',
  'calculateFileHashes',
  'listManagedKeys',
] as const

for (const serviceName of expectedServices) {
  if (typeof window.services?.[serviceName] !== 'function') {
    throw new Error(`preload bundle 缺少服务：${serviceName}`)
  }
}

console.log('preload bundle smoke test passed')
