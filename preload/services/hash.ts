/**
 * 文件摘要计算。
 */

import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileInfo } from './paths'
import type { HashResult, HashSuccess } from './types'

/**
 * 单次流式读取文件并同时计算 MD5、SHA-1、SHA-256。
 *
 * @param {string} filePath 文件路径。
 */
function calculateFileHash(filePath: string): Promise<HashSuccess> {
  const info = fileInfo(filePath)
  const hashes = {
    md5: crypto.createHash('md5'),
    sha1: crypto.createHash('sha1'),
    sha256: crypto.createHash('sha256'),
  }

  return new Promise<HashSuccess>((resolve, reject) => {
    const stream = fs.createReadStream(info.path)
    stream.on('data', (chunk) => {
      for (const hash of Object.values(hashes)) hash.update(chunk)
    })
    stream.on('error', reject)
    stream.on('end', () => {
      resolve({
        ...info,
        md5: hashes.md5.digest('hex'),
        sha1: hashes.sha1.digest('hex'),
        sha256: hashes.sha256.digest('hex'),
      })
    })
  })
}

/**
 * 顺序计算多个文件哈希；单个文件失败会转换为结果项，不中断其余文件。
 *
 * @param {string[]} filePaths 文件路径列表。
 */
async function calculateFileHashes(filePaths: string[]): Promise<HashResult[]> {
  if (!Array.isArray(filePaths) || filePaths.length === 0) {
    throw new Error('请选择要校验的文件')
  }

  const results: HashResult[] = []
  for (const filePath of filePaths) {
    try {
      results.push(await calculateFileHash(filePath))
    } catch (error) {
      results.push({
        path: path.resolve(filePath),
        name: path.basename(filePath),
        error: error.message,
      })
    }
  }
  return results
}

export { calculateFileHashes }
