import * as fs from 'node:fs'
import * as path from 'node:path'
import { app, safeStorage } from 'electron'

const STORAGE_FILE_NAME = 'secure-storage.bin'
const STORAGE_KEY_PREFIX = 'file-encryption:'
const MAX_STORAGE_BYTES = 8 * 1024 * 1024

type StorageDocument = Record<string, unknown>

function storagePath(): string {
  return path.join(app.getPath('userData'), STORAGE_FILE_NAME)
}

function backupStoragePath(): string {
  return `${storagePath()}.bak`
}

function assertStorageKey(key: unknown): asserts key is string {
  if (typeof key !== 'string'
    || !key.startsWith(STORAGE_KEY_PREFIX)
    || key.length > 200
    || !/^[a-zA-Z0-9:_-]+$/.test(key)) {
    throw new Error('安全存储键无效')
  }
}

function assertEncryptionAvailable(): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('当前系统无法提供安全存储，密码和私钥不会被保存')
  }
}

function readDocument(): StorageDocument {
  assertEncryptionAvailable()
  const filePath = storagePath()
  const backupPath = backupStoragePath()
  if (!fs.existsSync(filePath) && fs.existsSync(backupPath)) {
    fs.renameSync(backupPath, filePath)
  }
  if (!fs.existsSync(filePath)) return {}

  const stat = fs.statSync(filePath)
  if (!stat.isFile() || stat.size > MAX_STORAGE_BYTES) throw new Error('安全存储文件无效')

  try {
    const encrypted = fs.readFileSync(filePath)
    const parsed: unknown = JSON.parse(safeStorage.decryptString(encrypted))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('安全存储内容无效')
    }
    return parsed as StorageDocument
  } catch {
    throw new Error('安全存储已损坏或无法解密')
  }
}

function writeDocument(document: StorageDocument): void {
  assertEncryptionAvailable()
  const filePath = storagePath()
  const directory = path.dirname(filePath)
  const temporaryPath = `${filePath}.tmp`
  const backupPath = backupStoragePath()
  const encrypted = safeStorage.encryptString(JSON.stringify(document))

  fs.mkdirSync(directory, { recursive: true })
  fs.writeFileSync(temporaryPath, encrypted, { mode: 0o600 })
  try {
    if (fs.existsSync(backupPath)) fs.unlinkSync(backupPath)
    if (fs.existsSync(filePath)) fs.renameSync(filePath, backupPath)
    fs.renameSync(temporaryPath, filePath)
    if (fs.existsSync(backupPath)) fs.unlinkSync(backupPath)
  } catch (error) {
    if (!fs.existsSync(filePath) && fs.existsSync(backupPath)) {
      fs.renameSync(backupPath, filePath)
    }
    if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath)
    throw error
  }
}

export function getSecureValue(key: unknown): unknown {
  assertStorageKey(key)
  return readDocument()[key]
}

export function setSecureValue(key: unknown, value: unknown): void {
  assertStorageKey(key)
  if (value === undefined) throw new Error('安全存储值无效')
  const document = readDocument()
  document[key] = value
  writeDocument(document)
}

export function removeSecureValue(key: unknown): void {
  assertStorageKey(key)
  const document = readDocument()
  if (!Object.prototype.hasOwnProperty.call(document, key)) return
  delete document[key]
  if (Object.keys(document).length === 0) {
    const filePath = storagePath()
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
    return
  }
  writeDocument(document)
}
