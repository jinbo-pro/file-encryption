/**
 * 加密历史的安全存储与维护。
 */

import * as crypto from 'node:crypto'
import * as path from 'node:path'
import { getHostAdapter } from '../host'
import type {
  AddEncryptionHistoryOptions,
  EncryptionHistoryRecord,
  StoredHistoryRecord,
} from './types'

const ENCRYPTION_HISTORY_KEY = 'file-encryption:encryption-history'

/**
 * 获取 uTools 加密键值存储。历史中包含密码，不允许降级到明文存储。
 *
 * @throws {Error} 当前运行环境不支持 dbCryptoStorage。
 */
function historyStorage() {
  return getHostAdapter().storage
}

function isStoredHistoryRecord(value: unknown): value is StoredHistoryRecord {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return typeof record.id === 'string'
    && typeof record.filePath === 'string'
    && typeof record.createdAt === 'string'
    && (record.action === undefined || record.action === 'encrypt' || record.action === 'password-change')
    && (record.encryptionType === 1
      ? typeof record.recipientFingerprint === 'string'
        && /^[a-f0-9]{64}$/.test(record.recipientFingerprint)
        && record.action !== 'password-change'
      : typeof record.password === 'string' && record.password !== '')
}

/**
 * 读取、过滤并按时间倒序返回加密历史。
 *
 * @returns {EncryptionHistoryRecord[]} 有效历史记录。
 */
function getEncryptionHistory(): EncryptionHistoryRecord[] {
  const records: unknown = historyStorage().getItem(ENCRYPTION_HISTORY_KEY)
  if (!Array.isArray(records)) return []

  return records
    .filter(isStoredHistoryRecord)
    .map((record): EncryptionHistoryRecord => ({
      ...record,
      action: record.action || 'encrypt',
      encryptionType: record.encryptionType === 1 ? 1 : 0,
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/**
 * 将一次成功的文件加密写入 uTools 加密存储。
 *
 * @returns {EncryptionHistoryRecord} 新增记录。
 */
function addEncryptionHistory(options: AddEncryptionHistoryOptions): EncryptionHistoryRecord {
  const {
    filePath,
    outputPath = '',
    password,
    encryptionType = 0,
    recipientFingerprint = '',
    createdAt = new Date().toISOString(),
    action = 'encrypt',
  } = options || {}
  if (typeof filePath !== 'string' || filePath === '') throw new Error('历史记录文件路径无效')
  if (![0, 1].includes(encryptionType)) throw new Error('历史记录加密方式无效')
  if (encryptionType === 0 && (typeof password !== 'string' || password === '')) {
    throw new Error('历史记录密码无效')
  }
  if (encryptionType === 1 && !/^[a-f0-9]{64}$/.test(recipientFingerprint)) {
    throw new Error('历史记录公钥指纹无效')
  }
  if (action === 'password-change' && encryptionType !== 0) {
    throw new Error('公钥加密记录不能标记为密码修改')
  }
  if (typeof createdAt !== 'string' || Number.isNaN(Date.parse(createdAt))) {
    throw new Error('历史记录时间无效')
  }
  if (!['encrypt', 'password-change'].includes(action)) throw new Error('历史记录类型无效')

  const record: EncryptionHistoryRecord = {
    id: `${Date.now()}-${crypto.randomBytes(6).toString('hex')}`,
    filePath: path.resolve(filePath),
    outputPath: outputPath ? path.resolve(outputPath) : '',
    encryptionType,
    createdAt: new Date(createdAt).toISOString(),
    action,
    ...(encryptionType === 0 ? { password } : { recipientFingerprint }),
  }
  const records = getEncryptionHistory()
  historyStorage().setItem(ENCRYPTION_HISTORY_KEY, [record, ...records])
  return record
}

/**
 * 删除指定加密历史并返回剩余记录。
 *
 * @param {string} id 记录编号。
 * @returns {EncryptionHistoryRecord[]} 删除后的历史记录。
 */
function deleteEncryptionHistory(id: string): EncryptionHistoryRecord[] {
  if (typeof id !== 'string' || id === '') throw new Error('历史记录编号无效')
  const records = getEncryptionHistory().filter((record) => record.id !== id)
  if (records.length) historyStorage().setItem(ENCRYPTION_HISTORY_KEY, records)
  else historyStorage().removeItem(ENCRYPTION_HISTORY_KEY)
  return records
}

/**
 * 清空全部加密历史。
 *
 * @returns {void}
 */
function clearEncryptionHistory() {
  historyStorage().removeItem(ENCRYPTION_HISTORY_KEY)
}

export {
  getEncryptionHistory,
  addEncryptionHistory,
  deleteEncryptionHistory,
  clearEncryptionHistory,
}
