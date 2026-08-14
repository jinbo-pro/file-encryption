/**
 * 服务层公共参数校验。
 */

import {
  isCompressionType,
  isEncryptionType,
  getScryptProfile,
} from '../config'
import type { CompressionType, EncryptionType, ScryptProfile } from '../../shared/preload-api'

/**
 * 校验用户密码是否为非空字符串。
 *
 * @param {unknown} password 待校验密码。
 * @returns {void}
 * @throws {Error} 密码为空或类型错误。
 */
function assertPassword(password: unknown): asserts password is string {
  if (typeof password !== 'string' || password.length === 0) {
    throw new Error('请输入密码')
  }
}

/**
 * 校验前端传入的压缩、加密和 scrypt 编号。
 *
 * @param {unknown} compressionType 压缩方式编号。
 * @param {unknown} encryptionType 加密方式编号。
 * @param {unknown} scryptProfile scrypt 档位编号。
 * @returns {void}
 */
function assertEncryptionOptions(
  compressionType: unknown,
  encryptionType: unknown,
  scryptProfile: unknown,
): asserts compressionType is CompressionType {
  if (!isCompressionType(compressionType)) throw new Error('不支持的压缩类型')
  if (!isEncryptionType(encryptionType)) throw new Error('不支持的加密方式')
  if (!Number.isInteger(scryptProfile) || !getScryptProfile(scryptProfile)) {
    throw new Error('不支持的 scrypt 配置档位')
  }
}

/**
 * 校验单独传入的 scrypt 档位。
 *
 * @param {unknown} scryptProfile scrypt 档位编号。
 * @returns {void}
 */
function assertScryptProfile(scryptProfile: unknown): asserts scryptProfile is ScryptProfile {
  if (!Number.isInteger(scryptProfile) || !getScryptProfile(scryptProfile)) {
    throw new Error('不支持的 scrypt 配置档位')
  }
}

export { assertPassword, assertEncryptionOptions, assertScryptProfile }
