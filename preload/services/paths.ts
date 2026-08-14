/**
 * 文件路径校验与默认路径生成。
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import type { BatchOutputPath, FileInfo, FileMode, ValidatedFilePaths } from './types'

const DEFAULT_FILE_EXTENSION = 'enc'

/**
 * 将用户配置规范化为文件对话框和路径均可安全使用的单段后缀。
 *
 * @param {unknown} fileExtension 用户配置的后缀名。
 * @returns {string} 不含起始点号的后缀名。
 */
function normalizeFileExtension(fileExtension = DEFAULT_FILE_EXTENSION) {
  if (typeof fileExtension !== 'string') return DEFAULT_FILE_EXTENSION

  const normalized = fileExtension.trim().replace(/^\./, '')
  return /^[a-zA-Z][a-zA-Z0-9]{0,7}$/.test(normalized)
    ? normalized
    : DEFAULT_FILE_EXTENSION
}

/**
 * 规范化并校验输入、输出路径，同时创建输出目录。
 *
 * @param {string} sourcePath 输入文件路径。
 * @param {string} outputPath 输出文件路径。
 * @throws {Error} 路径缺失、输入不是文件或输出覆盖输入。
 */
function assertFilePaths(sourcePath: string, outputPath: string): ValidatedFilePaths {
  if (!sourcePath || !outputPath) throw new Error('请选择输入和输出文件')

  const source = path.resolve(sourcePath)
  const output = path.resolve(outputPath)
  const normalize = (value: string) => process.platform === 'win32' ? value.toLowerCase() : value

  if (normalize(source) === normalize(output)) {
    throw new Error('输出文件不能覆盖输入文件')
  }

  const stat = fs.statSync(source)
  if (!stat.isFile()) throw new Error('输入路径不是文件')

  fs.mkdirSync(path.dirname(output), { recursive: true })
  return { source, output, sourceSize: stat.size }
}

/**
 * 尽力删除失败操作产生的不完整输出，不覆盖原始错误。
 *
 * @param {string} filePath 待清理文件路径。
 * @returns {void}
 */
function removeIncompleteFile(filePath: string) {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
  } catch {
    // 保留原始错误，清理失败不应掩盖失败原因。
  }
}

/**
 * 为已存在的文件路径追加递增编号，避免默认输出覆盖现有文件。
 *
 * @param {string} filePath 候选路径。
 * @returns {string} 当前不存在的可用路径。
 */
function availablePath(filePath: string) {
  if (!fs.existsSync(filePath)) return filePath

  const parsed = path.parse(filePath)
  let index = 1
  let candidate
  do {
    candidate = path.join(parsed.dir, `${parsed.name} (${index})${parsed.ext}`)
    index += 1
  } while (fs.existsSync(candidate))
  return candidate
}

function normalizeOriginalExtension(originalExtension = '') {
  if (typeof originalExtension !== 'string'
    || (originalExtension && !originalExtension.startsWith('.'))
    || /[\\/\0]/.test(originalExtension)
    || Buffer.byteLength(originalExtension, 'utf8') > 1024) {
    return ''
  }
  return originalExtension
}

function decryptedOutputName(
  sourcePath: string,
  fileExtension: string,
  originalExtension = '',
) {
  const parsed = path.parse(sourcePath)
  const hasEncryptedExtension = parsed.ext.toLowerCase() === `.${fileExtension.toLowerCase()}`
  const baseName = hasEncryptedExtension ? parsed.name : `${parsed.base}.decrypted`
  const restoredExtension = normalizeOriginalExtension(originalExtension)
  return restoredExtension && !baseName.toLowerCase().endsWith(restoredExtension.toLowerCase())
    ? `${baseName}${restoredExtension}`
    : baseName
}

function normalizedPathKey(filePath: string) {
  const resolved = path.resolve(filePath)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

function availableBatchPath(filePath: string, reservedPaths: Set<string>) {
  const parsed = path.parse(filePath)
  let index = 0
  let candidate = filePath
  while (fs.existsSync(candidate) || reservedPaths.has(normalizedPathKey(candidate))) {
    index += 1
    candidate = path.join(parsed.dir, `${parsed.name} (${index})${parsed.ext}`)
  }
  reservedPaths.add(normalizedPathKey(candidate))
  return candidate
}

/**
 * 根据操作模式生成不覆盖现有文件的默认输出路径。
 *
 * @param {string} sourcePath 输入文件路径。
 * @param {'encrypt'|'decrypt'} mode 操作模式。
 * @param {string} [fileExtension='enc'] 不含起始点号的加密文件后缀。
 * @returns {string} 默认输出绝对路径。
 */
function defaultOutputPath(
  sourcePath: string,
  mode: FileMode,
  fileExtension = DEFAULT_FILE_EXTENSION,
  originalExtension = '',
) {
  const source = path.resolve(sourcePath)
  const normalizedExtension = normalizeFileExtension(fileExtension)
  if (mode === 'encrypt') return availablePath(`${source}.${normalizedExtension}`)

  return availablePath(path.join(
    path.dirname(source),
    decryptedOutputName(source, normalizedExtension, originalExtension),
  ))
}

/**
 * 一次性规划批量任务的全部输出路径，避免磁盘文件和批次内部发生重名覆盖。
 */
function batchOutputPaths(
  sourcePaths: string[],
  mode: FileMode,
  outputDirectory?: string,
  fileExtension = DEFAULT_FILE_EXTENSION,
  originalExtensions: string[] = [],
): BatchOutputPath[] {
  if (!Array.isArray(sourcePaths) || sourcePaths.length === 0) {
    throw new Error('请选择要处理的文件')
  }
  if (!['encrypt', 'decrypt'].includes(mode)) throw new Error('文件处理模式无效')
  if (!Array.isArray(originalExtensions)
    || (originalExtensions.length > 0 && originalExtensions.length !== sourcePaths.length)) {
    throw new Error('原文件后缀列表无效')
  }

  const normalizedExtension = normalizeFileExtension(fileExtension)
  const resolvedOutputDirectory = outputDirectory ? path.resolve(outputDirectory) : ''
  if (resolvedOutputDirectory) {
    const stat = fs.statSync(resolvedOutputDirectory)
    if (!stat.isDirectory()) throw new Error('输出位置不是文件夹')
  }

  const sources = sourcePaths.map((sourcePath) => fileInfo(sourcePath).path)
  const sourceKeys = new Set(sources.map(normalizedPathKey))
  if (sourceKeys.size !== sources.length) throw new Error('待处理文件中存在重复项')

  const reservedPaths = new Set(sourceKeys)
  return sources.map((sourcePath, index) => {
    const parsed = path.parse(sourcePath)
    const directory = resolvedOutputDirectory || parsed.dir
    const outputName = mode === 'encrypt'
      ? `${parsed.base}.${normalizedExtension}`
      : decryptedOutputName(
          sourcePath,
          normalizedExtension,
          originalExtensions[index],
        )
    return {
      sourcePath,
      outputPath: availableBatchPath(path.join(directory, outputName), reservedPaths),
    }
  })
}

/**
 * 读取并校验普通文件的基础信息。
 *
 * @param {string} filePath 文件路径。
 * @returns {FileInfo} 文件信息。
 */
function fileInfo(filePath: string): FileInfo {
  const resolvedPath = path.resolve(filePath)
  const stat = fs.statSync(resolvedPath)
  if (!stat.isFile()) throw new Error('所选路径不是文件')

  return {
    path: resolvedPath,
    name: path.basename(resolvedPath),
    size: stat.size,
  }
}

export {
  assertFilePaths,
  removeIncompleteFile,
  availablePath,
  normalizeFileExtension,
  normalizeOriginalExtension,
  defaultOutputPath,
  batchOutputPaths,
  fileInfo,
}
