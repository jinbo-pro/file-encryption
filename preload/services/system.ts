/**
 * uTools 对话框与系统能力适配。
 */

import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { getHostAdapter } from '../host'
import { defaultOutputPath, fileInfo, normalizeFileExtension } from './paths'
import { readTextFile } from './text'
import type { FileInfo, FileMode, KeyType, SourceFileMode, TextFileInfo } from './types'

const MAX_KEY_FILE_SIZE = 64 * 1024

/**
 * 生成 24 字节熵的 URL-safe 随机密码。
 *
 * @returns {string} 32 个 Base64URL 字符组成的密码。
 */
function generateRandomPassword() {
  return crypto
    .randomBytes(24)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/**
 * 选择并读取单个 TXT 文件。
 *
 */
function selectTextFile(): TextFileInfo | null {
  const paths = getHostAdapter().openDialog({
    title: '选择文本文件',
    buttonLabel: '上传',
    filters: [{ name: '文本文件', extensions: ['txt'] }],
    properties: ['openFile'],
  })
  return paths?.[0] ? readTextFile(paths[0]) : null
}

function selectKeyFile(keyType: KeyType = 'public'): TextFileInfo | null {
  if (!['public', 'private'].includes(keyType)) throw new Error('密钥类型无效')
  const isPublic = keyType === 'public'
  const paths = getHostAdapter().openDialog({
    title: isPublic ? '选择接收方公钥' : '选择接收方私钥',
    buttonLabel: '选择',
    filters: [{ name: 'PEM 密钥文件', extensions: ['pem', 'pub', 'key'] }],
    properties: ['openFile'],
  })
  if (!paths?.[0]) return null

  const info = fileInfo(paths[0])
  if (info.size > MAX_KEY_FILE_SIZE) throw new Error('密钥文件不能超过 64 KB')
  const text = fs.readFileSync(info.path, 'utf8').replace(/^\uFEFF/, '')
  if (text.includes('\0')) throw new Error('密钥文件内容无效')
  return { ...info, text }
}

/**
 * 选择一个或多个待校验文件。
 *
 */
function selectHashFiles(): FileInfo[] {
  const paths = getHostAdapter().openDialog({
    title: '选择要校验的文件',
    buttonLabel: '选择',
    filters: [{ name: '所有文件', extensions: ['*'] }],
    properties: ['openFile', 'multiSelections'],
  })
  return paths?.map(fileInfo) || []
}

/**
 * 根据加密或解密模式选择一个输入文件。
 *
 * @param {'encrypt'|'decrypt'} [mode='encrypt'] 操作模式。
 */
function selectSourceFile(mode: SourceFileMode = 'encrypt'): FileInfo | null {
  const isPasswordChange = mode === 'password-change'
  const paths = getHostAdapter().openDialog({
    title: isPasswordChange
      ? '选择要修改密码的加密包'
      : mode === 'decrypt' ? '选择要解密的文件' : '选择要加密的文件',
    buttonLabel: '选择',
    filters: [{ name: '所有文件', extensions: ['*'] }],
    properties: ['openFile'],
  })
  return paths?.[0] ? fileInfo(paths[0]) : null
}

function selectSourceFiles(mode: FileMode = 'encrypt'): FileInfo[] {
  if (!['encrypt', 'decrypt'].includes(mode)) throw new Error('文件处理模式无效')
  const paths = getHostAdapter().openDialog({
    title: mode === 'decrypt' ? '选择要解密的文件' : '选择要加密的文件',
    buttonLabel: '选择',
    filters: [{ name: '所有文件', extensions: ['*'] }],
    properties: ['openFile', 'multiSelections'],
  })
  return paths?.map(fileInfo) || []
}

function selectOutputDirectory(defaultPath?: string): string | null {
  const paths = getHostAdapter().openDialog({
    title: '选择输出文件夹',
    buttonLabel: '选择',
    defaultPath,
    properties: ['openDirectory', 'createDirectory'],
  })
  return paths?.[0] ? path.resolve(paths[0]) : null
}

/**
 * 打开文件保存对话框。
 *
 * @param {string} sourcePath 输入文件路径。
 * @param {'encrypt'|'decrypt'} [mode='encrypt'] 操作模式。
 * @param {string} [fileExtension='enc'] 不含起始点号的加密文件后缀。
 * @returns {string|null} 用户选择的输出路径；取消时返回 null。
 */
function selectOutputFile(
  sourcePath: string,
  mode: FileMode = 'encrypt',
  fileExtension = 'enc',
  originalExtension = '',
): string | null {
  const normalizedExtension = normalizeFileExtension(fileExtension)
  const result = getHostAdapter().saveDialog({
    title: mode === 'encrypt' ? '保存加密文件' : '保存解密文件',
    buttonLabel: '保存',
    defaultPath: defaultOutputPath(sourcePath, mode, normalizedExtension, originalExtension),
    filters: mode === 'encrypt'
      ? [{ name: '加密文件', extensions: [normalizedExtension] }]
      : [{ name: '所有文件', extensions: ['*'] }],
  })
  return result || null
}

/**
 * 在系统文件管理器中定位指定文件。
 *
 * @param {string} filePath 文件路径。
 * @returns {void}
 */
function showItemInFolder(filePath: string) {
  getHostAdapter().showItemInFolder(path.resolve(filePath))
}

export {
  generateRandomPassword,
  selectTextFile,
  selectKeyFile,
  selectHashFiles,
  selectSourceFile,
  selectSourceFiles,
  selectOutputFile,
  selectOutputDirectory,
  showItemInFolder,
}
