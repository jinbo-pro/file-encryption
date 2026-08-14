import type {
  CompressionType,
  EncryptionHistoryRecord,
  HistoryAction,
  KeyType,
  ManagedKeyKind,
  ScryptProfile,
} from '../../shared/preload-api'

export type {
  AddEncryptionHistoryOptions,
  BatchOutputPath,
  ChangeFilePasswordOptions,
  ChangeFilePasswordResult,
  CompressionType,
  DecryptFileOptions,
  EncryptedFileInfo,
  EncryptionType,
  EncryptionHistoryRecord,
  FileCryptoResult,
  FileInfo,
  FileMode,
  HashFailure,
  HashResult,
  HashSuccess,
  HistoryAction,
  KeyType,
  ManagedKeyKind,
  ManagedKeySummary,
  PreloadServices,
  ProgressCallback,
  PublicKeyInfo,
  ScryptProfile,
  SourceFileMode,
  TextCryptoResult,
  TextFileInfo,
  EncryptFileOptions,
} from '../../shared/preload-api'

export interface ValidatedFilePaths {
  source: string
  output: string
  sourceSize: number
}

export interface CryptoStorage {
  getItem(key: string): unknown
  setItem(key: string, value: unknown): void
  removeItem(key: string): void
}

export interface SaveTextResultOptions {
  text: string
  defaultName?: string
}

export interface EncryptTextOptions {
  text: string
  password: string
  compressionType?: CompressionType
  encryptionType?: 0
  scryptProfile?: ScryptProfile
}

export interface DecryptTextOptions {
  text: string
  password: string
}

export interface ExportManagedKeyOptions {
  id: string
  keyType?: KeyType
}

export interface GenerateManagedKeyOptions {
  name: string
  passphrase: string
}

export interface ImportManagedPrivateKeyOptions {
  name: string
  privateKeyPem: string
  currentPassphrase?: string
  storagePassphrase: string
}

export interface ImportManagedPublicKeyOptions {
  name: string
  publicKeyPem: string
}

export interface KeyRecordBase {
  id: string
  kind: ManagedKeyKind
  name: string
  publicKeyPem: string
  fingerprint: string
  createdAt: string
}

export interface IdentityKeyRecord extends KeyRecordBase {
  kind: 'identity'
  privateKeyPem: string
}

export interface ContactKeyRecord extends KeyRecordBase {
  kind: 'contact'
}

export type KeyRecord = IdentityKeyRecord | ContactKeyRecord

export interface KeyMaterial {
  publicKeyPem: string
  fingerprint: string
  privateKeyPem?: string
}

export interface StoredHistoryRecord extends Omit<EncryptionHistoryRecord, 'action'> {
  action?: HistoryAction
}
