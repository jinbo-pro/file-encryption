/**
 * X25519 密钥解析、指纹与共享密钥派生。
 */

import * as crypto from 'node:crypto'
import {
  FILE_MAGIC,
  DEK_SIZE,
  EPHEMERAL_PUBLIC_KEY_SIZE,
  RECIPIENT_FINGERPRINT_SIZE,
} from '../config'
import type { PublicKeyInfo } from '../../shared/preload-api'
import type { ManagedKeyPairMaterial, X25519EncryptionMaterial } from './types'

const X25519_WRAP_INFO = Buffer.from(`${FILE_MAGIC}/v1/x25519/dek-wrap`, 'ascii')

function assertPem(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`请输入${label}`)
  }
  if (Buffer.byteLength(value, 'utf8') > 64 * 1024) throw new Error(`${label}不能超过 64 KB`)
  return value.trim()
}

function assertX25519Key(key: crypto.KeyObject, label: string): crypto.KeyObject {
  if (key.asymmetricKeyType !== 'x25519') {
    throw new Error(`${label}必须是 X25519 密钥`)
  }
  return key
}

function parsePublicKey(publicKeyPem: string) {
  try {
    if (!/-----BEGIN PUBLIC KEY-----/.test(publicKeyPem)) {
      throw new Error('接收方公钥必须是 SPKI PEM 格式')
    }
    return assertX25519Key(
      crypto.createPublicKey(assertPem(publicKeyPem, '接收方公钥')),
      '接收方公钥',
    )
  } catch (error) {
    if (error.message.includes('必须是 X25519')
      || error.message.includes('必须是 SPKI PEM')
      || error.message.includes('不能超过')
      || error.message.includes('请输入')) throw error
    throw new Error('接收方公钥格式无效')
  }
}

function parsePrivateKey(privateKeyPem: string, passphrase = '') {
  try {
    if (!/-----BEGIN (?:ENCRYPTED )?PRIVATE KEY-----/.test(privateKeyPem)) {
      throw new Error('接收方私钥必须是 PKCS#8 PEM 格式')
    }
    return assertX25519Key(
      crypto.createPrivateKey({
        key: assertPem(privateKeyPem, '接收方私钥'),
        format: 'pem',
        passphrase: passphrase || undefined,
      }),
      '接收方私钥',
    )
  } catch (error) {
    if (error.message.includes('必须是 X25519')
      || error.message.includes('必须是 PKCS#8 PEM')
      || error.message.includes('不能超过')
      || error.message.includes('请输入')) throw error
    if (/ENCRYPTED PRIVATE KEY/.test(privateKeyPem) && !passphrase) {
      throw new Error('请输入私钥保护密码')
    }
    throw new Error('接收方私钥或私钥保护密码无效')
  }
}

function exportPublicDer(publicKey: crypto.KeyObject): Buffer {
  const der = publicKey.export({ type: 'spki', format: 'der' }) as Buffer
  if (der.length !== EPHEMERAL_PUBLIC_KEY_SIZE) {
    throw new Error('X25519 公钥编码长度无效')
  }
  return der
}

function exportPublicPem(publicKey: crypto.KeyObject): string {
  return publicKey.export({ type: 'spki', format: 'pem' }) as string
}

function exportEncryptedPrivatePem(privateKey: crypto.KeyObject, passphrase: string): string {
  return privateKey.export({
    type: 'pkcs8',
    format: 'pem',
    cipher: 'aes-256-cbc',
    passphrase,
  }) as string
}

function fingerprintPublicKey(publicKey: crypto.KeyObject) {
  const fingerprint = crypto.createHash('sha256').update(exportPublicDer(publicKey)).digest()
  if (fingerprint.length !== RECIPIENT_FINGERPRINT_SIZE) {
    throw new Error('公钥指纹长度无效')
  }
  return fingerprint
}

function formatFingerprint(fingerprint: Buffer) {
  const hex = fingerprint.toString('hex')
  return hex.match(/.{1,4}/g)?.join(' ') ?? hex
}

function inspectPublicKey(publicKeyPem: string): PublicKeyInfo {
  const publicKey = parsePublicKey(publicKeyPem)
  const fingerprint = fingerprintPublicKey(publicKey)
  return {
    algorithm: 'X25519',
    fingerprint: fingerprint.toString('hex'),
    formattedFingerprint: formatFingerprint(fingerprint),
  }
}

function createManagedKeyPair(passphrase: string): ManagedKeyPairMaterial {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('x25519')
  const publicKeyPem = exportPublicPem(publicKey)
  const fingerprint = fingerprintPublicKey(publicKey)
  return {
    publicKeyPem,
    privateKeyPem: exportEncryptedPrivatePem(privateKey, passphrase),
    fingerprint: fingerprint.toString('hex'),
    formattedFingerprint: formatFingerprint(fingerprint),
  }
}

function normalizeManagedPrivateKey(
  privateKeyPem: string,
  currentPassphrase: string,
  storagePassphrase: string,
): ManagedKeyPairMaterial {
  const privateKey = parsePrivateKey(privateKeyPem, currentPassphrase)
  const publicKey = crypto.createPublicKey(privateKey)
  const fingerprint = fingerprintPublicKey(publicKey)
  return {
    publicKeyPem: exportPublicPem(publicKey),
    privateKeyPem: exportEncryptedPrivatePem(privateKey, storagePassphrase),
    fingerprint: fingerprint.toString('hex'),
    formattedFingerprint: formatFingerprint(fingerprint),
  }
}

function publicKeyFromDer(der: Buffer) {
  if (!Buffer.isBuffer(der) || der.length !== EPHEMERAL_PUBLIC_KEY_SIZE) {
    throw new Error('临时公钥长度无效')
  }
  try {
    return assertX25519Key(
      crypto.createPublicKey({ key: der, type: 'spki', format: 'der' }),
      '临时公钥',
    )
  } catch {
    throw new Error('临时公钥格式无效')
  }
}

function assertSharedSecret(sharedSecret: Buffer) {
  if (sharedSecret.length !== DEK_SIZE || sharedSecret.every((value) => value === 0)) {
    throw new Error('X25519 共享密钥无效')
  }
}

function deriveX25519Kek(
  sharedSecret: Buffer,
  hkdfSalt: Buffer,
  recipientFingerprint: Buffer,
  ephemeralPublicKey: Buffer,
) {
  assertSharedSecret(sharedSecret)
  const info = Buffer.concat([
    X25519_WRAP_INFO,
    recipientFingerprint,
    ephemeralPublicKey,
  ])
  return Buffer.from(crypto.hkdfSync('sha256', sharedSecret, hkdfSalt, info, DEK_SIZE))
}

function createX25519EncryptionMaterial(publicKeyPem: string): X25519EncryptionMaterial {
  const recipientPublicKey = parsePublicKey(publicKeyPem)
  const recipientFingerprint = fingerprintPublicKey(recipientPublicKey)
  const ephemeral = crypto.generateKeyPairSync('x25519')
  const ephemeralPublicKey = exportPublicDer(ephemeral.publicKey)
  const sharedSecret = crypto.diffieHellman({
    privateKey: ephemeral.privateKey,
    publicKey: recipientPublicKey,
  })
  return { recipientFingerprint, ephemeralPublicKey, sharedSecret }
}

function createX25519DecryptionMaterial(
  privateKeyPem: string,
  passphrase: string,
  expectedFingerprint: Buffer,
  ephemeralPublicKey: Buffer,
) {
  const privateKey = parsePrivateKey(privateKeyPem, passphrase)
  const actualFingerprint = fingerprintPublicKey(crypto.createPublicKey(privateKey))
  if (!crypto.timingSafeEqual(actualFingerprint, expectedFingerprint)) {
    throw new Error('所选私钥与接收方公钥指纹不匹配')
  }
  const sharedSecret = crypto.diffieHellman({
    privateKey,
    publicKey: publicKeyFromDer(ephemeralPublicKey),
  })
  assertSharedSecret(sharedSecret)
  return sharedSecret
}

export {
  parsePublicKey,
  parsePrivateKey,
  inspectPublicKey,
  createManagedKeyPair,
  normalizeManagedPrivateKey,
  deriveX25519Kek,
  createX25519EncryptionMaterial,
  createX25519DecryptionMaterial,
}
