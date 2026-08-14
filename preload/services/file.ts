/**
 * 文件加解密服务工作流。
 */

import * as fs from 'node:fs'
import { MIN_ENCRYPTED_SIZE } from '../config'
import {
  aesGcmFileEncrypt,
  aesGcmFileDecrypt,
  x25519FileEncrypt,
  x25519FileDecrypt,
  readEncryptedFileHeader,
  changeEncryptedFilePassword,
} from '../utils'
import {
  assertPassword,
  assertEncryptionOptions,
  assertScryptProfile,
} from './validation'
import { assertFilePaths, removeIncompleteFile, fileInfo } from './paths'
import { resolveManagedPrivateKey } from './keys'
import type {
  ChangeFilePasswordOptions,
  ChangeFilePasswordResult,
  DecryptFileOptions,
  EncryptedFileInfo,
  EncryptFileOptions,
  FileCryptoResult,
} from './types'

/**
 * 通过 FENC 魔数和协议头校验所选文件，并返回基础协议信息。
 *
 * @param {string} filePath 待检查文件。
 */
function inspectEncryptedFile(filePath: string): EncryptedFileInfo {
  const info = fileInfo(filePath)
  if (info.size < MIN_ENCRYPTED_SIZE) throw new Error('加密文件头不完整')
  const { decodedConfig } = readEncryptedFileHeader(info.path)
  return {
    ...info,
    protocolVersion: decodedConfig.protocolVersion,
    compressionType: decodedConfig.compressionType,
    encryptionType: decodedConfig.encryptionType,
    scryptProfile: decodedConfig.scryptProfile,
    originalExtension: decodedConfig.originalExtension,
    recipientFingerprint: decodedConfig.encryptionType === 1
      ? decodedConfig.recipientFingerprint.toString('hex')
      : '',
  }
}

/**
 * 校验旧密码后原位更新加密文件的 DEK 包装头。
 *
 */
function changeFilePassword(options: ChangeFilePasswordOptions): ChangeFilePasswordResult {
  const {
    filePath,
    currentPassword,
    newPassword,
    scryptProfile = 0,
  } = options || {}
  assertPassword(currentPassword)
  assertPassword(newPassword)
  if (currentPassword === newPassword) throw new Error('新密码不能与当前密码相同')
  assertScryptProfile(scryptProfile)
  const info = inspectEncryptedFile(filePath)
  if (info.encryptionType !== 0) throw new Error('公钥加密包不支持修改密码')

  try {
    const result = changeEncryptedFilePassword(
      info.path,
      currentPassword,
      newPassword,
      scryptProfile,
    )
    return { filePath: info.path, size: info.size, ...result, encryptionType: 0 }
  } catch (error) {
    if (error.message === '当前密码不正确') {
      throw new Error('密码修改失败，请检查当前密码是否正确或文件是否完整')
    }
    throw new Error(`密码修改失败：${error.message}`)
  }
}

/**
 * 校验路径和选项后流式加密文件，失败时删除不完整输出。
 *
 */
async function encryptFile(options: EncryptFileOptions): Promise<FileCryptoResult> {
  const {
    sourcePath,
    outputPath,
    password,
    publicKeyPem,
    compressionType = 2,
    encryptionType = 0,
    scryptProfile = 0,
    onProgress,
    signal,
  } = options || {}

  assertEncryptionOptions(compressionType, encryptionType, scryptProfile)
  if (encryptionType === 0) assertPassword(password)
  else if (typeof publicKeyPem !== 'string' || publicKeyPem.trim() === '') {
    throw new Error('请输入接收方公钥')
  }
  if (onProgress !== undefined && typeof onProgress !== 'function') {
    throw new Error('进度回调配置无效')
  }
  const { source, output, sourceSize } = assertFilePaths(sourcePath, outputPath)

  try {
    if (encryptionType === 0) {
      await aesGcmFileEncrypt(
        source,
        output,
        password!,
        compressionType,
        encryptionType,
        scryptProfile,
        onProgress,
        signal,
      )
    } else {
      await x25519FileEncrypt(source, output, publicKeyPem!, compressionType, onProgress, signal)
    }

    const encryptedInfo = inspectEncryptedFile(output)

    return {
      outputPath: output,
      sourceSize,
      outputSize: fs.statSync(output).size,
      compressionType,
      encryptionType,
      scryptProfile: encryptionType === 0 ? scryptProfile : 0,
      recipientFingerprint: encryptedInfo.recipientFingerprint,
    }
  } catch (error) {
    removeIncompleteFile(output)
    if (error.name === 'AbortError' || signal?.aborted) throw error
    throw new Error(`加密失败：${error.message}`)
  }
}

/**
 * 校验路径后流式解密文件，失败时删除不完整输出。
 *
 */
async function decryptFile(options: DecryptFileOptions): Promise<FileCryptoResult> {
  const {
    sourcePath,
    outputPath,
    password,
    privateKeyId,
    privateKeyPem,
    privateKeyPassphrase = '',
    onProgress,
    signal,
  } = options || {}
  if (onProgress !== undefined && typeof onProgress !== 'function') {
    throw new Error('进度回调配置无效')
  }
  const { source, output, sourceSize } = assertFilePaths(sourcePath, outputPath)

  if (sourceSize < MIN_ENCRYPTED_SIZE) throw new Error('加密文件头不完整')
  const encryptedInfo = inspectEncryptedFile(source)
  if (encryptedInfo.encryptionType === 0) assertPassword(password)
  else if ((!privateKeyId || typeof privateKeyId !== 'string')
    && (typeof privateKeyPem !== 'string' || privateKeyPem.trim() === '')) {
    throw new Error('请输入接收方私钥')
  }

  try {
    const result = encryptedInfo.encryptionType === 0
      ? await aesGcmFileDecrypt(source, output, password!, onProgress, signal)
      : await x25519FileDecrypt(
          source,
          output,
          privateKeyId ? resolveManagedPrivateKey(privateKeyId) : privateKeyPem!,
          privateKeyPassphrase,
          onProgress,
          signal,
        )
    const { compressionType, encryptionType, scryptProfile } = result

    return {
      outputPath: output,
      sourceSize,
      outputSize: fs.statSync(output).size,
      compressionType,
      encryptionType,
      scryptProfile,
    }
  } catch (error) {
    removeIncompleteFile(output)
    if (error.name === 'AbortError' || signal?.aborted) throw error
    if (encryptedInfo.encryptionType === 1) {
      throw new Error(`解密失败：${error.message}`)
    }
    throw new Error('解密失败，请检查密码是否正确或文件是否完整')
  }
}

export {
  encryptFile,
  decryptFile,
  inspectEncryptedFile,
  changeFilePassword,
}
