/**
 * 密钥派生、DEK 包装与分块 AEAD 实现。
 */

import * as crypto from 'node:crypto'
import { Transform } from 'node:stream'
import {
  FILE_MAGIC,
  ENCRYPTION_TYPE_OFFSET,
  SCRYPT_PROFILE_OFFSET,
  SALT_OFFSET,
  SALT_SIZE,
  CHUNK_SIZE_OFFSET,
  PAYLOAD_NONCE_PREFIX_OFFSET,
  PAYLOAD_NONCE_PREFIX_SIZE,
  WRAP_IV_OFFSET,
  WRAPPED_DEK_OFFSET,
  WRAP_AUTH_TAG_OFFSET,
  KEY_METADATA_OFFSET,
  PASSWORD_FILE_METADATA_OFFSET,
  PUBLIC_KEY_FILE_METADATA_OFFSET,
  DEK_SIZE,
  IV_SIZE,
  AUTH_TAG_SIZE,
  CHUNK_HEADER_SIZE,
  MAX_CHUNK_INDEX,
  KEY_WRAP_ALGORITHM,
  PAYLOAD_ALGORITHM,
  PAYLOAD_KEY_SIZE,
} from '../config'
import {
  FILE_MAGIC_BUFFER,
  encodeFileConfig,
  assertFileMagic,
  decodeFileConfig,
  createChunkHeader,
  decodeChunkHeader,
} from './protocol'
import {
  deriveX25519Kek,
  createX25519EncryptionMaterial,
  createX25519DecryptionMaterial,
} from './asymmetric'
import type { CompressionType, ScryptProfile } from '../../shared/preload-api'
import type { CryptoContext, DecodedFileConfig } from './types'

const PAYLOAD_KEY_INFO = Buffer.from(`${FILE_MAGIC}/v1/payload-key`, 'ascii')

/**
 * 使用配置区内的 scrypt 档位和 salt 派生 32 字节 KEK。
 *
 * @param {string} password 用户密码。
 * @returns {Buffer} 用于 AES-256-GCM 包装 DEK 的 32 字节 KEK。
 */
function deriveKek(password: string, decodedConfig: DecodedFileConfig) {
  if (decodedConfig.encryptionType !== 0 || !decodedConfig.scryptParams) {
    throw new Error('该加密包不使用密码保护')
  }
  const { scryptParams: params, salt } = decodedConfig
  if (params.dkLen < DEK_SIZE) throw new Error('scrypt dkLen 小于 KEK 长度')
  const N = 2 ** params.logN
  const requiredMemory = 128 * N * params.r + 128 * params.r * params.p
  return crypto.scryptSync(
    Buffer.from(password, 'utf8'),
    salt,
    DEK_SIZE,
    {
      N,
      r: params.r,
      p: params.p,
      maxmem: Math.max(32 * 1024 * 1024, requiredMemory + 2 * 1024 * 1024),
    },
  )
}

/**
 * 生成包装 DEK 时使用的 AAD，不包含 wrapped DEK 与 wrap AuthTag 本身。
 *
 * @param {Buffer} config 完整配置区。
 * @returns {Buffer} 魔数和不可变配置前缀。
 */
function createWrapAad(config: Buffer) {
  return Buffer.concat([
    FILE_MAGIC_BUFFER,
    config.subarray(0, WRAPPED_DEK_OFFSET),
    config.subarray(WRAP_AUTH_TAG_OFFSET + AUTH_TAG_SIZE),
  ])
}

/**
 * 创建只包含不可变 payload 参数的 AAD，使修改密码时可以仅重新包装 DEK。
 * scrypt 档位、salt、wrap IV 和 wrapped DEK 均不属于 payload AAD。
 *
 * @param {Buffer} config 完整配置区。
 * @returns {Buffer} 魔数、版本、压缩/加密方式、分块大小和 nonce 前缀。
 */
function createPayloadAad(config: Buffer) {
  const parts = [
    FILE_MAGIC_BUFFER,
    config.subarray(0, ENCRYPTION_TYPE_OFFSET + 1),
    config.subarray(
      CHUNK_SIZE_OFFSET,
      PAYLOAD_NONCE_PREFIX_OFFSET + PAYLOAD_NONCE_PREFIX_SIZE,
    ),
  ]
  if (config[ENCRYPTION_TYPE_OFFSET] === 1) {
    parts.push(config.subarray(KEY_METADATA_OFFSET, PUBLIC_KEY_FILE_METADATA_OFFSET))
    parts.push(config.subarray(PUBLIC_KEY_FILE_METADATA_OFFSET))
  } else {
    parts.push(config.subarray(PASSWORD_FILE_METADATA_OFFSET))
  }
  return Buffer.concat(parts)
}

/**
 * 由随机 DEK 派生当前 payload 算法所需长度的密钥。
 *
 * @param {Buffer} dek 32 字节随机 DEK。
 * @returns {Buffer} AES-256 payload key。
 */
function derivePayloadKey(dek: Buffer, decodedConfig: DecodedFileConfig) {
  return Buffer.from(crypto.hkdfSync(
    'sha256',
    dek,
    decodedConfig.payloadNoncePrefix,
    PAYLOAD_KEY_INFO,
    PAYLOAD_KEY_SIZE,
  ))
}

function createContext(config: Buffer, dek: Buffer): CryptoContext {
  const decodedConfig = decodeFileConfig(config)
  return {
    config,
    authenticatedConfig: Buffer.concat([FILE_MAGIC_BUFFER, config]),
    payloadAad: createPayloadAad(config),
    decodedConfig,
    payloadKey: derivePayloadKey(dek, decodedConfig),
  }
}

function wrapDek(config: Buffer, dek: Buffer, kek: Buffer) {
  const decodedConfig = decodeFileConfig(config)
  const cipher = crypto.createCipheriv(KEY_WRAP_ALGORITHM, kek, decodedConfig.wrapIv)
  cipher.setAAD(createWrapAad(config))
  const wrappedDek = Buffer.concat([cipher.update(dek), cipher.final()])
  if (wrappedDek.length !== DEK_SIZE) throw new Error('wrapped DEK 长度无效')
  wrappedDek.copy(config, WRAPPED_DEK_OFFSET)
  cipher.getAuthTag().copy(config, WRAP_AUTH_TAG_OFFSET)
}

function unwrapDek(config: Buffer, decodedConfig: DecodedFileConfig, kek: Buffer) {
  const decipher = crypto.createDecipheriv(KEY_WRAP_ALGORITHM, kek, decodedConfig.wrapIv)
  decipher.setAAD(createWrapAad(config))
  decipher.setAuthTag(decodedConfig.wrapAuthTag)
  const dek = Buffer.concat([decipher.update(decodedConfig.wrappedDek), decipher.final()])
  if (dek.length !== DEK_SIZE) throw new Error('DEK 长度无效')
  return dek
}

/**
 * 生成随机 DEK，使用密码派生的 KEK 包装，并返回 payload 加密上下文。
 *
 * @param {string} password 用户密码。
 * @param {0|1|2} compressionType 压缩方式编号。
 * @param {0} encryptionType 密码保护方式编号。
 * @param {0|1|2} scryptProfile scrypt 档位编号。
 */
function createEncryptionContext(
  password: string,
  compressionType: CompressionType,
  encryptionType: 0,
  scryptProfile: ScryptProfile,
  originalExtension = '',
): CryptoContext {
  if (encryptionType !== 0) throw new Error('密码加密的 encryptionType 必须为 0')
  const config = encodeFileConfig(
    compressionType,
    encryptionType,
    scryptProfile,
    {},
    originalExtension,
  )
  const initialConfig = decodeFileConfig(config)
  const dek = crypto.randomBytes(DEK_SIZE)
  const kek = deriveKek(password, initialConfig)

  try {
    wrapDek(config, dek, kek)
    return createContext(config, dek)
  } finally {
    dek.fill(0)
    kek.fill(0)
  }
}

/**
 * 使用密码解包配置区内的 DEK，并派生 payload key。
 *
 * @param {Buffer} authenticatedConfig 魔数与完整配置区。
 * @param {string} password 用户密码。
 */
function unwrapEncryptionContext(authenticatedConfig: Buffer, password: string): CryptoContext {
  assertFileMagic(authenticatedConfig)
  const config = authenticatedConfig.subarray(FILE_MAGIC_BUFFER.length)
  const decodedConfig = decodeFileConfig(config)
  if (decodedConfig.encryptionType !== 0) throw new Error('该加密包需要使用接收方私钥解密')
  const kek = deriveKek(password, decodedConfig)
  let dek

  try {
    dek = unwrapDek(config, decodedConfig, kek)

    return {
      config,
      authenticatedConfig,
      payloadAad: createPayloadAad(config),
      decodedConfig,
      payloadKey: derivePayloadKey(dek, decodedConfig),
    }
  } finally {
    if (dek) dek.fill(0)
    kek.fill(0)
  }
}

function createPublicKeyEncryptionContext(
  publicKeyPem: string,
  compressionType: CompressionType,
  scryptProfile: ScryptProfile = 0,
  originalExtension = '',
): CryptoContext {
  if (scryptProfile !== 0) throw new Error('公钥加密不使用 scrypt 档位')
  const material = createX25519EncryptionMaterial(publicKeyPem)
  let dek: Buffer | undefined
  let kek: Buffer | undefined

  try {
    const config = encodeFileConfig(compressionType, 1, 0, material, originalExtension)
    const decodedConfig = decodeFileConfig(config)
    dek = crypto.randomBytes(DEK_SIZE)
    kek = deriveX25519Kek(
      material.sharedSecret,
      decodedConfig.hkdfSalt,
      decodedConfig.recipientFingerprint,
      decodedConfig.ephemeralPublicKey,
    )
    wrapDek(config, dek, kek)
    return createContext(config, dek)
  } finally {
    if (dek) dek.fill(0)
    if (kek) kek.fill(0)
    material.sharedSecret.fill(0)
  }
}

function unwrapPublicKeyEncryptionContext(
  authenticatedConfig: Buffer,
  privateKeyPem: string,
  passphrase = '',
): CryptoContext {
  assertFileMagic(authenticatedConfig)
  const config = authenticatedConfig.subarray(FILE_MAGIC_BUFFER.length)
  const decodedConfig = decodeFileConfig(config)
  if (decodedConfig.encryptionType !== 1) throw new Error('该加密包需要使用密码解密')
  const sharedSecret = createX25519DecryptionMaterial(
    privateKeyPem,
    passphrase,
    decodedConfig.recipientFingerprint,
    decodedConfig.ephemeralPublicKey,
  )
  const kek = deriveX25519Kek(
    sharedSecret,
    decodedConfig.hkdfSalt,
    decodedConfig.recipientFingerprint,
    decodedConfig.ephemeralPublicKey,
  )
  let dek: Buffer | undefined

  try {
    dek = unwrapDek(config, decodedConfig, kek)
    return {
      config,
      authenticatedConfig,
      payloadAad: createPayloadAad(config),
      decodedConfig,
      payloadKey: derivePayloadKey(dek, decodedConfig),
    }
  } finally {
    if (dek) dek.fill(0)
    kek.fill(0)
    sharedSecret.fill(0)
  }
}

/**
 * 验证旧密码并使用新密码重新包装同一个 DEK。payload 参数保持不变，因而无需
 * 重新加密文件主体。
 *
 * @param {Buffer} authenticatedConfig 魔数与完整配置区。
 * @param {string} currentPassword 当前密码。
 * @param {string} newPassword 新密码。
 * @param {0|1|2} scryptProfile 新密码使用的 scrypt 档位。
 * @returns {Buffer} 可直接替换原文件头的认证配置区。
 */
function rewrapEncryptionHeader(
  authenticatedConfig: Buffer,
  currentPassword: string,
  newPassword: string,
  scryptProfile: ScryptProfile,
) {
  assertFileMagic(authenticatedConfig)
  const currentConfig = authenticatedConfig.subarray(FILE_MAGIC_BUFFER.length)
  const currentDecodedConfig = decodeFileConfig(currentConfig)
  if (currentDecodedConfig.encryptionType !== 0) {
    throw new Error('公钥加密包不支持修改密码')
  }
  const currentKek = deriveKek(currentPassword, currentDecodedConfig)
  let dek: Buffer | undefined
  let newKek: Buffer | undefined

  try {
    try {
      const decipher = crypto.createDecipheriv(
        KEY_WRAP_ALGORITHM,
        currentKek,
        currentDecodedConfig.wrapIv,
      )
      decipher.setAAD(createWrapAad(currentConfig))
      decipher.setAuthTag(currentDecodedConfig.wrapAuthTag)
      dek = Buffer.concat([
        decipher.update(currentDecodedConfig.wrappedDek),
        decipher.final(),
      ])
      if (dek.length !== DEK_SIZE) throw new Error('DEK 长度无效')
    } catch {
      throw new Error('当前密码不正确')
    }

    const newConfig = Buffer.from(currentConfig)
    newConfig[SCRYPT_PROFILE_OFFSET] = scryptProfile
    crypto.randomBytes(SALT_SIZE).copy(newConfig, SALT_OFFSET)
    crypto.randomBytes(IV_SIZE).copy(newConfig, WRAP_IV_OFFSET)
    newConfig.fill(0, WRAPPED_DEK_OFFSET, WRAP_AUTH_TAG_OFFSET + AUTH_TAG_SIZE)

    const newDecodedConfig = decodeFileConfig(newConfig)
    newKek = deriveKek(newPassword, newDecodedConfig)
    const cipher = crypto.createCipheriv(
      KEY_WRAP_ALGORITHM,
      newKek,
      newDecodedConfig.wrapIv,
    )
    cipher.setAAD(createWrapAad(newConfig))
    const wrappedDek = Buffer.concat([cipher.update(dek), cipher.final()])
    if (wrappedDek.length !== DEK_SIZE) throw new Error('wrapped DEK 长度无效')
    wrappedDek.copy(newConfig, WRAPPED_DEK_OFFSET)
    cipher.getAuthTag().copy(newConfig, WRAP_AUTH_TAG_OFFSET)

    return Buffer.concat([FILE_MAGIC_BUFFER, newConfig])
  } finally {
    if (dek) dek.fill(0)
    if (newKek) newKek.fill(0)
    currentKek.fill(0)
  }
}

/**
 * 使用文件级 nonce 前缀与块序号生成唯一 nonce。
 *
 * @param {Buffer} noncePrefix 8 字节文件级随机 nonce 前缀。
 * @param {number} chunkIndex 从 0 开始的块序号。
 * @returns {Buffer} 12 字节 AES-GCM nonce。
 */
function createChunkNonce(noncePrefix: Buffer, chunkIndex: number) {
  if (!Number.isInteger(chunkIndex) || chunkIndex < 0 || chunkIndex > MAX_CHUNK_INDEX) {
    throw new Error('分块序号超出协议限制')
  }
  const nonce = Buffer.alloc(IV_SIZE)
  noncePrefix.copy(nonce, 0)
  nonce.writeUInt32BE(chunkIndex, PAYLOAD_NONCE_PREFIX_SIZE)
  return nonce
}

/**
 * 为分块生成包含配置、块序号与块头的认证附加数据。
 *
 * @param {Buffer} payloadAad 不可变 payload 配置。
 * @param {number} chunkIndex 块序号。
 * @param {Buffer} chunkHeader 当前块头。
 * @returns {Buffer} 块认证附加数据。
 */
function createChunkAad(payloadAad: Buffer, chunkIndex: number, chunkHeader: Buffer) {
  const indexBuffer = Buffer.alloc(4)
  indexBuffer.writeUInt32BE(chunkIndex, 0)
  return Buffer.concat([payloadAad, indexBuffer, chunkHeader])
}

/**
 * 加密一个分块并编码为块头、密文和 AuthTag。
 *
 * @param {Buffer} plaintext 最多一个标准块的明文。
 * @param {number} chunkIndex 块序号。
 * @param {boolean} isFinal 是否最终块。
 * @returns {Buffer} 块头、密文和 AuthTag。
 */
function encryptChunkRecord(
  plaintext: Buffer,
  context: CryptoContext,
  chunkIndex: number,
  isFinal: boolean,
) {
  const { payloadAad, decodedConfig, payloadKey } = context
  if (plaintext.length > decodedConfig.chunkSize) {
    throw new Error('分块数据超过配置大小')
  }
  if (!isFinal && plaintext.length !== decodedConfig.chunkSize) {
    throw new Error('非最终块长度必须等于配置分块大小')
  }

  const chunkHeader = createChunkHeader(plaintext.length, isFinal)
  const cipher = crypto.createCipheriv(
    PAYLOAD_ALGORITHM,
    payloadKey,
    createChunkNonce(decodedConfig.payloadNoncePrefix, chunkIndex),
  )
  cipher.setAAD(createChunkAad(payloadAad, chunkIndex, chunkHeader))
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()])
  return Buffer.concat([chunkHeader, encrypted, cipher.getAuthTag()])
}

/**
 * 认证并解密一个分块记录。
 *
 * @param {Buffer} chunkHeader 当前块头。
 * @param {Buffer} encrypted 当前块密文。
 * @param {Buffer} authTag 当前块认证标签。
 * @param {number} chunkIndex 块序号。
 * @returns {Buffer} 已认证块明文。
 */
function decryptChunkRecord(
  chunkHeader: Buffer,
  encrypted: Buffer,
  authTag: Buffer,
  context: CryptoContext,
  chunkIndex: number,
) {
  const { payloadAad, decodedConfig, payloadKey } = context
  const decipher = crypto.createDecipheriv(
    PAYLOAD_ALGORITHM,
    payloadKey,
    createChunkNonce(decodedConfig.payloadNoncePrefix, chunkIndex),
  )
  decipher.setAAD(createChunkAad(payloadAad, chunkIndex, chunkHeader))
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(encrypted), decipher.final()])
}

/**
 * 将内存 Buffer 编码为一个或多个经过独立认证的块记录。
 *
 * @param {Buffer} data 压缩后的 payload。
 * @returns {Buffer} 连续块记录。
 */
function encryptChunkedBuffer(data: Buffer, context: CryptoContext) {
  const records: Buffer[] = []
  if (data.length === 0) return encryptChunkRecord(data, context, 0, true)

  let chunkIndex = 0
  for (let offset = 0; offset < data.length; offset += context.decodedConfig.chunkSize) {
    const end = Math.min(offset + context.decodedConfig.chunkSize, data.length)
    records.push(encryptChunkRecord(
      data.subarray(offset, end),
      context,
      chunkIndex,
      end === data.length,
    ))
    chunkIndex += 1
  }
  return Buffer.concat(records)
}

/**
 * 解码并认证内存中的连续块记录。
 *
 * @param {Buffer} payload 连续块记录。
 * @returns {Buffer} 压缩态明文。
 */
function decryptChunkedBuffer(payload: Buffer, context: CryptoContext) {
  const chunks: Buffer[] = []
  let offset = 0
  let chunkIndex = 0
  let finalSeen = false

  while (offset < payload.length) {
    if (finalSeen) throw new Error('最终块后存在多余数据')
    if (payload.length - offset < CHUNK_HEADER_SIZE) throw new Error('分块头不完整')

    const chunkHeader = payload.subarray(offset, offset + CHUNK_HEADER_SIZE)
    const { dataLength, isFinal } = decodeChunkHeader(chunkHeader, context.decodedConfig.chunkSize)
    const recordSize = CHUNK_HEADER_SIZE + dataLength + AUTH_TAG_SIZE
    if (payload.length - offset < recordSize) throw new Error('分块数据不完整')

    const encryptedStart = offset + CHUNK_HEADER_SIZE
    const authTagStart = encryptedStart + dataLength
    chunks.push(decryptChunkRecord(
      chunkHeader,
      payload.subarray(encryptedStart, authTagStart),
      payload.subarray(authTagStart, authTagStart + AUTH_TAG_SIZE),
      context,
      chunkIndex,
    ))
    offset += recordSize
    chunkIndex += 1
    finalSeen = isFinal
  }

  if (!finalSeen) throw new Error('缺少最终认证块')
  return Buffer.concat(chunks)
}

/**
 * 创建压缩流之后使用的分块加密 Transform。
 *
 * @returns {Transform} 分块 AEAD 编码流。
 */
function createChunkEncryptStream(context: CryptoContext) {
  let pending = Buffer.alloc(0)
  let chunkIndex = 0
  const { chunkSize } = context.decodedConfig

  return new Transform({
    transform(chunk, encoding, callback) {
      try {
        pending = pending.length ? Buffer.concat([pending, chunk]) : Buffer.from(chunk)
        while (pending.length > chunkSize) {
          this.push(encryptChunkRecord(
            pending.subarray(0, chunkSize),
            context,
            chunkIndex,
            false,
          ))
          chunkIndex += 1
          pending = Buffer.from(pending.subarray(chunkSize))
        }
        callback()
      } catch (error) {
        callback(error)
      }
    },
    flush(callback) {
      try {
        this.push(encryptChunkRecord(pending, context, chunkIndex, true))
        callback()
      } catch (error) {
        callback(error)
      }
    },
  })
}

/**
 * 创建解压流之前使用的分块认证解密 Transform。
 *
 * @returns {Transform} 分块 AEAD 解码流。
 */
function createChunkDecryptStream(context: CryptoContext) {
  let pending = Buffer.alloc(0)
  let chunkIndex = 0
  let finalSeen = false

  return new Transform({
    transform(chunk, encoding, callback) {
      try {
        if (finalSeen) throw new Error('最终块后存在多余数据')
        pending = pending.length ? Buffer.concat([pending, chunk]) : Buffer.from(chunk)

        while (pending.length >= CHUNK_HEADER_SIZE) {
          const chunkHeader = pending.subarray(0, CHUNK_HEADER_SIZE)
          const { dataLength, isFinal } = decodeChunkHeader(
            chunkHeader,
            context.decodedConfig.chunkSize,
          )
          const recordSize = CHUNK_HEADER_SIZE + dataLength + AUTH_TAG_SIZE
          if (pending.length < recordSize) break

          const encryptedStart = CHUNK_HEADER_SIZE
          const authTagStart = encryptedStart + dataLength
          this.push(decryptChunkRecord(
            chunkHeader,
            pending.subarray(encryptedStart, authTagStart),
            pending.subarray(authTagStart, recordSize),
            context,
            chunkIndex,
          ))
          pending = Buffer.from(pending.subarray(recordSize))
          chunkIndex += 1
          finalSeen = isFinal
          if (finalSeen && pending.length) throw new Error('最终块后存在多余数据')
        }
        callback()
      } catch (error) {
        callback(error)
      }
    },
    flush(callback) {
      if (pending.length) return callback(new Error('分块数据不完整'))
      if (!finalSeen) return callback(new Error('缺少最终认证块'))
      callback()
    },
  })
}

export {
  createEncryptionContext,
  unwrapEncryptionContext,
  createPublicKeyEncryptionContext,
  unwrapPublicKeyEncryptionContext,
  rewrapEncryptionHeader,
  encryptChunkedBuffer,
  decryptChunkedBuffer,
  createChunkEncryptStream,
  createChunkDecryptStream,
}
