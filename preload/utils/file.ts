/**
 * 流式文件加解密入口。
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { CONFIG_LENGTH_OFFSET, CONFIG_LENGTH_SIZE, MAGIC_SIZE } from '../config'
import {
  assertFileMagic,
  getVersionedConfigSize,
  decodeEncryptedHeader,
} from './protocol'
import {
  createEncryptionContext,
  unwrapEncryptionContext,
  createPublicKeyEncryptionContext,
  unwrapPublicKeyEncryptionContext,
  rewrapEncryptionHeader,
  createChunkEncryptStream,
  createChunkDecryptStream,
} from './crypto'
import {
  createCompressionStream,
  createDecompressionStream,
} from './compression'
import { reportProgress, createProgressStream } from './progress'
import type { CompressionType, ProgressCallback, ScryptProfile } from '../../shared/preload-api'
import type {
  CryptoContext,
  EncryptedHeader,
  FileCryptoMetadata,
  PasswordCryptoMetadata,
} from './types'

function writeBufferAt(descriptor: number, buffer: Buffer, position = 0) {
  let offset = 0
  while (offset < buffer.length) {
    const bytesWritten = fs.writeSync(
      descriptor,
      buffer,
      offset,
      buffer.length - offset,
      position + offset,
    )
    if (bytesWritten <= 0) throw new Error('加密文件头写入不完整')
    offset += bytesWritten
  }
}

/**
 * 读取并解析加密文件头。魔数不匹配、版本不支持或头部不完整时直接失败。
 *
 * @param {string} encryptedPath 加密文件路径。
 */
function readEncryptedFileHeader(encryptedPath: string): EncryptedHeader {
  const descriptor = fs.openSync(encryptedPath, 'r')
  try {
    const prefixSize = MAGIC_SIZE + CONFIG_LENGTH_OFFSET + CONFIG_LENGTH_SIZE
    const protocolPrefix = Buffer.alloc(prefixSize)
    const prefixBytesRead = fs.readSync(descriptor, protocolPrefix, 0, prefixSize, 0)
    if (prefixBytesRead !== prefixSize) throw new Error('加密文件头不完整')

    assertFileMagic(protocolPrefix)
    const configSize = getVersionedConfigSize(protocolPrefix.subarray(MAGIC_SIZE))
    const headerSize = MAGIC_SIZE + configSize
    const header = Buffer.alloc(headerSize)
    const headerBytesRead = fs.readSync(descriptor, header, 0, headerSize, 0)
    if (headerBytesRead !== headerSize) throw new Error('加密文件头不完整')
    return decodeEncryptedHeader(header)
  } finally {
    fs.closeSync(descriptor)
  }
}

/**
 * 只替换加密文件的密钥包装头部，不读取或重写 payload。
 *
 * @param {string} encryptedPath 加密文件路径。
 * @param {string} currentPassword 当前密码。
 * @param {string} newPassword 新密码。
 * @param {0|1|2} scryptProfile 新 scrypt 档位。
 */
function changeEncryptedFilePassword(
  encryptedPath: string,
  currentPassword: string,
  newPassword: string,
  scryptProfile: ScryptProfile,
): PasswordCryptoMetadata {
  const parsedHeader = readEncryptedFileHeader(encryptedPath)
  const newHeader = rewrapEncryptionHeader(
    parsedHeader.authenticatedConfig,
    currentPassword,
    newPassword,
    scryptProfile,
  )
  if (newHeader.length !== parsedHeader.headerSize) {
    throw new Error('修改后的加密文件头长度无效')
  }

  const descriptor = fs.openSync(encryptedPath, 'r+')
  try {
    writeBufferAt(descriptor, newHeader)
    fs.fsyncSync(descriptor)
  } catch (error) {
    try {
      writeBufferAt(descriptor, parsedHeader.authenticatedConfig)
      fs.fsyncSync(descriptor)
    } catch {
      // 恢复失败时保留原始写入错误。
    }
    throw error
  } finally {
    fs.closeSync(descriptor)
  }

  return {
    compressionType: parsedHeader.decodedConfig.compressionType,
    encryptionType: 0,
    scryptProfile,
  }
}

/**
 * 以流式管线压缩并分块认证加密文件，避免将整个文件载入内存。
 *
 * @param {string} srcPath 明文源文件路径。
 * @param {string} destPath 加密文件输出路径。
 * @param {string} password 用户密码。
 * @param {0|1|2} [compressionType=2] 压缩方式编号。
 * @param {0} [encryptionType=0] 加密方式编号。
 * @param {0|1|2} [scryptProfile=0] scrypt 档位编号。
 * @param {(percentage: number) => void} [onProgress] 进度回调。
 * @returns {Promise<void>}
 */
async function aesGcmFileEncrypt(
  srcPath: string,
  destPath: string,
  password: string,
  compressionType: CompressionType = 2,
  encryptionType: 0 = 0,
  scryptProfile: ScryptProfile = 0,
  onProgress?: ProgressCallback,
  signal?: AbortSignal,
) {
  throwIfAborted(signal)
  const context = createEncryptionContext(
    password,
    compressionType,
    encryptionType,
    scryptProfile,
    path.extname(srcPath),
  )
  return encryptFileWithContext(srcPath, destPath, context, compressionType, onProgress, signal)
}

async function x25519FileEncrypt(
  srcPath: string,
  destPath: string,
  publicKeyPem: string,
  compressionType: CompressionType = 2,
  onProgress?: ProgressCallback,
  signal?: AbortSignal,
) {
  throwIfAborted(signal)
  const context = createPublicKeyEncryptionContext(
    publicKeyPem,
    compressionType,
    0,
    path.extname(srcPath),
  )
  return encryptFileWithContext(srcPath, destPath, context, compressionType, onProgress, signal)
}

function throwIfAborted(signal?: AbortSignal) {
  if (!signal?.aborted) return
  const error = new Error('操作已取消')
  error.name = 'AbortError'
  throw error
}

async function encryptFileWithContext(
  srcPath: string,
  destPath: string,
  context: CryptoContext,
  compressionType: CompressionType,
  onProgress?: ProgressCallback,
  signal?: AbortSignal,
) {
  throwIfAborted(signal)
  const writeStream = fs.createWriteStream(destPath)
  writeStream.write(context.authenticatedConfig)

  const streams: Array<NodeJS.ReadableStream | NodeJS.WritableStream> = [fs.createReadStream(srcPath)]
  if (typeof onProgress === 'function') {
    streams.push(createProgressStream(fs.statSync(srcPath).size, onProgress))
  }
  const compressor = createCompressionStream(compressionType)
  if (compressor) streams.push(compressor)
  streams.push(createChunkEncryptStream(context), writeStream)

  try {
    await pipeline(streams, { signal })
    reportProgress(onProgress, 100)
  } finally {
    context.payloadKey.fill(0)
  }
}

/**
 * 读取并校验文件头，然后流式解密和解压文件。
 *
 * @param {string} encryptedPath 加密文件路径。
 * @param {string} outPath 明文输出路径。
 * @param {string} password 用户密码。
 * @param {(percentage: number) => void} [onProgress] 进度回调。
 * @returns {Promise<{compressionType: 0|1|2, encryptionType: 0|1, scryptProfile: 0|1|2}>}
 * @throws {Error} 密码错误、认证失败、文件头损坏或解压失败。
 */
async function aesGcmFileDecrypt(
  encryptedPath: string,
  outPath: string,
  password: string,
  onProgress?: ProgressCallback,
  signal?: AbortSignal,
) {
  throwIfAborted(signal)
  const parsedHeader = readEncryptedFileHeader(encryptedPath)
  const context = unwrapEncryptionContext(parsedHeader.authenticatedConfig, password)
  return decryptFileWithContext(encryptedPath, outPath, parsedHeader.headerSize, context, onProgress, signal)
}

async function x25519FileDecrypt(
  encryptedPath: string,
  outPath: string,
  privateKeyPem: string,
  passphrase = '',
  onProgress?: ProgressCallback,
  signal?: AbortSignal,
) {
  throwIfAborted(signal)
  const parsedHeader = readEncryptedFileHeader(encryptedPath)
  const context = unwrapPublicKeyEncryptionContext(
    parsedHeader.authenticatedConfig,
    privateKeyPem,
    passphrase,
  )
  return decryptFileWithContext(encryptedPath, outPath, parsedHeader.headerSize, context, onProgress, signal)
}

async function decryptFileWithContext(
  encryptedPath: string,
  outPath: string,
  headerSize: number,
  context: CryptoContext,
  onProgress?: ProgressCallback,
  signal?: AbortSignal,
): Promise<FileCryptoMetadata> {
  throwIfAborted(signal)
  const streams: Array<NodeJS.ReadableStream | NodeJS.WritableStream> = [
    fs.createReadStream(encryptedPath, { start: headerSize }),
  ]
  if (typeof onProgress === 'function') {
    const encryptedSize = fs.statSync(encryptedPath).size - headerSize
    streams.push(createProgressStream(encryptedSize, onProgress))
  }
  streams.push(createChunkDecryptStream(context))
  const decompressor = createDecompressionStream(context.decodedConfig.compressionType)
  if (decompressor) streams.push(decompressor)
  streams.push(fs.createWriteStream(outPath))

  try {
    await pipeline(streams, { signal })
    reportProgress(onProgress, 100)
  } finally {
    context.payloadKey.fill(0)
  }

  return {
    compressionType: context.decodedConfig.compressionType,
    encryptionType: context.decodedConfig.encryptionType,
    scryptProfile: context.decodedConfig.scryptProfile,
  }
}

export {
  aesGcmFileEncrypt,
  aesGcmFileDecrypt,
  x25519FileEncrypt,
  x25519FileDecrypt,
  readEncryptedFileHeader,
  changeEncryptedFilePassword,
}
