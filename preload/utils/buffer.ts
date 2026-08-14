/**
 * 内存 Buffer 的加解密入口。
 */

import { MIN_ENCRYPTED_SIZE } from '../config'
import { compressBuffer, decompressBuffer } from './compression'
import { decodeEncryptedHeader } from './protocol'
import {
  createEncryptionContext,
  unwrapEncryptionContext,
  encryptChunkedBuffer,
  decryptChunkedBuffer,
} from './crypto'
import type { CompressionType, ScryptProfile } from '../../shared/preload-api'
import type { DecryptedBufferResult } from './types'

/**
 * 压缩并分块加密内存数据，返回与文件加密相同格式的完整密文。
 *
 * @param {Buffer} data 明文 Buffer。
 * @param {string} password 用户密码。
 * @param {0|1|2} [compressionType=2] 压缩方式编号。
 * @param {0} [encryptionType=0] 加密方式编号。
 * @param {0|1|2} [scryptProfile=0] scrypt 档位编号。
 * @returns {Buffer} 魔数、配置区和连续分块记录。
 */
function aesGcmBufferEncrypt(
  data: Buffer,
  password: string,
  compressionType: CompressionType = 2,
  encryptionType: 0 = 0,
  scryptProfile: ScryptProfile = 0,
) {
  if (!Buffer.isBuffer(data)) throw new Error('data must be a Buffer')

  const context = createEncryptionContext(
    password,
    compressionType,
    encryptionType,
    scryptProfile,
  )
  try {
    const compressed = compressBuffer(data, compressionType)
    return Buffer.concat([
      context.authenticatedConfig,
      encryptChunkedBuffer(compressed, context),
    ])
  } finally {
    context.payloadKey.fill(0)
  }
}

/**
 * 解密并解压内存密文，算法配置完全取自已认证的配置区。
 *
 * @param {Buffer} data 完整密文 Buffer。
 * @param {string} password 用户密码。
 * @throws {Error} 密码错误、数据损坏或协议字段无效。
 */
function aesGcmBufferDecrypt(data: Buffer, password: string): DecryptedBufferResult {
  if (!Buffer.isBuffer(data)) throw new Error('data must be a Buffer')
  if (data.length < MIN_ENCRYPTED_SIZE) throw new Error('加密数据头不完整')

  const header = decodeEncryptedHeader(data)
  const context = unwrapEncryptionContext(header.authenticatedConfig, password)
  try {
    const decrypted = decryptChunkedBuffer(data.subarray(header.headerSize), context)
    return {
      data: decompressBuffer(decrypted, context.decodedConfig.compressionType),
      compressionType: context.decodedConfig.compressionType,
      encryptionType: 0 as const,
      scryptProfile: context.decodedConfig.scryptProfile,
    }
  } finally {
    context.payloadKey.fill(0)
  }
}

export { aesGcmBufferEncrypt, aesGcmBufferDecrypt }
