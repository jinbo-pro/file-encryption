import type { PreloadServices } from './types'
import {
  getEncryptionHistory,
  addEncryptionHistory,
  deleteEncryptionHistory,
  clearEncryptionHistory,
} from './history'
import { batchOutputPaths, defaultOutputPath, fileInfo } from './paths'
import { calculateFileHashes } from './hash'
import {
  listManagedKeys,
  generateManagedKey,
  importManagedPrivateKey,
  importManagedPublicKey,
  renameManagedKey,
  getManagedPublicKey,
  exportManagedKey,
  deleteManagedKey,
  clearManagedKeys,
  inspectPublicKey,
} from './keys'
import { readTextFile, saveTextResult, encryptText, decryptText } from './text'
import {
  encryptFile,
  decryptFile,
  inspectEncryptedFile,
  changeFilePassword,
} from './file'
import {
  generateRandomPassword,
  selectTextFile,
  selectKeyFile,
  selectHashFiles,
  selectSourceFile,
  selectSourceFiles,
  selectOutputFile,
  selectOutputDirectory,
  showItemInFolder,
} from './system'

export type {
  CryptoStorage,
  DecryptTextOptions,
  EncryptTextOptions,
  ExportManagedKeyOptions,
  GenerateManagedKeyOptions,
  ImportManagedPrivateKeyOptions,
  ImportManagedPublicKeyOptions,
  KeyMaterial,
  KeyRecord,
  SaveTextResultOptions,
  StoredHistoryRecord,
  ValidatedFilePaths,
} from './types'

export const services = {
  generateRandomPassword,
  selectTextFile,
  selectKeyFile,
  inspectPublicKey,
  listManagedKeys,
  generateManagedKey,
  importManagedPrivateKey,
  importManagedPublicKey,
  renameManagedKey,
  getManagedPublicKey,
  exportManagedKey,
  deleteManagedKey,
  clearManagedKeys,
  selectHashFiles,
  selectSourceFile,
  selectSourceFiles,
  selectOutputFile,
  selectOutputDirectory,
  getDefaultOutputPath: defaultOutputPath,
  getBatchOutputPaths: batchOutputPaths,
  getFileInfo: fileInfo,
  encryptFile,
  decryptFile,
  inspectEncryptedFile,
  changeFilePassword,
  encryptText,
  decryptText,
  saveTextResult,
  calculateFileHashes,
  getEncryptionHistory,
  addEncryptionHistory,
  deleteEncryptionHistory,
  clearEncryptionHistory,
  showItemInFolder,
} satisfies PreloadServices
