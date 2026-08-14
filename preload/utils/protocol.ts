/**
 * 加密文件协议的编码、解析与字段校验。
 */

import * as crypto from 'node:crypto'
import {
  FILE_MAGIC,
  MAGIC_SIZE,
  PROTOCOL_VERSION_SIZE,
  CURRENT_PROTOCOL_VERSION,
  CONFIG_LENGTH_OFFSET,
  CONFIG_LENGTH_SIZE,
  COMPRESSION_TYPE_OFFSET,
  ENCRYPTION_TYPE_OFFSET,
  SCRYPT_PROFILE_OFFSET,
  SALT_OFFSET,
  SALT_SIZE,
  CHUNK_SIZE_OFFSET,
  PAYLOAD_NONCE_PREFIX_OFFSET,
  PAYLOAD_NONCE_PREFIX_SIZE,
  RECIPIENT_FINGERPRINT_OFFSET,
  RECIPIENT_FINGERPRINT_SIZE,
  EPHEMERAL_PUBLIC_KEY_OFFSET,
  EPHEMERAL_PUBLIC_KEY_SIZE,
  HKDF_SALT_OFFSET,
  HKDF_SALT_SIZE,
  PASSWORD_FILE_METADATA_OFFSET,
  PUBLIC_KEY_FILE_METADATA_OFFSET,
  ORIGINAL_EXTENSION_LENGTH_SIZE,
  MAX_ORIGINAL_EXTENSION_SIZE,
  WRAP_IV_OFFSET,
  WRAPPED_DEK_OFFSET,
  WRAP_AUTH_TAG_OFFSET,
  DEK_SIZE,
  IV_SIZE,
  AUTH_TAG_SIZE,
  DEFAULT_CHUNK_SIZE,
  MIN_CHUNK_SIZE,
  MAX_CHUNK_SIZE,
  CHUNK_LENGTH_SIZE,
  CHUNK_HEADER_SIZE,
  FINAL_CHUNK_FLAG,
  getProtocolVersionConfig,
  isCompressionType,
  isEncryptionType,
  getScryptProfile,
} from '../config'
import type {
  CompressionType,
  EncryptionType,
  ScryptProfile,
} from '../../shared/preload-api'
import type {
  ChunkHeader,
  DecodedFileConfig,
  EncryptedHeader,
  KeyMetadata,
  ScryptParams,
} from './types'

const FILE_MAGIC_BUFFER = Buffer.from(FILE_MAGIC, 'ascii')

/**
 * 解析内置 scrypt 档位，密文不能提供任意 KDF 参数以避免资源耗尽攻击。
 *
 * @param {0|1|2} [scryptProfile=0] scrypt 档位编号。
 * @throws {Error} 档位编号无效。
 */
function resolveScryptProfile(scryptProfile: ScryptProfile = 0): ScryptParams {
  const profile = getScryptProfile(scryptProfile)
  if (!Number.isInteger(scryptProfile) || !profile) {
    throw new Error('scrypt 配置档位必须是 0（标准）、1（性能）或 2（安全）')
  }
  return profile
}

/**
 * 生成带显式长度、随机 payload nonce 前缀和 wrap IV 的 v1 配置区。
 *
 * @param {0|1|2} compressionType 压缩编号：0=Gzip、1=Brotli、2=不压缩。
 * @param {0|1} encryptionType 密钥保护编号：0=密码，1=X25519 公钥。
 * @param {0|1|2} [scryptProfile=0] scrypt 档位编号。
 * @param {string} [originalExtension=''] 包含起始点号的原文件后缀。
 * @returns {Buffer} 带原文件后缀元数据的配置区；DEK 包装字段暂为空。
 */
function encodeFileConfig(
  compressionType: CompressionType,
  encryptionType: EncryptionType,
  scryptProfile: ScryptProfile = 0,
  keyMetadata: KeyMetadata = {},
  originalExtension = '',
) {
  if (!isCompressionType(compressionType)) {
    throw new Error('compressionType must be one of: 0, 1, 2')
  }
  if (!isEncryptionType(encryptionType)) {
    throw new Error('encryptionType must be 0 or 1')
  }
  if (encryptionType === 0) resolveScryptProfile(scryptProfile)
  else if (scryptProfile !== 0) throw new Error('公钥加密不使用 scrypt 档位')

  const extension = encodeOriginalExtension(originalExtension)
  const fileMetadataOffset = encryptionType === 0
    ? PASSWORD_FILE_METADATA_OFFSET
    : PUBLIC_KEY_FILE_METADATA_OFFSET
  const configSize = fileMetadataOffset + ORIGINAL_EXTENSION_LENGTH_SIZE + extension.length
  const config = Buffer.alloc(configSize)
  config.writeUInt16BE(CURRENT_PROTOCOL_VERSION, 0)
  config.writeUInt16BE(configSize, CONFIG_LENGTH_OFFSET)
  config[COMPRESSION_TYPE_OFFSET] = compressionType
  config[ENCRYPTION_TYPE_OFFSET] = encryptionType
  config.writeUInt32BE(DEFAULT_CHUNK_SIZE, CHUNK_SIZE_OFFSET)
  crypto.randomBytes(PAYLOAD_NONCE_PREFIX_SIZE).copy(config, PAYLOAD_NONCE_PREFIX_OFFSET)
  crypto.randomBytes(IV_SIZE).copy(config, WRAP_IV_OFFSET)

  if (encryptionType === 0) {
    config[SCRYPT_PROFILE_OFFSET] = scryptProfile
    crypto.randomBytes(SALT_SIZE).copy(config, SALT_OFFSET)
  } else {
    const { recipientFingerprint, ephemeralPublicKey } = keyMetadata
    if (!Buffer.isBuffer(recipientFingerprint)
      || recipientFingerprint.length !== RECIPIENT_FINGERPRINT_SIZE) {
      throw new Error('接收方公钥指纹长度无效')
    }
    if (!Buffer.isBuffer(ephemeralPublicKey)
      || ephemeralPublicKey.length !== EPHEMERAL_PUBLIC_KEY_SIZE) {
      throw new Error('临时 X25519 公钥长度无效')
    }
    recipientFingerprint.copy(config, RECIPIENT_FINGERPRINT_OFFSET)
    ephemeralPublicKey.copy(config, EPHEMERAL_PUBLIC_KEY_OFFSET)
    crypto.randomBytes(HKDF_SALT_SIZE).copy(config, HKDF_SALT_OFFSET)
  }
  config.writeUInt16BE(extension.length, fileMetadataOffset)
  extension.copy(config, fileMetadataOffset + ORIGINAL_EXTENSION_LENGTH_SIZE)
  return config
}

function encodeOriginalExtension(originalExtension: string) {
  if (typeof originalExtension !== 'string') throw new Error('原文件后缀必须是字符串')
  if (originalExtension && !originalExtension.startsWith('.')) {
    throw new Error('原文件后缀必须以点号开头')
  }
  if (/[\\/\0]/.test(originalExtension)) throw new Error('原文件后缀包含非法字符')
  const extension = Buffer.from(originalExtension, 'utf8')
  if (extension.length > MAX_ORIGINAL_EXTENSION_SIZE) {
    throw new Error(`原文件后缀不能超过 ${MAX_ORIGINAL_EXTENSION_SIZE} 字节`)
  }
  return extension
}

/**
 * 校验密文开头的固定魔数。
 *
 * @param {Buffer} buffer 完整密文或至少包含魔数的前缀。
 * @returns {void}
 * @throws {Error} 魔数字段不完整或内容不匹配。
 */
function assertFileMagic(buffer: Buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < MAGIC_SIZE) {
    throw new Error('文件魔数字段不完整')
  }
  if (!buffer.subarray(0, MAGIC_SIZE).equals(FILE_MAGIC_BUFFER)) {
    throw new Error(`不是有效的 ${FILE_MAGIC} 加密数据`)
  }
}

/**
 * 从密文前两个字节读取并校验协议版本。
 *
 * @param {Buffer} buffer 配置区或密文前缀。
 * @returns {number} 受支持的协议版本号。
 * @throws {Error} 版本字段不完整或版本不受支持。
 */
function decodeProtocolVersion(buffer: Buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < PROTOCOL_VERSION_SIZE) {
    throw new Error('协议版本字段不完整')
  }
  const protocolVersion = buffer.readUInt16BE(0)
  if (!getProtocolVersionConfig(protocolVersion)) {
    throw new Error(`不支持的协议版本：${protocolVersion}`)
  }
  return protocolVersion
}

/**
 * 读取并限制密文前缀声明的配置区长度。
 *
 * @param {Buffer} buffer 配置区或密文前缀。
 * @returns {number} 对应版本的配置区字节数。
 */
function getVersionedConfigSize(buffer: Buffer) {
  const protocolVersion = decodeProtocolVersion(buffer)
  const versionConfig = getProtocolVersionConfig(protocolVersion)!
  const requiredPrefixSize = CONFIG_LENGTH_OFFSET + CONFIG_LENGTH_SIZE
  if (buffer.length < requiredPrefixSize) throw new Error('配置区长度字段不完整')
  const configSize = buffer.readUInt16BE(CONFIG_LENGTH_OFFSET)
  if (configSize < versionConfig.minConfigSize || configSize > versionConfig.maxConfigSize) {
    throw new Error(`v${protocolVersion} 配置区长度无效：${configSize} 字节`)
  }
  return configSize
}

/**
 * 校验并解析完整配置区。
 *
 * @param {Buffer} config 完整配置区。
 */
function decodeFileConfig(config: Buffer): DecodedFileConfig {
  const protocolVersion = decodeProtocolVersion(config)
  const configSize = getVersionedConfigSize(config)
  if (config.length !== configSize) {
    throw new Error(`v${protocolVersion} 配置区不完整：声明 ${configSize} 字节，实际为 ${config.length} 字节`)
  }
  if (protocolVersion !== 1) throw new Error(`缺少协议 v${protocolVersion} 的配置解析器`)

  const compressionType = config[COMPRESSION_TYPE_OFFSET]
  const encryptionType = config[ENCRYPTION_TYPE_OFFSET]
  if (!isCompressionType(compressionType)) {
    throw new Error(`不支持的压缩方式编号：${compressionType}`)
  }
  if (!isEncryptionType(encryptionType)) {
    throw new Error(`不支持的加密方式编号：${encryptionType}`)
  }

  const fileMetadataOffset = encryptionType === 0
    ? PASSWORD_FILE_METADATA_OFFSET
    : PUBLIC_KEY_FILE_METADATA_OFFSET
  if (configSize < fileMetadataOffset + ORIGINAL_EXTENSION_LENGTH_SIZE) {
    throw new Error(`加密方式 ${encryptionType} 的配置区长度无效`)
  }

  let scryptProfile: ScryptProfile = 0
  let salt: Buffer = Buffer.alloc(0)
  let recipientFingerprint: Buffer = Buffer.alloc(0)
  let ephemeralPublicKey: Buffer = Buffer.alloc(0)
  let hkdfSalt: Buffer = Buffer.alloc(0)
  if (encryptionType === 0) {
    const rawScryptProfile = config[SCRYPT_PROFILE_OFFSET]
    if (![0, 1, 2].includes(rawScryptProfile)) {
      throw new Error(`不支持的 scrypt 配置档位：${rawScryptProfile}`)
    }
    scryptProfile = rawScryptProfile as ScryptProfile
    resolveScryptProfile(scryptProfile)
    salt = config.subarray(SALT_OFFSET, SALT_OFFSET + SALT_SIZE)
  } else {
    recipientFingerprint = config.subarray(
      RECIPIENT_FINGERPRINT_OFFSET,
      RECIPIENT_FINGERPRINT_OFFSET + RECIPIENT_FINGERPRINT_SIZE,
    )
    ephemeralPublicKey = config.subarray(
      EPHEMERAL_PUBLIC_KEY_OFFSET,
      EPHEMERAL_PUBLIC_KEY_OFFSET + EPHEMERAL_PUBLIC_KEY_SIZE,
    )
    hkdfSalt = config.subarray(HKDF_SALT_OFFSET, HKDF_SALT_OFFSET + HKDF_SALT_SIZE)
    if ([recipientFingerprint, ephemeralPublicKey, hkdfSalt]
      .some((value) => value.every((byte: number) => byte === 0))) {
      throw new Error('公钥加密配置字段不完整')
    }
  }
  const chunkSize = config.readUInt32BE(CHUNK_SIZE_OFFSET)
  if (chunkSize < MIN_CHUNK_SIZE || chunkSize > MAX_CHUNK_SIZE) {
    throw new Error(`分块大小无效：${chunkSize}`)
  }
  const extensionSize = config.readUInt16BE(fileMetadataOffset)
  if (extensionSize > MAX_ORIGINAL_EXTENSION_SIZE
    || configSize !== fileMetadataOffset + ORIGINAL_EXTENSION_LENGTH_SIZE + extensionSize) {
    throw new Error('原文件后缀长度无效')
  }
  const extensionBytes = config.subarray(
    fileMetadataOffset + ORIGINAL_EXTENSION_LENGTH_SIZE,
    configSize,
  )
  const originalExtension = extensionBytes.toString('utf8')
  if (!Buffer.from(originalExtension, 'utf8').equals(extensionBytes)
    || (originalExtension && !originalExtension.startsWith('.'))
    || /[\\/\0]/.test(originalExtension)) {
    throw new Error('原文件后缀内容无效')
  }

  return {
    protocolVersion,
    configSize,
    compressionType,
    encryptionType,
    kdfType: encryptionType === 0 ? 'scrypt' : 'x25519-hkdf-sha256',
    scryptProfile,
    salt,
    chunkSize,
    payloadNoncePrefix: config.subarray(
      PAYLOAD_NONCE_PREFIX_OFFSET,
      PAYLOAD_NONCE_PREFIX_OFFSET + PAYLOAD_NONCE_PREFIX_SIZE,
    ),
    recipientFingerprint,
    ephemeralPublicKey,
    hkdfSalt,
    originalExtension,
    wrapIv: config.subarray(WRAP_IV_OFFSET, WRAP_IV_OFFSET + IV_SIZE),
    wrappedDek: config.subarray(WRAPPED_DEK_OFFSET, WRAPPED_DEK_OFFSET + DEK_SIZE),
    wrapAuthTag: config.subarray(WRAP_AUTH_TAG_OFFSET, WRAP_AUTH_TAG_OFFSET + AUTH_TAG_SIZE),
    scryptParams: encryptionType === 0 ? resolveScryptProfile(scryptProfile) : null,
  }
}

/**
 * 解析密文头并返回完整的认证配置区。
 *
 * @param {Buffer} data 完整密文或已读取的头部。
 */
function decodeEncryptedHeader(data: Buffer): EncryptedHeader {
  const prefixSize = MAGIC_SIZE + CONFIG_LENGTH_OFFSET + CONFIG_LENGTH_SIZE
  if (!Buffer.isBuffer(data) || data.length < prefixSize) {
    throw new Error('加密数据头不完整')
  }
  assertFileMagic(data)
  const configSize = getVersionedConfigSize(data.subarray(MAGIC_SIZE))
  const headerSize = MAGIC_SIZE + configSize
  if (data.length < headerSize) throw new Error('加密数据头不完整')

  const authenticatedConfig = data.subarray(0, headerSize)
  const config = authenticatedConfig.subarray(MAGIC_SIZE)
  return {
    headerSize,
    config,
    authenticatedConfig,
    decodedConfig: decodeFileConfig(config),
  }
}

/**
 * 创建记录明文长度和最终块标志的分块头。
 *
 * @param {number} dataLength 块内密文长度。
 * @param {boolean} isFinal 是否为最终块。
 * @returns {Buffer} 5 字节块头。
 */
function createChunkHeader(dataLength: number, isFinal: boolean) {
  if (!Number.isInteger(dataLength) || dataLength < 0 || dataLength > MAX_CHUNK_SIZE) {
    throw new Error('分块长度无效')
  }
  const header = Buffer.alloc(CHUNK_HEADER_SIZE)
  header.writeUInt32BE(dataLength, 0)
  header[CHUNK_LENGTH_SIZE] = isFinal ? FINAL_CHUNK_FLAG : 0
  return header
}

/**
 * 解析并校验分块头。
 *
 * @param {Buffer} header 5 字节块头。
 * @param {number} chunkSize 当前协议声明的分块大小。
 */
function decodeChunkHeader(header: Buffer, chunkSize: number): ChunkHeader {
  if (!Buffer.isBuffer(header) || header.length !== CHUNK_HEADER_SIZE) {
    throw new Error('分块头不完整')
  }
  const dataLength = header.readUInt32BE(0)
  const flags = header[CHUNK_LENGTH_SIZE]
  if ((flags & ~FINAL_CHUNK_FLAG) !== 0) throw new Error('分块标志无效')
  const isFinal = Boolean(flags & FINAL_CHUNK_FLAG)
  if (dataLength > chunkSize || (!isFinal && dataLength !== chunkSize)) {
    throw new Error(`分块长度无效：${dataLength}`)
  }
  return { dataLength, isFinal }
}

export {
  FILE_MAGIC_BUFFER,
  resolveScryptProfile,
  encodeFileConfig,
  assertFileMagic,
  decodeProtocolVersion,
  getVersionedConfigSize,
  decodeFileConfig,
  decodeEncryptedHeader,
  createChunkHeader,
  decodeChunkHeader,
}
