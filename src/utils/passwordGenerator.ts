export const PASSWORD_CHARACTER_POOLS = {
  number: '0123456789',
  lowercase: 'abcdefghijklmnopqrstuvwxyz',
  uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  symbol: '!@#$%^&*()-_=+[]{};:,.?/|~',
} as const

export type PasswordCharacterType = keyof typeof PASSWORD_CHARACTER_POOLS
export type PasswordGenerationRange = 'ascii' | 'unicode'

export const ALL_PASSWORD_CHARACTER_TYPES = Object.freeze(
  Object.keys(PASSWORD_CHARACTER_POOLS) as PasswordCharacterType[],
)

export type RandomValues = (array: Uint32Array) => Uint32Array

export interface PasswordGenerationOptions {
  length: number
  range: PasswordGenerationRange
  characterTypes: readonly PasswordCharacterType[]
  unicodeRanges?: readonly UnicodeRangeId[]
  randomValues?: RandomValues
}

export const ALLOW_RANGES = [
  { id: 'ascii', label: 'ASCII 字符', start: 0x0020, end: 0x007e },
  { id: 'japanese', label: '日文', start: 0x3040, end: 0x30ff },
  { id: 'chinese', label: '中文', start: 0x4e00, end: 0x9fff },
  { id: 'arabic', label: '阿拉伯文', start: 0x0600, end: 0x06ff },
  { id: 'korean', label: '韩文', start: 0xac00, end: 0xd7af },
  { id: 'western-latin', label: '西欧拉丁', start: 0x00c0, end: 0x00ff },
  { id: 'cyrillic', label: '俄文', start: 0x0400, end: 0x04ff },
  { id: 'greek', label: '希腊文', start: 0x0370, end: 0x03ff },
] as const

export type UnicodeRangeId = typeof ALLOW_RANGES[number]['id']

export const ALL_UNICODE_RANGE_IDS = Object.freeze(
  ALLOW_RANGES.map(({ id }) => id) as UnicodeRangeId[],
)

function secureRandomValues(array: Uint32Array) {
  const cryptoApi = globalThis.crypto
  if (!cryptoApi?.getRandomValues) throw new Error('当前环境不支持安全随机数生成')
  return cryptoApi.getRandomValues(array)
}

function validateInteger(value: number, minimum: number, maximum: number, label: string) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${label}必须是 ${minimum} 到 ${maximum} 之间的整数`)
  }
}

function createRandomIndex(randomValues: RandomValues) {
  const buffer = new Uint32Array(1)
  return (maximum: number) => {
    const range = 0x1_0000_0000
    const limit = range - (range % maximum)
    do randomValues(buffer)
    while (buffer[0] >= limit)
    return buffer[0] % maximum
  }
}

function pick<T>(items: readonly T[], randomIndex: (maximum: number) => number) {
  return items[randomIndex(items.length)]
}

function generateUnicodePassword(
  length: number,
  unicodeRangeIds: readonly UnicodeRangeId[],
  randomIndex: (maximum: number) => number,
) {
  const uniqueIds = [...new Set(unicodeRangeIds)]
  const ranges = uniqueIds.map((id) => ALLOW_RANGES.find((range) => range.id === id))
  if (ranges.length === 0) throw new Error('请至少选择一种 Unicode 字符范围')
  if (ranges.some((range) => !range)) throw new Error('包含不支持的 Unicode 字符范围')

  return Array.from({ length }, () => {
    const range = pick(ranges, randomIndex)!
    const codePoint = range.start + randomIndex(range.end - range.start + 1)
    return String.fromCodePoint(codePoint)
  }).join('')
}

export function generatePassword(options: PasswordGenerationOptions) {
  validateInteger(options.length, 1, 1024, '密码长度')

  const randomIndex = createRandomIndex(options.randomValues ?? secureRandomValues)
  if (options.range === 'unicode') {
    return generateUnicodePassword(
      options.length,
      options.unicodeRanges ?? ALL_UNICODE_RANGE_IDS,
      randomIndex,
    )
  }
  if (options.range !== 'ascii') throw new Error('包含不支持的密码生成范围')

  const characterTypes = [...new Set(options.characterTypes)]
  if (characterTypes.length === 0) throw new Error('请至少选择一种密码类型')

  const pools = characterTypes.map((type) => Array.from(PASSWORD_CHARACTER_POOLS[type] || ''))
  if (pools.some((pool) => pool.length === 0)) throw new Error('包含不支持的密码类型')

  const allCharacters = pools.flat()
  const password: string[] = []

  // Length permitting, ensure every selected character type appears at least once.
  if (options.length >= pools.length) {
    for (const pool of pools) password.push(pick(pool, randomIndex))
  }

  while (password.length < options.length) {
    password.push(pick(allCharacters, randomIndex))
  }

  for (let index = password.length - 1; index > 0; index -= 1) {
    const target = randomIndex(index + 1)
    ;[password[index], password[target]] = [password[target], password[index]]
  }

  return password.join('')
}

export function generatePasswords(options: PasswordGenerationOptions, count: number) {
  validateInteger(count, 1, 255, '生成个数')
  return Array.from({ length: count }, () => generatePassword(options))
}
