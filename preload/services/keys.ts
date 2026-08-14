/**
 * X25519 本机身份和联系人公钥的加密存储与管理。
 */

import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { getHostAdapter } from '../host'
import {
  inspectPublicKey as inspectX25519PublicKey,
  createManagedKeyPair,
  normalizeManagedPrivateKey,
} from '../utils/asymmetric'
import type {
  ExportManagedKeyOptions,
  GenerateManagedKeyOptions,
  IdentityKeyRecord,
  ImportManagedPrivateKeyOptions,
  ImportManagedPublicKeyOptions,
  KeyMaterial,
  KeyRecord,
  ManagedKeyKind,
  ManagedKeySummary,
  PublicKeyInfo,
} from './types'

const KEYRING_STORAGE_KEY = 'file-encryption:x25519-keyring:v1'

function keyStorage() {
  return getHostAdapter().storage
}

function normalizeName(name: unknown): string {
  if (typeof name !== 'string') throw new Error('请输入密钥名称')
  const normalized = name.trim()
  if (!normalized) throw new Error('请输入密钥名称')
  if (normalized.length > 50) throw new Error('密钥名称不能超过 50 个字符')
  return normalized
}

function assertStoragePassphrase(passphrase: unknown): asserts passphrase is string {
  if (typeof passphrase !== 'string' || passphrase.length < 8) {
    throw new Error('私钥保护密码至少需要 8 个字符')
  }
  if (passphrase.length > 1024) throw new Error('私钥保护密码过长')
}

function isValidRecord(value: unknown): value is KeyRecord {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return typeof record.id === 'string'
    && (record.kind === 'identity' || record.kind === 'contact')
    && typeof record.name === 'string'
    && record.name !== ''
    && typeof record.fingerprint === 'string'
    && /^[a-f0-9]{64}$/.test(record.fingerprint)
    && typeof record.publicKeyPem === 'string'
    && record.publicKeyPem.includes('-----BEGIN PUBLIC KEY-----')
    && typeof record.createdAt === 'string'
    && !Number.isNaN(Date.parse(record.createdAt))
    && (record.kind !== 'identity'
      || (typeof record.privateKeyPem === 'string'
        && record.privateKeyPem.includes('-----BEGIN ENCRYPTED PRIVATE KEY-----')))
}

function readKeyring(): KeyRecord[] {
  const records: unknown = keyStorage().getItem(KEYRING_STORAGE_KEY)
  if (!Array.isArray(records)) return []
  return records.filter(isValidRecord)
}

function writeKeyring(records: KeyRecord[]): void {
  if (records.length) keyStorage().setItem(KEYRING_STORAGE_KEY, records)
  else keyStorage().removeItem(KEYRING_STORAGE_KEY)
}

function toSummary(record: KeyRecord): ManagedKeySummary {
  return {
    id: record.id,
    kind: record.kind,
    name: record.name,
    algorithm: 'X25519' as const,
    fingerprint: record.fingerprint,
    formattedFingerprint: record.fingerprint.match(/.{1,4}/g)?.join(' ') ?? record.fingerprint,
    createdAt: record.createdAt,
  }
}

function listManagedKeys(): ManagedKeySummary[] {
  return readKeyring()
    .map(toSummary)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

function assertUnique(records: KeyRecord[], kind: ManagedKeyKind, fingerprint: string) {
  if (records.some((record) => record.kind === kind && record.fingerprint === fingerprint)) {
    throw new Error(kind === 'identity' ? '该私钥已存在' : '该联系人公钥已存在')
  }
}

function createRecord(kind: ManagedKeyKind, name: unknown, material: KeyMaterial): KeyRecord {
  const base = {
    id: `${Date.now()}-${crypto.randomBytes(8).toString('hex')}`,
    name: normalizeName(name),
    publicKeyPem: material.publicKeyPem,
    fingerprint: material.fingerprint,
    createdAt: new Date().toISOString(),
  }
  if (kind === 'identity') {
    if (!material.privateKeyPem) throw new Error('身份记录缺少私钥')
    return { ...base, kind, privateKeyPem: material.privateKeyPem }
  }
  return { ...base, kind }
}

function generateManagedKey(options: GenerateManagedKeyOptions): ManagedKeySummary {
  const { name, passphrase } = options || {}
  assertStoragePassphrase(passphrase)
  const material = createManagedKeyPair(passphrase)
  const records = readKeyring()
  assertUnique(records, 'identity', material.fingerprint)
  const record = createRecord('identity', name, material)
  writeKeyring([record, ...records])
  return toSummary(record)
}

function importManagedPrivateKey(options: ImportManagedPrivateKeyOptions): ManagedKeySummary {
  const {
    name,
    privateKeyPem,
    currentPassphrase = '',
    storagePassphrase,
  } = options || {}
  assertStoragePassphrase(storagePassphrase)
  const material = normalizeManagedPrivateKey(
    privateKeyPem,
    currentPassphrase,
    storagePassphrase,
  )
  const records = readKeyring()
  assertUnique(records, 'identity', material.fingerprint)
  const record = createRecord('identity', name, material)
  writeKeyring([record, ...records])
  return toSummary(record)
}

function importManagedPublicKey(options: ImportManagedPublicKeyOptions): ManagedKeySummary {
  const { name, publicKeyPem } = options || {}
  const inspected = inspectX25519PublicKey(publicKeyPem)
  const records = readKeyring()
  assertUnique(records, 'contact', inspected.fingerprint)
  const record = createRecord('contact', name, {
    publicKeyPem: publicKeyPem.trim(),
    fingerprint: inspected.fingerprint,
  })
  writeKeyring([record, ...records])
  return toSummary(record)
}

function findKey(id: string): KeyRecord {
  if (typeof id !== 'string' || !id) throw new Error('密钥编号无效')
  const record = readKeyring().find((item) => item.id === id)
  if (!record) throw new Error('密钥不存在或已删除')
  return record
}

function renameManagedKey(id: string, name: string): ManagedKeySummary {
  const records = readKeyring()
  const record = records.find((item) => item.id === id)
  if (!record) throw new Error('密钥不存在或已删除')
  record.name = normalizeName(name)
  writeKeyring(records)
  return toSummary(record)
}

function getManagedPublicKey(id: string): string {
  return findKey(id).publicKeyPem
}

function resolveManagedPrivateKey(id: string): string {
  const record = findKey(id)
  if (record.kind !== 'identity') throw new Error('所选记录不包含私钥')
  return record.privateKeyPem
}

function safeFileName(name: string) {
  const normalized = name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim()
  return normalized || 'x25519-key'
}

function exportManagedKey(options: ExportManagedKeyOptions): string | null {
  const { id, keyType = 'public' } = options || {}
  if (!['public', 'private'].includes(keyType)) throw new Error('导出密钥类型无效')
  const record = findKey(id)
  if (keyType === 'private' && record.kind !== 'identity') {
    throw new Error('联系人记录不包含私钥')
  }
  const defaultName = `${safeFileName(record.name)}-${keyType}.pem`
  const selectedPath = getHostAdapter().saveDialog({
    title: keyType === 'private' ? '导出加密私钥' : '导出公钥',
    buttonLabel: '导出',
    defaultPath: defaultName,
    filters: [{ name: 'PEM 密钥文件', extensions: ['pem'] }],
  })
  if (!selectedPath) return null
  const outputPath = path.extname(selectedPath).toLowerCase() === '.pem'
    ? path.resolve(selectedPath)
    : path.resolve(`${selectedPath}.pem`)
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  const contents = keyType === 'private'
    ? (record as IdentityKeyRecord).privateKeyPem
    : record.publicKeyPem
  fs.writeFileSync(
    outputPath,
    contents,
    { encoding: 'utf8', mode: 0o600 },
  )
  return outputPath
}

function deleteManagedKey(id: string): ManagedKeySummary[] {
  const records = readKeyring()
  if (!records.some((record) => record.id === id)) throw new Error('密钥不存在或已删除')
  const remaining = records.filter((record) => record.id !== id)
  writeKeyring(remaining)
  return remaining.map(toSummary)
}

function clearManagedKeys(): void {
  keyStorage().removeItem(KEYRING_STORAGE_KEY)
}

function inspectPublicKey(publicKeyPem: string): PublicKeyInfo {
  return inspectX25519PublicKey(publicKeyPem)
}

export {
  listManagedKeys,
  generateManagedKey,
  importManagedPrivateKey,
  importManagedPublicKey,
  renameManagedKey,
  getManagedPublicKey,
  resolveManagedPrivateKey,
  exportManagedKey,
  deleteManagedKey,
  clearManagedKeys,
  inspectPublicKey,
}
