/**
 * 流式与 Buffer 压缩适配。
 */

import {
  createGzip,
  createGunzip,
  createBrotliCompress,
  createBrotliDecompress,
  gzipSync,
  gunzipSync,
  brotliCompressSync,
  brotliDecompressSync,
} from 'node:zlib'
import type { Transform } from 'node:stream'
import type { CompressionType } from '../../shared/preload-api'

/**
 * @param {0|1|2} compressionType 压缩方式编号。
 * @returns {import('node:stream').Transform|null} 压缩流；不压缩时返回 null。
 */
function createCompressionStream(compressionType: CompressionType): Transform | null {
  if (compressionType === 0) return createGzip()
  if (compressionType === 1) return createBrotliCompress()
  return null
}

/**
 * @param {0|1|2} compressionType 压缩方式编号。
 * @returns {import('node:stream').Transform|null} 解压流；不压缩时返回 null。
 */
function createDecompressionStream(compressionType: CompressionType): Transform | null {
  if (compressionType === 0) return createGunzip()
  if (compressionType === 1) return createBrotliDecompress()
  return null
}

/**
 * 同步压缩内存 Buffer，供文本加密使用。
 *
 * @param {Buffer} buffer 原始数据。
 * @param {0|1|2} compressionType 压缩方式编号。
 * @returns {Buffer} 压缩后数据；编号 2 时返回原 Buffer。
 */
function compressBuffer(buffer: Buffer, compressionType: CompressionType): Buffer {
  if (compressionType === 0) return gzipSync(buffer)
  if (compressionType === 1) return brotliCompressSync(buffer)
  return buffer
}

/**
 * 同步解压内存 Buffer，供文本解密使用。
 *
 * @param {Buffer} buffer 已解密数据。
 * @param {0|1|2} compressionType 压缩方式编号。
 * @returns {Buffer} 解压后数据；编号 2 时返回原 Buffer。
 */
function decompressBuffer(buffer: Buffer, compressionType: CompressionType): Buffer {
  if (compressionType === 0) return gunzipSync(buffer)
  if (compressionType === 1) return brotliDecompressSync(buffer)
  return buffer
}

export {
  createCompressionStream,
  createDecompressionStream,
  compressBuffer,
  decompressBuffer,
}
