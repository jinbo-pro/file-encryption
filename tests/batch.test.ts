import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { batchOutputPaths, defaultOutputPath } from '../preload/services/paths'
import { decryptFile, encryptFile, inspectEncryptedFile } from '../preload/services/file'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

async function main() {
  const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'fenc-batch-'))
  try {
    const firstDirectory = path.join(testDirectory, 'first')
    const secondDirectory = path.join(testDirectory, 'second')
    const outputDirectory = path.join(testDirectory, 'output')
    fs.mkdirSync(firstDirectory)
    fs.mkdirSync(secondDirectory)
    fs.mkdirSync(outputDirectory)

    const firstSource = path.join(firstDirectory, 'report.txt')
    const secondSource = path.join(secondDirectory, 'report.txt')
    fs.writeFileSync(firstSource, 'first')
    fs.writeFileSync(secondSource, 'second')

    const plans = batchOutputPaths(
      [firstSource, secondSource],
      'encrypt',
      outputDirectory,
      'enc',
    )
    assert(path.basename(plans[0].outputPath) === 'report.txt.enc', '首个批量输出名称错误')
    assert(path.basename(plans[1].outputPath) === 'report.txt (1).enc', '批次内同名文件未避让')

    fs.writeFileSync(plans[0].outputPath, 'occupied')
    const occupiedPlans = batchOutputPaths([firstSource], 'encrypt', outputDirectory, 'enc')
    assert(
      path.basename(occupiedPlans[0].outputPath) === 'report.txt (1).enc',
      '已有输出文件未避让',
    )

    const encryptedSource = path.join(firstDirectory, 'archive.enc')
    fs.writeFileSync(encryptedSource, 'placeholder')
    const decryptPlans = batchOutputPaths([encryptedSource], 'decrypt', outputDirectory, 'enc')
    assert(path.basename(decryptPlans[0].outputPath) === 'archive', '解密输出名称错误')

    const extensionSource = path.join(testDirectory, 'document.数据')
    const renamedEncryptedPath = path.join(testDirectory, 'renamed.enc')
    fs.writeFileSync(extensionSource, 'extension metadata')
    await encryptFile({
      sourcePath: extensionSource,
      outputPath: renamedEncryptedPath,
      password: 'extension-password',
      compressionType: 2,
    })
    const encryptedInfo = inspectEncryptedFile(renamedEncryptedPath)
    assert(encryptedInfo.originalExtension === '.数据', '文件检查未返回原始后缀')
    assert(
      path.basename(defaultOutputPath(
        renamedEncryptedPath,
        'decrypt',
        'enc',
        encryptedInfo.originalExtension,
      )) === 'renamed.数据',
      '单文件解密未从配置区恢复后缀',
    )
    const restoredPlans = batchOutputPaths(
      [renamedEncryptedPath],
      'decrypt',
      outputDirectory,
      'enc',
      [encryptedInfo.originalExtension],
    )
    assert(path.basename(restoredPlans[0].outputPath) === 'renamed.数据', '批量解密未恢复后缀')
    await decryptFile({
      sourcePath: renamedEncryptedPath,
      outputPath: restoredPlans[0].outputPath,
      password: 'extension-password',
    })
    assert(
      fs.readFileSync(restoredPlans[0].outputPath, 'utf8') === 'extension metadata',
      '使用恢复后的后缀执行解密失败',
    )

    const largeSource = path.join(testDirectory, 'large.bin')
    const cancelledOutput = path.join(testDirectory, 'large.bin.enc')
    fs.writeFileSync(largeSource, crypto.randomBytes(4 * 1024 * 1024))
    const controller = new AbortController()
    let abortError = false
    try {
      await encryptFile({
        sourcePath: largeSource,
        outputPath: cancelledOutput,
        password: 'batch-cancel-password',
        compressionType: 2,
        signal: controller.signal,
        onProgress: (percentage) => {
          if (percentage >= 1) controller.abort()
        },
      })
    } catch (error) {
      abortError = error.name === 'AbortError'
    }
    assert(abortError, '取消信号没有中止正在处理的文件')
    assert(!fs.existsSync(cancelledOutput), '取消后仍保留了不完整输出')
    assert(fs.existsSync(largeSource), '取消操作不应删除输入文件')

    console.log('batch tests passed')
  } finally {
    fs.rmSync(testDirectory, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
