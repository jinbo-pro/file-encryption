import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const storage = new Map()
let savePath = null

global.window = {
  utools: {
    dbCryptoStorage: {
      getItem(key) { return storage.get(key) },
      setItem(key, value) { storage.set(key, value) },
      removeItem(key) { storage.delete(key) },
    },
    showSaveDialog() { return savePath },
  },
}

const { services } = await import('../preload/services')
window.services = services

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const resultDir = path.join(currentDir, 'result')
fs.mkdirSync(resultDir, { recursive: true })

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function main() {
  const identity = window.services.generateManagedKey({
    name: '本机身份',
    passphrase: 'identity-password',
  })
  assert(identity.kind === 'identity', '生成记录类型错误')
  assert(identity.fingerprint.length === 64, '生成密钥指纹错误')

  const publicKeyPem = window.services.getManagedPublicKey(identity.id)
  assert(publicKeyPem.includes('BEGIN PUBLIC KEY'), '生成公钥格式错误')
  const inspected = window.services.inspectPublicKey(publicKeyPem)
  assert(inspected.fingerprint === identity.fingerprint, '公钥指纹不一致')

  const contact = window.services.importManagedPublicKey({
    name: '联系人',
    publicKeyPem,
  })
  assert(contact.kind === 'contact', '联系人记录类型错误')

  const external = crypto.generateKeyPairSync('x25519')
  const externalPrivatePem = external.privateKey.export({ type: 'pkcs8', format: 'pem' })
  const importedIdentity = window.services.importManagedPrivateKey({
    name: '导入身份',
    privateKeyPem: externalPrivatePem,
    storagePassphrase: 'imported-password',
  })
  assert(importedIdentity.kind === 'identity', '私钥导入失败')

  const renamed = window.services.renameManagedKey(contact.id, '新联系人')
  assert(renamed.name === '新联系人', '密钥重命名失败')

  savePath = path.join(resultDir, 'managed-public.pem')
  window.services.exportManagedKey({ id: identity.id, keyType: 'public' })
  assert(fs.readFileSync(savePath, 'utf8') === publicKeyPem, '公钥导出内容错误')
  savePath = path.join(resultDir, 'managed-private.pem')
  window.services.exportManagedKey({ id: identity.id, keyType: 'private' })
  assert(fs.readFileSync(savePath, 'utf8').includes('BEGIN ENCRYPTED PRIVATE KEY'), '私钥未加密导出')

  const sourcePath = path.join(resultDir, 'managed-key-source.txt')
  const encryptedPath = path.join(resultDir, 'managed-key-source.enc')
  const decryptedPath = path.join(resultDir, 'managed-key-source.decrypted.txt')
  fs.writeFileSync(sourcePath, 'managed key file round trip', 'utf8')
  await window.services.encryptFile({
    sourcePath,
    outputPath: encryptedPath,
    encryptionType: 1,
    publicKeyPem,
    compressionType: 2,
  })
  await window.services.decryptFile({
    sourcePath: encryptedPath,
    outputPath: decryptedPath,
    privateKeyId: identity.id,
    privateKeyPassphrase: 'identity-password',
  })
  assert(fs.readFileSync(decryptedPath, 'utf8') === 'managed key file round trip', '已保存私钥文件解密失败')

  const remaining = window.services.deleteManagedKey(contact.id)
  assert(!remaining.some((item) => item.id === contact.id), '密钥删除失败')
  window.services.clearManagedKeys()
  assert(window.services.listManagedKeys().length === 0, '密钥清空失败')

  console.log('key management tests passed')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
