/**
 * 加密文件协议与算法配置的唯一来源。
 *
 * 密文以 4 字节 ASCII 魔数 "FENC" 开头，用于快速识别文件格式。
 *
 * v1 配置区采用公共区加凭据元数据的可变长度布局：
 * - 0..1：协议版本，uint16BE，当前为 1
 * - 2..3：配置区长度，uint16BE，包含本字段
 * - 4：压缩方式编号
 * - 5：密钥保护方式编号（0=密码，1=X25519 公钥）
 * - 6..9：分块大小，uint32BE
 * - 10..17：8 字节随机 payload nonce 前缀
 * - 18..29：12 字节随机 DEK wrap IV
 * - 30..61：32 字节 wrapped DEK
 * - 62..77：16 字节 DEK wrap AuthTag
 * - 78..：按密钥保护方式编码的凭据元数据
 *   - 密码：scrypt 档位 1 字节 + salt 24 字节
 *   - X25519：指纹 32 字节 + 临时公钥 44 字节 + HKDF salt 32 字节，
 * - 凭据元数据之后：原文件后缀 UTF-8 字节长度 2 字节 + 后缀内容
 *
 * 完整格式：魔数 + 配置区 + 分块 AEAD 记录。
 */

const FILE_MAGIC = 'FENC'
const MAGIC_SIZE = 4
const PROTOCOL_VERSION_SIZE = 2
const CURRENT_PROTOCOL_VERSION = 1
const CONFIG_LENGTH_OFFSET = PROTOCOL_VERSION_SIZE
const CONFIG_LENGTH_SIZE = 2
const COMPRESSION_TYPE_OFFSET = CONFIG_LENGTH_OFFSET + CONFIG_LENGTH_SIZE
const ENCRYPTION_TYPE_OFFSET = COMPRESSION_TYPE_OFFSET + 1
const CHUNK_SIZE_OFFSET = ENCRYPTION_TYPE_OFFSET + 1
const CHUNK_SIZE_FIELD_SIZE = 4
const PAYLOAD_NONCE_PREFIX_OFFSET = CHUNK_SIZE_OFFSET + CHUNK_SIZE_FIELD_SIZE
const PAYLOAD_NONCE_PREFIX_SIZE = 8
const WRAP_IV_OFFSET = PAYLOAD_NONCE_PREFIX_OFFSET + PAYLOAD_NONCE_PREFIX_SIZE
const IV_SIZE = 12
const WRAPPED_DEK_OFFSET = WRAP_IV_OFFSET + IV_SIZE
const DEK_SIZE = 32
const WRAP_AUTH_TAG_OFFSET = WRAPPED_DEK_OFFSET + DEK_SIZE
const AUTH_TAG_SIZE = 16
const KEY_METADATA_OFFSET = WRAP_AUTH_TAG_OFFSET + AUTH_TAG_SIZE

const SCRYPT_PROFILE_OFFSET = KEY_METADATA_OFFSET
const SALT_OFFSET = SCRYPT_PROFILE_OFFSET + 1
const SALT_SIZE = 24
const PASSWORD_FILE_METADATA_OFFSET = SALT_OFFSET + SALT_SIZE

const RECIPIENT_FINGERPRINT_OFFSET = KEY_METADATA_OFFSET
const RECIPIENT_FINGERPRINT_SIZE = 32
const EPHEMERAL_PUBLIC_KEY_OFFSET = RECIPIENT_FINGERPRINT_OFFSET + RECIPIENT_FINGERPRINT_SIZE
const EPHEMERAL_PUBLIC_KEY_SIZE = 44
const HKDF_SALT_OFFSET = EPHEMERAL_PUBLIC_KEY_OFFSET + EPHEMERAL_PUBLIC_KEY_SIZE
const HKDF_SALT_SIZE = 32
const PUBLIC_KEY_FILE_METADATA_OFFSET = HKDF_SALT_OFFSET + HKDF_SALT_SIZE

const ORIGINAL_EXTENSION_LENGTH_SIZE = 2
const MAX_ORIGINAL_EXTENSION_SIZE = 1024
const PASSWORD_CONFIG_SIZE = PASSWORD_FILE_METADATA_OFFSET + ORIGINAL_EXTENSION_LENGTH_SIZE
const PUBLIC_KEY_CONFIG_SIZE = PUBLIC_KEY_FILE_METADATA_OFFSET + ORIGINAL_EXTENSION_LENGTH_SIZE
const MAX_CONFIG_SIZE = PUBLIC_KEY_CONFIG_SIZE + MAX_ORIGINAL_EXTENSION_SIZE

const DEFAULT_CHUNK_SIZE = 1024 * 1024
const MIN_CHUNK_SIZE = 64 * 1024
const MAX_CHUNK_SIZE = 16 * 1024 * 1024
const CHUNK_LENGTH_SIZE = 4
const CHUNK_FLAGS_SIZE = 1
const CHUNK_HEADER_SIZE = CHUNK_LENGTH_SIZE + CHUNK_FLAGS_SIZE
const FINAL_CHUNK_FLAG = 0x01
const MAX_CHUNK_INDEX = 0xffffffff
const KEY_WRAP_ALGORITHM = 'aes-256-gcm'
const PAYLOAD_ALGORITHM = 'aes-256-gcm'
const PAYLOAD_KEY_SIZE = 32

/** @type {Readonly<Record<number, Readonly<{minConfigSize: number, maxConfigSize: number}>>>} */
const PROTOCOL_VERSIONS: Readonly<Record<number, Readonly<{
  minConfigSize: number
  maxConfigSize: number
}>>> = Object.freeze({
  1: Object.freeze({
    minConfigSize: PASSWORD_CONFIG_SIZE,
    maxConfigSize: MAX_CONFIG_SIZE,
  }),
})

const MIN_SUPPORTED_CONFIG_SIZE = Math.min(
  ...Object.values(PROTOCOL_VERSIONS).map(({ minConfigSize }) => minConfigSize),
)
const MIN_HEADER_SIZE = MAGIC_SIZE + MIN_SUPPORTED_CONFIG_SIZE
const MIN_ENCRYPTED_SIZE = MIN_HEADER_SIZE + CHUNK_HEADER_SIZE + AUTH_TAG_SIZE

/** @type {Readonly<Record<0|1|2, Readonly<{name: string, logN: number, r: number, p: number, dkLen: number}>>>} */
const SCRYPT_PROFILES: Readonly<Record<number, Readonly<{ name: string; logN: number; r: number; p: number; dkLen: number }>>> = Object.freeze({
  0: Object.freeze({ name: 'standard', logN: 14, r: 8, p: 1, dkLen: 32 }),
  1: Object.freeze({ name: 'performance', logN: 13, r: 8, p: 1, dkLen: 32 }),
  2: Object.freeze({ name: 'secure', logN: 16, r: 8, p: 1, dkLen: 32 }),
})

/** @type {Readonly<Record<0|1|2, Readonly<{name: 'gzip'|'brotli'|'none'}>>>} */
const COMPRESSION_CONFIGS: Readonly<Record<number, Readonly<{ name: string }>>> = Object.freeze({
  0: Object.freeze({ name: 'gzip' }),
  1: Object.freeze({ name: 'brotli' }),
  2: Object.freeze({ name: 'none' }),
})
/** @type {Readonly<Record<0|1, Readonly<{name: string}>>>} */
const ENCRYPTION_CONFIGS: Readonly<Record<number, Readonly<{ name: string }>>> = Object.freeze({
  0: Object.freeze({ name: 'password-scrypt-aes256gcm' }),
  1: Object.freeze({ name: 'x25519-hkdf-sha256-aes256gcm' }),
})

/**
 * 按整数编号读取冻结配置，拒绝字符串数字和继承属性。
 *
 * @template T
 * @param {Readonly<Record<number, T>>} config 配置表。
 * @param {unknown} code 待查询编号。
 * @returns {T|undefined} 对应配置，不存在时返回 undefined。
 */
function getConfigItem<T>(config: Readonly<Record<number, T>>, code: unknown): T | undefined {
  return Number.isInteger(code) && Object.prototype.hasOwnProperty.call(config, code as number)
    ? config[code as number]
    : undefined
}

/**
 * 获取指定协议版本允许的配置区长度范围。
 *
 * @param {unknown} version 协议版本号。
 * @returns {{minConfigSize: number, maxConfigSize: number}|undefined} 对应版本配置。
 */
function getProtocolVersionConfig(version: unknown) {
  return getConfigItem(PROTOCOL_VERSIONS, version)
}

/**
 * @param {unknown} value 压缩方式编号。
 * @returns {value is 0|1|2} 是否为受支持的压缩方式。
 */
function isCompressionType(value: unknown): value is import('../shared/preload-api').CompressionType {
  return Boolean(getConfigItem(COMPRESSION_CONFIGS, value))
}

/**
 * @param {unknown} value 加密方式编号。
 * @returns {value is 0|1} 是否为受支持的密钥保护方式。
 */
function isEncryptionType(value: unknown): value is import('../shared/preload-api').EncryptionType {
  return Boolean(getConfigItem(ENCRYPTION_CONFIGS, value))
}

/**
 * @param {unknown} code scrypt 档位编号。
 * @returns {{name: string, logN: number, r: number, p: number, dkLen: number}|undefined} 固定的 scrypt 参数。
 */
function getScryptProfile(code: unknown) {
  return getConfigItem(SCRYPT_PROFILES, code)
}

export {
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
  CHUNK_SIZE_FIELD_SIZE,
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
  KEY_METADATA_OFFSET,
  WRAP_IV_OFFSET,
  WRAPPED_DEK_OFFSET,
  WRAP_AUTH_TAG_OFFSET,
  DEK_SIZE,
  PASSWORD_CONFIG_SIZE,
  PUBLIC_KEY_CONFIG_SIZE,
  IV_SIZE,
  AUTH_TAG_SIZE,
  DEFAULT_CHUNK_SIZE,
  MIN_CHUNK_SIZE,
  MAX_CHUNK_SIZE,
  CHUNK_LENGTH_SIZE,
  CHUNK_FLAGS_SIZE,
  CHUNK_HEADER_SIZE,
  FINAL_CHUNK_FLAG,
  MAX_CHUNK_INDEX,
  KEY_WRAP_ALGORITHM,
  PAYLOAD_ALGORITHM,
  PAYLOAD_KEY_SIZE,
  MIN_HEADER_SIZE,
  MIN_ENCRYPTED_SIZE,
  PROTOCOL_VERSIONS,
  COMPRESSION_CONFIGS,
  ENCRYPTION_CONFIGS,
  SCRYPT_PROFILES,
  getProtocolVersionConfig,
  isCompressionType,
  isEncryptionType,
  getScryptProfile,
}
