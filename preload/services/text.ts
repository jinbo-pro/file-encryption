/**
 * 文本文件读写与文本加解密服务。
 */

import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { getHostAdapter } from '../host'
import { aesGcmBufferEncrypt, aesGcmBufferDecrypt } from '../utils'
import { assertPassword, assertEncryptionOptions } from './validation'
import { fileInfo } from './paths'
import type {
  DecryptTextOptions,
  EncryptTextOptions,
  SaveTextResultOptions,
  TextCryptoResult,
  TextFileInfo,
} from './types'

/**
 * @param {crypto.BinaryLike} data 待摘要数据。
 * @returns {string} 小写十六进制 MD5。
 */
function md5Hex(data: string | NodeJS.ArrayBufferView) {
  return crypto.createHash('md5').update(data).digest('hex')
}

/**
 * 读取 UTF-8 TXT 文件，并移除可选 BOM。
 *
 * @param {string} filePath TXT 文件路径。
 */
function readTextFile(filePath: string): TextFileInfo {
  const info = fileInfo(filePath)
  if (path.extname(info.path).toLowerCase() !== '.txt') {
    throw new Error('仅支持上传 TXT 文件')
  }

  return {
    ...info,
    text: fs.readFileSync(info.path, 'utf8').replace(/^\uFEFF/, ''),
  }
}

/**
 * 打开保存对话框并将文本以 UTF-8 写入 TXT 文件。
 *
 * @returns {string|null} 实际输出绝对路径；用户取消时返回 null。
 */
function saveTextResult(options: SaveTextResultOptions): string | null {
  const { text, defaultName = 'text-result.txt' } = options || {}
  if (typeof text !== 'string') throw new Error('保存内容无效')

  const safeDefaultName = path.basename(defaultName)
  const fileName = path.extname(safeDefaultName).toLowerCase() === '.txt'
    ? safeDefaultName
    : `${safeDefaultName}.txt`
  const selectedPath = getHostAdapter().saveDialog({
    title: '保存文本结果',
    buttonLabel: '保存',
    defaultPath: fileName,
    filters: [{ name: '文本文件', extensions: ['txt'] }],
  })
  if (!selectedPath) return null

  const outputPath = path.extname(selectedPath).toLowerCase() === '.txt'
    ? path.resolve(selectedPath)
    : path.resolve(`${selectedPath}.txt`)
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, text, 'utf8')
  return outputPath
}

/**
 * 将 UTF-8 文本按文件协议加密并编码为 Base64。
 *
 */
function encryptText(options: EncryptTextOptions): TextCryptoResult {
  const {
    text,
    password,
    compressionType = 2,
    encryptionType = 0,
    scryptProfile = 0,
  } = options || {}

  assertPassword(password)
  if (typeof text !== 'string') throw new Error('请输入要加密的文本')
  assertEncryptionOptions(compressionType, encryptionType, scryptProfile)

  try {
    const source = Buffer.from(text, 'utf8')
    const encrypted = aesGcmBufferEncrypt(
      source,
      password,
      compressionType,
      encryptionType,
      scryptProfile,
    )
    return {
      text: encrypted.toString('base64'),
      sourceSize: source.length,
      outputSize: encrypted.length,
      plaintextMd5: md5Hex(source),
      compressionType,
      encryptionType,
      scryptProfile,
    }
  } catch (error) {
    throw new Error(`文本加密失败：${error.message}`)
  }
}

/**
 * 解码 Base64，按密文配置解密并返回 UTF-8 明文。
 *
 */
function decryptText(options: DecryptTextOptions): TextCryptoResult {
  const { text, password } = options || {}
  assertPassword(password)
  if (typeof text !== 'string' || text.trim() === '') throw new Error('请输入 Base64 密文')

  const base64 = text.replace(/\s/g, '')
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64) || base64.length % 4 !== 0) {
    throw new Error('密文不是有效的 Base64')
  }

  try {
    const encrypted = Buffer.from(base64, 'base64')
    if (encrypted.toString('base64') !== base64) throw new Error('密文不是有效的 Base64')
    const result = aesGcmBufferDecrypt(encrypted, password)
    return {
      text: result.data.toString('utf8'),
      sourceSize: encrypted.length,
      outputSize: result.data.length,
      plaintextMd5: md5Hex(result.data),
      compressionType: result.compressionType,
      encryptionType: result.encryptionType,
      scryptProfile: result.scryptProfile,
    }
  } catch (error) {
    if (error.message === '密文不是有效的 Base64') throw error
    throw new Error('文本解密失败，请检查密码或密文是否正确')
  }
}

export { readTextFile, saveTextResult, encryptText, decryptText }
