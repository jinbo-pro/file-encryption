const storage = new Map()

global.window = {
  utools: {
    dbCryptoStorage: {
      getItem(key) {
        return storage.get(key)
      },
      setItem(key, value) {
        storage.set(key, value)
      },
      removeItem(key) {
        storage.delete(key)
      },
    },
  },
}

const { services } = await import('../preload/services')
window.services = services

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const first = window.services.addEncryptionHistory({
  filePath: 'C:\\data\\first.txt',
  outputPath: 'C:\\data\\first.txt.enc',
  password: 'first-password',
})
const second = window.services.addEncryptionHistory({
  filePath: 'C:\\data\\second.txt',
  outputPath: 'C:\\data\\second.txt.enc',
  password: 'second-password',
})
const passwordChange = window.services.addEncryptionHistory({
  filePath: 'C:\\data\\second.txt.enc',
  outputPath: 'C:\\data\\second.txt.enc',
  password: 'changed-password',
  action: 'password-change',
})
const publicKeyRecord = window.services.addEncryptionHistory({
  filePath: './public-source.txt',
  outputPath: './public-source.enc',
  encryptionType: 1,
  recipientFingerprint: 'ab'.repeat(32),
})

let records = window.services.getEncryptionHistory()
assert(records.length === 4, '历史记录新增失败')
assert(records.some((record) => record.id === first.id), '第一条记录不存在')
assert(records.some((record) => record.id === second.id), '第二条记录不存在')
assert(
  records.some((record) => record.id === passwordChange.id && record.action === 'password-change'),
  '密码修改历史不存在',
)
assert(records.find((record) => record.id === first.id).action === 'encrypt', '旧加密历史类型兼容失败')
assert(
  records.some((record) => (
    record.id === publicKeyRecord.id
    && record.encryptionType === 1
    && record.recipientFingerprint === 'ab'.repeat(32)
    && record.password === undefined
  )),
  '公钥历史记录保存失败',
)
assert(records.every((record) => !Number.isNaN(Date.parse(record.createdAt))), '记录时间无效')

records = window.services.deleteEncryptionHistory(first.id)
assert(records.length === 3 && !records.some((record) => record.id === first.id), '单条删除失败')

window.services.clearEncryptionHistory()
assert(window.services.getEncryptionHistory().length === 0, '全部清空失败')

console.log('encryption history tests passed')
