export type CompressionType = 0 | 1 | 2
export type EncryptionType = 0 | 1
export type ScryptProfile = 0 | 1 | 2
export type FileMode = 'encrypt' | 'decrypt'
export type SourceFileMode = FileMode | 'password-change'
export type KeyType = 'public' | 'private'
export type ManagedKeyKind = 'identity' | 'contact'
export type HistoryAction = 'encrypt' | 'password-change'
export type ProgressCallback = (percentage: number) => void

export interface FileInfo {
  path: string
  name: string
  size: number
}

export interface TextFileInfo extends FileInfo {
  text: string
}

export interface PublicKeyInfo {
  algorithm: 'X25519'
  fingerprint: string
  formattedFingerprint: string
}

export interface ManagedKeySummary extends PublicKeyInfo {
  id: string
  kind: ManagedKeyKind
  name: string
  createdAt: string
}

export interface EncryptedFileInfo extends FileInfo {
  protocolVersion: number
  compressionType: CompressionType
  encryptionType: EncryptionType
  scryptProfile: ScryptProfile
  recipientFingerprint: string
  originalExtension: string
}

export interface FileCryptoResult {
  outputPath: string
  sourceSize: number
  outputSize: number
  compressionType: CompressionType
  encryptionType: EncryptionType
  scryptProfile: ScryptProfile
  recipientFingerprint?: string
}

export interface TextCryptoResult {
  text: string
  sourceSize: number
  outputSize: number
  plaintextMd5: string
  compressionType: CompressionType
  encryptionType: 0
  scryptProfile: ScryptProfile
}

export interface HashSuccess extends FileInfo {
  md5: string
  sha1: string
  sha256: string
  error?: never
}

export interface HashFailure {
  path: string
  name: string
  error: string
  size?: never
  md5?: never
  sha1?: never
  sha256?: never
}

export type HashResult = HashSuccess | HashFailure

export interface EncryptionHistoryRecord {
  id: string
  filePath: string
  outputPath: string
  encryptionType: EncryptionType
  password?: string
  recipientFingerprint?: string
  createdAt: string
  action: HistoryAction
}

export interface AddEncryptionHistoryOptions {
  filePath: string
  outputPath?: string
  password?: string
  encryptionType?: EncryptionType
  recipientFingerprint?: string
  createdAt?: string
  action?: HistoryAction
}

export interface EncryptFileOptions {
  sourcePath: string
  outputPath: string
  password?: string
  publicKeyPem?: string
  compressionType?: CompressionType
  encryptionType?: EncryptionType
  scryptProfile?: ScryptProfile
  onProgress?: ProgressCallback
  signal?: AbortSignal
}

export interface DecryptFileOptions {
  sourcePath: string
  outputPath: string
  password?: string
  privateKeyId?: string
  privateKeyPem?: string
  privateKeyPassphrase?: string
  onProgress?: ProgressCallback
  signal?: AbortSignal
}

export interface BatchOutputPath {
  sourcePath: string
  outputPath: string
}

export interface ChangeFilePasswordOptions {
  filePath: string
  currentPassword: string
  newPassword: string
  scryptProfile?: ScryptProfile
}

export interface ChangeFilePasswordResult {
  filePath: string
  size: number
  compressionType: CompressionType
  encryptionType: 0
  scryptProfile: ScryptProfile
}

export interface PreloadServices {
  generateRandomPassword(): string
  selectTextFile(): TextFileInfo | null
  selectKeyFile(keyType?: KeyType): TextFileInfo | null
  inspectPublicKey(publicKeyPem: string): PublicKeyInfo
  listManagedKeys(): ManagedKeySummary[]
  generateManagedKey(options: { name: string; passphrase: string }): ManagedKeySummary
  importManagedPrivateKey(options: {
    name: string
    privateKeyPem: string
    currentPassphrase?: string
    storagePassphrase: string
  }): ManagedKeySummary
  importManagedPublicKey(options: { name: string; publicKeyPem: string }): ManagedKeySummary
  renameManagedKey(id: string, name: string): ManagedKeySummary
  getManagedPublicKey(id: string): string
  exportManagedKey(options: { id: string; keyType?: KeyType }): string | null
  deleteManagedKey(id: string): ManagedKeySummary[]
  clearManagedKeys(): void
  selectHashFiles(): FileInfo[]
  selectSourceFile(mode?: SourceFileMode): FileInfo | null
  selectSourceFiles(mode?: FileMode): FileInfo[]
  selectOutputFile(
    sourcePath: string,
    mode?: FileMode,
    fileExtension?: string,
    originalExtension?: string,
  ): string | null
  selectOutputDirectory(defaultPath?: string): string | null
  getDefaultOutputPath(
    sourcePath: string,
    mode: FileMode,
    fileExtension?: string,
    originalExtension?: string,
  ): string
  getBatchOutputPaths(
    sourcePaths: string[],
    mode: FileMode,
    outputDirectory?: string,
    fileExtension?: string,
    originalExtensions?: string[],
  ): BatchOutputPath[]
  getFileInfo(filePath: string): FileInfo
  encryptFile(options: EncryptFileOptions): Promise<FileCryptoResult>
  decryptFile(options: DecryptFileOptions): Promise<FileCryptoResult>
  inspectEncryptedFile(filePath: string): EncryptedFileInfo
  changeFilePassword(options: ChangeFilePasswordOptions): ChangeFilePasswordResult
  encryptText(options: {
    text: string
    password: string
    compressionType?: CompressionType
    encryptionType?: 0
    scryptProfile?: ScryptProfile
  }): TextCryptoResult
  decryptText(options: { text: string; password: string }): TextCryptoResult
  saveTextResult(options: { text: string; defaultName?: string }): string | null
  calculateFileHashes(filePaths: string[]): Promise<HashResult[]>
  getEncryptionHistory(): EncryptionHistoryRecord[]
  addEncryptionHistory(options: AddEncryptionHistoryOptions): EncryptionHistoryRecord
  deleteEncryptionHistory(id: string): EncryptionHistoryRecord[]
  clearEncryptionHistory(): void
  showItemInFolder(filePath: string): void
}
