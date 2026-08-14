/**
 * 文件流进度统计。
 */

import { Transform } from 'node:stream'
import type { ProgressCallback } from '../../shared/preload-api'

/**
 * 安全调用进度回调，调用方异常不会中断文件处理。
 *
 * @param {((percentage: number) => void)|undefined} onProgress 进度回调。
 * @param {number} percentage 0 到 100 的整数百分比。
 * @returns {void}
 */
function reportProgress(onProgress: ProgressCallback | undefined, percentage: number) {
  if (typeof onProgress !== 'function') return
  try {
    onProgress(percentage)
  } catch {
    // 进度回调异常不应中断文件处理。
  }
}

/**
 * 创建透明 Transform 流，根据已读取的源文件字节报告进度。
 * 流处理中最高报告 99%，只有整个认证/写入流程完成后才报告 100%。
 *
 * @param {number} totalBytes 源数据总字节数。
 * @param {(percentage: number) => void} onProgress 进度回调。
 * @returns {Transform} 不改变数据内容的进度统计流。
 */
function createProgressStream(totalBytes: number, onProgress: ProgressCallback) {
  let processedBytes = 0
  let lastPercentage = -1
  reportProgress(onProgress, 0)

  return new Transform({
    transform(chunk, encoding, callback) {
      processedBytes += chunk.length
      const percentage = totalBytes > 0
        ? Math.min(99, Math.floor((processedBytes / totalBytes) * 100))
        : 99
      if (percentage !== lastPercentage) {
        lastPercentage = percentage
        reportProgress(onProgress, percentage)
      }
      callback(null, chunk)
    },
  })
}

export { reportProgress, createProgressStream }
