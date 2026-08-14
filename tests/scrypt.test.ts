import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import {
  FILE_MAGIC,
  MAGIC_SIZE,
  PROTOCOL_VERSION_SIZE,
  CURRENT_PROTOCOL_VERSION,
  CONFIG_LENGTH_OFFSET,
  CONFIG_LENGTH_SIZE,
  PASSWORD_CONFIG_SIZE,
  PUBLIC_KEY_CONFIG_SIZE,
  MIN_HEADER_SIZE,
  MIN_ENCRYPTED_SIZE,
  DEFAULT_CHUNK_SIZE,
  CHUNK_HEADER_SIZE,
  encodeFileConfig,
  decodeProtocolVersion,
  decodeFileConfig,
  aesGcmBufferEncrypt,
  aesGcmBufferDecrypt,
  aesGcmFileEncrypt,
  aesGcmFileDecrypt,
  x25519FileEncrypt,
  x25519FileDecrypt,
  readEncryptedFileHeader,
  changeEncryptedFilePassword,
  rewrapEncryptionHeader,
} from '../preload/utils'
import {
  AUTH_TAG_SIZE,
  COMPRESSION_TYPE_OFFSET,
  ENCRYPTION_TYPE_OFFSET,
  ENCRYPTION_CONFIGS,
  PAYLOAD_NONCE_PREFIX_SIZE,
  SCRYPT_PROFILE_OFFSET,
  SALT_OFFSET,
  SALT_SIZE,
  IV_SIZE,
  RECIPIENT_FINGERPRINT_OFFSET,
  WRAPPED_DEK_OFFSET,
} from '../preload/config'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const resultDir = path.join(currentDir, 'result')
fs.mkdirSync(resultDir, { recursive: true })

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function assertThrows(callback, message) {
  try {
    callback()
  } catch {
    return
  }
  throw new Error(message)
}

async function assertRejects(callback, message) {
  try {
    await callback()
  } catch {
    return
  }
  throw new Error(message)
}

async function main() {
  assert(FILE_MAGIC === 'FENC', `文件魔数应为 FENC，实际为 ${FILE_MAGIC}`)
  assert(MAGIC_SIZE === 4, `文件魔数应为 4 字节，实际为 ${MAGIC_SIZE}`)
  assert(PROTOCOL_VERSION_SIZE === 2, `协议版本字段应为 2 字节，实际为 ${PROTOCOL_VERSION_SIZE}`)
  assert(CURRENT_PROTOCOL_VERSION === 1, `当前协议版本应为 1，实际为 ${CURRENT_PROTOCOL_VERSION}`)
  assert(CONFIG_LENGTH_SIZE === 2, '配置区长度字段应为 2 字节')
  assert(PASSWORD_CONFIG_SIZE === 105, `密码最小配置区应为 105 字节，实际为 ${PASSWORD_CONFIG_SIZE}`)
  assert(PUBLIC_KEY_CONFIG_SIZE === 188, `公钥最小配置区应为 188 字节，实际为 ${PUBLIC_KEY_CONFIG_SIZE}`)
  assert(MIN_HEADER_SIZE === 109, `最小头部应为 109 字节，实际为 ${MIN_HEADER_SIZE}`)
  assert(MIN_ENCRYPTED_SIZE === 130, `最小密文应为 130 字节，实际为 ${MIN_ENCRYPTED_SIZE}`)
  assert(DEFAULT_CHUNK_SIZE === 1024 * 1024, '默认分块大小错误')
  assert(CHUNK_HEADER_SIZE === 5, '分块头大小错误')
  assert(Object.keys(ENCRYPTION_CONFIGS).length === 2, '应支持密码与 X25519 两种密钥保护方式')
  assert(ENCRYPTION_CONFIGS[0].name.includes('password'), '编号 0 应为密码保护')
  assert(ENCRYPTION_CONFIGS[1].name.includes('x25519'), '编号 1 应为 X25519 公钥保护')

  const configA = encodeFileConfig(0, 0)
  const configB = encodeFileConfig(0, 0)
  const decoded = decodeFileConfig(configA)
  assert(configA.length === PASSWORD_CONFIG_SIZE, '密码配置区包含了额外预留字段')
  assert(configA.readUInt16BE(0) === 1, '协议版本字段错误')
  assert(configA.readUInt16BE(CONFIG_LENGTH_OFFSET) === PASSWORD_CONFIG_SIZE, '密码配置长度未写入')
  assert(decodeProtocolVersion(configA) === 1, '协议版本解析错误')
  assert(decoded.protocolVersion === 1, '配置区协议版本错误')
  assert(configA[COMPRESSION_TYPE_OFFSET] === 0 && configA[ENCRYPTION_TYPE_OFFSET] === 0, '压缩或加密编号错误')
  assert(configA[SCRYPT_PROFILE_OFFSET] === 0, '默认 scrypt 档位错误')
  assert(decoded.scryptParams.logN === 14, 'logN 默认值错误')
  assert(decoded.scryptParams.r === 8, 'r 默认值错误')
  assert(decoded.scryptParams.p === 1, 'p 默认值错误')
  assert(decoded.scryptParams.dkLen === 32, 'dkLen 默认值错误')
  assert(decoded.salt.length === 24, 'salt 默认长度错误')
  assert(decoded.chunkSize === DEFAULT_CHUNK_SIZE, '默认分块大小未写入配置区')
  assert(decoded.payloadNoncePrefix.length === PAYLOAD_NONCE_PREFIX_SIZE, 'payload nonce 前缀长度错误')
  assert(decoded.wrapIv.length === IV_SIZE, 'wrap IV 长度错误')
  assert(decoded.wrappedDek.length === 32, 'wrapped DEK 长度错误')
  assert(decoded.wrapAuthTag.length === AUTH_TAG_SIZE, 'wrap AuthTag 长度错误')
  assert(decoded.recipientFingerprint.length === 0, '密码配置不应包含接收方指纹')
  assert(decoded.ephemeralPublicKey.length === 0, '密码配置不应包含临时公钥')
  assert(decoded.hkdfSalt.length === 0, '密码配置不应包含 HKDF salt')
  assert(decoded.originalExtension === '', '默认配置的原文件后缀应为空')
  assert(!configA.subarray(SALT_OFFSET, SALT_OFFSET + SALT_SIZE)
    .equals(configB.subarray(SALT_OFFSET, SALT_OFFSET + SALT_SIZE)), '每次加密应生成不同 salt')
  assert(!decoded.payloadNoncePrefix.equals(decodeFileConfig(configB).payloadNoncePrefix), 'payload nonce 前缀未随机生成')
  assert(!decoded.wrapIv.equals(decodeFileConfig(configB).wrapIv), 'wrap IV 未随机生成')

  const extensionConfig = encodeFileConfig(2, 0, 0, {}, '.数据')
  assert(
    extensionConfig.length === PASSWORD_CONFIG_SIZE + Buffer.byteLength('.数据'),
    'UTF-8 原文件后缀未按实际字节数扩展配置区',
  )
  assert(decodeFileConfig(extensionConfig).originalExtension === '.数据', '原文件后缀解析错误')
  assertThrows(() => encodeFileConfig(2, 0, 0, {}, 'txt'), '接受了没有点号的原文件后缀')
  assertThrows(() => encodeFileConfig(2, 0, 0, {}, '.bad/name'), '接受了包含路径分隔符的后缀')

  const expectedProfiles = [
    { code: 0, logN: 14, name: 'standard' },
    { code: 1, logN: 13, name: 'performance' },
    { code: 2, logN: 16, name: 'secure' },
  ]
  for (const expected of expectedProfiles) {
    const profileConfig = encodeFileConfig(2, 0, expected.code)
    const profile = decodeFileConfig(profileConfig)
    assert(profileConfig[SCRYPT_PROFILE_OFFSET] === expected.code, `scrypt 档位 ${expected.code} 未写入配置区`)
    assert(profile.scryptProfile === expected.code, `scrypt 档位 ${expected.code} 解码错误`)
    assert(profile.scryptParams.name === expected.name, `scrypt 档位 ${expected.code} 名称错误`)
    assert(profile.scryptParams.logN === expected.logN, `scrypt 档位 ${expected.code} logN 错误`)
    assert(profile.scryptParams.r === 8, `scrypt 档位 ${expected.code} r 错误`)
    assert(profile.scryptParams.p === 1, `scrypt 档位 ${expected.code} p 错误`)
    assert(profile.scryptParams.dkLen === 32, `scrypt 档位 ${expected.code} dkLen 错误`)
    assert(profile.salt.length === 24, `scrypt 档位 ${expected.code} salt 长度错误`)
  }
  assertThrows(() => encodeFileConfig(2, 0, 3), '接受了未知 scrypt 档位')
  assertThrows(() => encodeFileConfig(2, 2, 0), '接受了未知加密方式编号')
  const unknownVersionConfig = Buffer.from(configA)
  unknownVersionConfig.writeUInt16BE(2, 0)
  assertThrows(() => decodeFileConfig(unknownVersionConfig), '接受了未知协议版本')
  const invalidLengthConfig = Buffer.from(configA)
  invalidLengthConfig.writeUInt16BE(PASSWORD_CONFIG_SIZE + 1, CONFIG_LENGTH_OFFSET)
  assertThrows(() => decodeFileConfig(invalidLengthConfig), '接受了错误的配置区长度')

  const source = Buffer.from('scrypt 文件与文本测试\n'.repeat(1000))
  const compressions = [0, 1, 2]
  const encryptions = [0]
  let profileIndex = 0
  for (const compressionType of compressions) {
    for (const encryptionType of encryptions) {
      const scryptProfile = profileIndex % 3
      profileIndex += 1
      const encrypted = aesGcmBufferEncrypt(
        source,
        'buffer-password',
        compressionType,
        encryptionType,
        scryptProfile,
      )
      assert(encrypted.subarray(0, MAGIC_SIZE).toString('ascii') === FILE_MAGIC, '密文魔数错误')
      const result = aesGcmBufferDecrypt(encrypted, 'buffer-password')
      assert(result.data.equals(source), `${compressionType}/${encryptionType} Buffer 往返失败`)
      assert(result.compressionType === compressionType, `${compressionType} 压缩编号错误`)
      assert(result.encryptionType === encryptionType, `${encryptionType} 加密编号错误`)
      assert(result.scryptProfile === scryptProfile, `${compressionType}/${encryptionType} scrypt 档位错误`)
      assertThrows(
        () => aesGcmBufferDecrypt(encrypted, 'wrong-password'),
        `${compressionType}/${encryptionType} 接受了错误密码`,
      )
    }
  }

  const randomA = aesGcmBufferEncrypt(source, 'random-test', 2, 0, 0)
  const randomB = aesGcmBufferEncrypt(source, 'random-test', 2, 0, 0)
  const randomConfigA = decodeFileConfig(randomA.subarray(MAGIC_SIZE, MAGIC_SIZE + PASSWORD_CONFIG_SIZE))
  const randomConfigB = decodeFileConfig(randomB.subarray(MAGIC_SIZE, MAGIC_SIZE + PASSWORD_CONFIG_SIZE))
  assert(!randomConfigA.salt.equals(randomConfigB.salt), 'salt 未随机生成')
  assert(!randomConfigA.payloadNoncePrefix
    .equals(randomConfigB.payloadNoncePrefix), 'payload nonce 前缀未随机生成')
  const invalidMagic = Buffer.from(randomA)
  invalidMagic[0] ^= 0xff
  assertThrows(() => aesGcmBufferDecrypt(invalidMagic, 'random-test'), '接受了错误的文件魔数')

  const passwordHeaderSize = MAGIC_SIZE + PASSWORD_CONFIG_SIZE
  const rewrappedHeader = rewrapEncryptionHeader(
    randomA.subarray(0, passwordHeaderSize),
    'random-test',
    'changed-buffer-password',
    2,
  )
  const rewrappedBuffer = Buffer.concat([rewrappedHeader, randomA.subarray(passwordHeaderSize)])
  assert(
    rewrappedBuffer.subarray(passwordHeaderSize).equals(randomA.subarray(passwordHeaderSize)),
    'Buffer 改密不应修改 payload',
  )
  assert(
    aesGcmBufferDecrypt(rewrappedBuffer, 'changed-buffer-password').data.equals(source),
    'Buffer 改密后无法使用新密码解密',
  )
  assertThrows(
    () => aesGcmBufferDecrypt(rewrappedBuffer, 'random-test'),
    'Buffer 改密后仍接受旧密码',
  )

  const invalidWrappedDek = Buffer.from(randomA)
  invalidWrappedDek[MAGIC_SIZE + WRAPPED_DEK_OFFSET] ^= 0xff
  assertThrows(() => aesGcmBufferDecrypt(invalidWrappedDek, 'random-test'), '接受了篡改的 wrapped DEK')

  const emptyEncrypted = aesGcmBufferEncrypt(Buffer.alloc(0), 'empty-password', 2, 0, 0)
  assert(emptyEncrypted.length === MIN_ENCRYPTED_SIZE, '空 payload 密文大小错误')
  assert(emptyEncrypted.readUInt32BE(passwordHeaderSize) === 0, '空 payload 最终块长度错误')
  assert(emptyEncrypted[passwordHeaderSize + 4] === 1, '空 payload 缺少最终块标志')
  assert(aesGcmBufferDecrypt(emptyEncrypted, 'empty-password').data.length === 0, '空 Buffer 往返失败')

  const exactChunkSource = crypto.randomBytes(DEFAULT_CHUNK_SIZE)
  const exactChunkEncrypted = aesGcmBufferEncrypt(exactChunkSource, 'exact-password', 2, 0, 0)
  assert(exactChunkEncrypted.readUInt32BE(passwordHeaderSize) === DEFAULT_CHUNK_SIZE, '整块 payload 长度错误')
  assert(exactChunkEncrypted[passwordHeaderSize + 4] === 1, '整块 payload 应直接标记为最终块')
  assert(
    aesGcmBufferDecrypt(exactChunkEncrypted, 'exact-password').data.equals(exactChunkSource),
    '整块 Buffer 往返失败',
  )

  const multiChunkSource = crypto.randomBytes(DEFAULT_CHUNK_SIZE * 2 + 123)
  const multiChunkEncrypted = aesGcmBufferEncrypt(multiChunkSource, 'chunk-password', 2, 0, 0)
  const firstRecordOffset = passwordHeaderSize
  const firstLength = multiChunkEncrypted.readUInt32BE(firstRecordOffset)
  assert(firstLength === DEFAULT_CHUNK_SIZE, '第一块长度错误')
  assert(multiChunkEncrypted[firstRecordOffset + 4] === 0, '第一块错误标记为最终块')
  const secondRecordOffset = firstRecordOffset + CHUNK_HEADER_SIZE + firstLength + AUTH_TAG_SIZE
  const secondLength = multiChunkEncrypted.readUInt32BE(secondRecordOffset)
  assert(secondLength === DEFAULT_CHUNK_SIZE, '第二块长度错误')
  assert(multiChunkEncrypted[secondRecordOffset + 4] === 0, '第二块错误标记为最终块')
  const finalRecordOffset = secondRecordOffset + CHUNK_HEADER_SIZE + secondLength + AUTH_TAG_SIZE
  assert(multiChunkEncrypted.readUInt32BE(finalRecordOffset) === 123, '最终块长度错误')
  assert(multiChunkEncrypted[finalRecordOffset + 4] === 1, '最终块标志错误')
  assert(
    aesGcmBufferDecrypt(multiChunkEncrypted, 'chunk-password').data.equals(multiChunkSource),
    '多块 Buffer 往返失败',
  )
  const tamperedChunk = Buffer.from(multiChunkEncrypted)
  tamperedChunk[secondRecordOffset + CHUNK_HEADER_SIZE] ^= 0xff
  assertThrows(() => aesGcmBufferDecrypt(tamperedChunk, 'chunk-password'), '接受了篡改的 payload 块')
  const reorderedChunks = Buffer.concat([
    multiChunkEncrypted.subarray(0, firstRecordOffset),
    multiChunkEncrypted.subarray(secondRecordOffset, finalRecordOffset),
    multiChunkEncrypted.subarray(firstRecordOffset, secondRecordOffset),
    multiChunkEncrypted.subarray(finalRecordOffset),
  ])
  assertThrows(() => aesGcmBufferDecrypt(reorderedChunks, 'chunk-password'), '接受了乱序的 payload 块')
  assertThrows(
    () => aesGcmBufferDecrypt(multiChunkEncrypted.subarray(0, -1), 'chunk-password'),
    '接受了截断的最终块',
  )

  const sourcePath = path.join(resultDir, 'scrypt-source.txt')
  const encryptedPath = path.join(resultDir, 'scrypt-source.enc')
  const decryptedPath = path.join(resultDir, 'scrypt-source.decrypted.txt')
  fs.writeFileSync(sourcePath, multiChunkSource)
  const encryptProgress = []
  await aesGcmFileEncrypt(
    sourcePath,
    encryptedPath,
    'file-password',
    2,
    0,
    1,
    (value) => encryptProgress.push(value),
  )
  assert(fs.readFileSync(encryptedPath).subarray(0, MAGIC_SIZE).toString('ascii') === FILE_MAGIC, '加密文件魔数错误')
  const encryptedHeader = readEncryptedFileHeader(encryptedPath)
  assert(encryptedHeader.decodedConfig.originalExtension === '.txt', '文件原始后缀未写入配置区')
  const decryptProgress = []
  await aesGcmFileDecrypt(
    encryptedPath,
    decryptedPath,
    'file-password',
    (value) => decryptProgress.push(value),
  )
  assert(fs.readFileSync(decryptedPath).equals(multiChunkSource), '多块文件往返失败')
  assert(encryptProgress[0] === 0 && encryptProgress.at(-1) === 100, '加密进度错误')
  assert(decryptProgress[0] === 0 && decryptProgress.at(-1) === 100, '解密进度错误')

  const encryptedHeaderSize = encryptedHeader.headerSize
  const payloadBeforePasswordChange = fs.readFileSync(encryptedPath).subarray(encryptedHeaderSize)
  const fileBeforeWrongPassword = fs.readFileSync(encryptedPath)
  assertThrows(
    () => changeEncryptedFilePassword(
      encryptedPath,
      'wrong-password',
      'unused-password',
      0,
    ),
    '文件改密接受了错误的当前密码',
  )
  assert(
    fs.readFileSync(encryptedPath).equals(fileBeforeWrongPassword),
    '当前密码错误时修改了加密文件',
  )
  const changedConfig = changeEncryptedFilePassword(
    encryptedPath,
    'file-password',
    'changed-file-password',
    2,
  )
  assert(changedConfig.scryptProfile === 2, '文件改密未应用新的 scrypt 档位')
  assert(
    fs.readFileSync(encryptedPath).subarray(encryptedHeaderSize).equals(payloadBeforePasswordChange),
    '文件改密不应修改 payload',
  )
  await assertRejects(
    () => aesGcmFileDecrypt(encryptedPath, decryptedPath, 'file-password'),
    '文件改密后仍接受旧密码',
  )
  await aesGcmFileDecrypt(
    encryptedPath,
    decryptedPath,
    'changed-file-password',
  )
  assert(fs.readFileSync(decryptedPath).equals(multiChunkSource), '文件改密后新密码解密失败')

  const tamperedExtensionFile = Buffer.from(fs.readFileSync(encryptedPath))
  tamperedExtensionFile[encryptedHeaderSize - 1] ^= 0x01
  const tamperedExtensionPath = path.join(resultDir, 'extension-tampered.enc')
  fs.writeFileSync(tamperedExtensionPath, tamperedExtensionFile)
  await assertRejects(
    () => aesGcmFileDecrypt(tamperedExtensionPath, decryptedPath, 'changed-file-password'),
    '文件解密接受了篡改的原始后缀',
  )

  const recipient = crypto.generateKeyPairSync('x25519')
  const publicKeyPem = recipient.publicKey.export({ type: 'spki', format: 'pem' })
  const privateKeyPem = recipient.privateKey.export({
    type: 'pkcs8',
    format: 'pem',
    cipher: 'aes-256-cbc',
    passphrase: 'private-key-password',
  })
  const publicEncryptedPath = path.join(resultDir, 'x25519-source.enc')
  const publicDecryptedPath = path.join(resultDir, 'x25519-source.decrypted.txt')
  await x25519FileEncrypt(sourcePath, publicEncryptedPath, publicKeyPem, 2)
  const publicHeader = readEncryptedFileHeader(publicEncryptedPath)
  assert(publicHeader.decodedConfig.encryptionType === 1, 'X25519 文件加密方式编号错误')
  const expectedPublicConfigSize = PUBLIC_KEY_CONFIG_SIZE + Buffer.byteLength('.txt')
  assert(publicHeader.config.length === expectedPublicConfigSize, 'X25519 配置区长度错误')
  assert(publicHeader.headerSize === MAGIC_SIZE + expectedPublicConfigSize, 'X25519 文件头长度错误')
  assert(publicHeader.config.readUInt16BE(CONFIG_LENGTH_OFFSET) === expectedPublicConfigSize, 'X25519 配置长度未写入')
  assert(publicHeader.decodedConfig.salt.length === 0, 'X25519 配置不应包含密码 salt')
  assert(publicHeader.decodedConfig.recipientFingerprint.length === 32, '接收方指纹长度错误')
  assert(publicHeader.decodedConfig.ephemeralPublicKey.length === 44, '临时公钥长度错误')
  assert(publicHeader.decodedConfig.originalExtension === '.txt', 'X25519 原文件后缀解析错误')
  await x25519FileDecrypt(
    publicEncryptedPath,
    publicDecryptedPath,
    privateKeyPem,
    'private-key-password',
  )
  assert(fs.readFileSync(publicDecryptedPath).equals(multiChunkSource), 'X25519 文件往返失败')

  const wrongRecipient = crypto.generateKeyPairSync('x25519')
  const wrongPrivateKeyPem = wrongRecipient.privateKey.export({ type: 'pkcs8', format: 'pem' })
  await assertRejects(
    () => x25519FileDecrypt(publicEncryptedPath, publicDecryptedPath, wrongPrivateKeyPem),
    'X25519 解密接受了错误私钥',
  )
  await assertRejects(
    () => x25519FileDecrypt(
      publicEncryptedPath,
      publicDecryptedPath,
      privateKeyPem,
      'wrong-private-key-password',
    ),
    'X25519 解密接受了错误私钥保护密码',
  )

  const tamperedPublicFile = Buffer.from(fs.readFileSync(publicEncryptedPath))
  tamperedPublicFile[MAGIC_SIZE + WRAPPED_DEK_OFFSET] ^= 0xff
  const tamperedPublicPath = path.join(resultDir, 'x25519-tampered.enc')
  fs.writeFileSync(tamperedPublicPath, tamperedPublicFile)
  await assertRejects(
    () => x25519FileDecrypt(
      tamperedPublicPath,
      publicDecryptedPath,
      privateKeyPem,
      'private-key-password',
    ),
    'X25519 解密接受了篡改的 wrapped DEK',
  )

  const tamperedRecipientFile = Buffer.from(fs.readFileSync(publicEncryptedPath))
  tamperedRecipientFile[MAGIC_SIZE + RECIPIENT_FINGERPRINT_OFFSET] ^= 0xff
  const tamperedRecipientPath = path.join(resultDir, 'x25519-recipient-tampered.enc')
  fs.writeFileSync(tamperedRecipientPath, tamperedRecipientFile)
  await assertRejects(
    () => x25519FileDecrypt(
      tamperedRecipientPath,
      publicDecryptedPath,
      privateKeyPem,
      'private-key-password',
    ),
    'X25519 解密接受了篡改的接收方元数据',
  )

  console.log('scrypt tests passed')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
