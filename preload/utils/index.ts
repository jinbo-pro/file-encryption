/**
 * 加密协议底层实现的公共入口。
 */

export {
  FILE_MAGIC,
  MAGIC_SIZE,
  PROTOCOL_VERSION_SIZE,
  CURRENT_PROTOCOL_VERSION,
  CONFIG_LENGTH_OFFSET,
  CONFIG_LENGTH_SIZE,
  PASSWORD_CONFIG_SIZE,
  PUBLIC_KEY_CONFIG_SIZE,
  MIN_HEADER_SIZE,
  MIN_ENCRYPTED_SIZE,
  DEFAULT_CHUNK_SIZE,
  CHUNK_HEADER_SIZE,
} from '../config'
export {
  encodeFileConfig,
  decodeProtocolVersion,
  decodeFileConfig,
} from './protocol'
export { aesGcmBufferEncrypt, aesGcmBufferDecrypt } from './buffer'
export {
  aesGcmFileEncrypt,
  aesGcmFileDecrypt,
  x25519FileEncrypt,
  x25519FileDecrypt,
  readEncryptedFileHeader,
  changeEncryptedFilePassword,
} from './file'
export { rewrapEncryptionHeader } from './crypto'
export type {
  ChunkHeader,
  CryptoContext,
  DecodedFileConfig,
  DecryptedBufferResult,
  EncryptedHeader,
  FileCryptoMetadata,
  KeyMetadata,
  ManagedKeyPairMaterial,
  PasswordCryptoMetadata,
  ScryptParams,
  X25519EncryptionMaterial,
} from './types'
