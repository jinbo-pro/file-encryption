import type {
  CompressionType,
  EncryptionType,
  ScryptProfile,
} from '../../shared/preload-api'

export interface ScryptParams {
  name: string
  logN: number
  r: number
  p: number
  dkLen: number
}

export interface KeyMetadata {
  recipientFingerprint?: Buffer
  ephemeralPublicKey?: Buffer
}

export interface DecodedFileConfig {
  protocolVersion: number
  configSize: number
  compressionType: CompressionType
  encryptionType: EncryptionType
  kdfType: 'scrypt' | 'x25519-hkdf-sha256'
  scryptProfile: ScryptProfile
  salt: Buffer
  chunkSize: number
  payloadNoncePrefix: Buffer
  recipientFingerprint: Buffer
  ephemeralPublicKey: Buffer
  hkdfSalt: Buffer
  originalExtension: string
  wrapIv: Buffer
  wrappedDek: Buffer
  wrapAuthTag: Buffer
  scryptParams: ScryptParams | null
}

export interface EncryptedHeader {
  headerSize: number
  config: Buffer
  authenticatedConfig: Buffer
  decodedConfig: DecodedFileConfig
}

export interface CryptoContext {
  config: Buffer
  authenticatedConfig: Buffer
  payloadAad: Buffer
  decodedConfig: DecodedFileConfig
  payloadKey: Buffer
}

export interface ChunkHeader {
  dataLength: number
  isFinal: boolean
}

export interface FileCryptoMetadata {
  compressionType: CompressionType
  encryptionType: EncryptionType
  scryptProfile: ScryptProfile
}

export interface PasswordCryptoMetadata extends FileCryptoMetadata {
  encryptionType: 0
}

export interface DecryptedBufferResult extends PasswordCryptoMetadata {
  data: Buffer
}

export interface ManagedKeyPairMaterial {
  publicKeyPem: string
  privateKeyPem: string
  fingerprint: string
  formattedFingerprint: string
}

export interface X25519EncryptionMaterial {
  recipientFingerprint: Buffer
  ephemeralPublicKey: Buffer
  sharedSecret: Buffer
}
