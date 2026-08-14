import assert from 'node:assert/strict'
import {
  ALLOW_RANGES,
  ALL_PASSWORD_CHARACTER_TYPES,
  ALL_UNICODE_RANGE_IDS,
  generatePassword,
  generatePasswords,
} from '../src/utils/passwordGenerator'

let seed = 0
const deterministicRandom = (array: Uint32Array) => {
  array[0] = seed++ >>> 0
  return array
}

const mixed = generatePassword({
  length: 16,
  range: 'ascii',
  characterTypes: ALL_PASSWORD_CHARACTER_TYPES,
  randomValues: deterministicRandom,
})
assert.equal(mixed.length, 16)
assert.match(mixed, /[0-9]/)
assert.match(mixed, /[a-z]/)
assert.match(mixed, /[A-Z]/)
assert.match(mixed, /[^0-9a-zA-Z]/)

const short = generatePassword({
  length: 1,
  range: 'ascii',
  characterTypes: ['number'],
  randomValues: deterministicRandom,
})
assert.match(short, /^[0-9]$/)

const unicode = generatePassword({
  length: 32,
  range: 'unicode',
  characterTypes: [],
  unicodeRanges: ALL_UNICODE_RANGE_IDS,
  randomValues: deterministicRandom,
})
assert.equal(Array.from(unicode).length, 32)
assert.ok(Array.from(unicode).every((character) => {
  const codePoint = character.codePointAt(0)!
  return ALLOW_RANGES.some(({ start, end }) => codePoint >= start && codePoint <= end)
}))

const unicodeRandomValues = [3, 5]
const unicodeFromSelectedRange = generatePassword({
  length: 1,
  range: 'unicode',
  characterTypes: [],
  unicodeRanges: ['arabic'],
  randomValues: (array) => {
    array[0] = unicodeRandomValues.shift() ?? 0
    return array
  },
})
assert.equal(
  unicodeFromSelectedRange.codePointAt(0),
  ALLOW_RANGES.find(({ id }) => id === 'arabic')!.start + 5,
)

const batch = generatePasswords({
  length: 8,
  range: 'ascii',
  characterTypes: ['lowercase'],
  randomValues: deterministicRandom,
}, 255)
assert.equal(batch.length, 255)
assert.ok(batch.every((password) => password.length === 8 && /^[a-z]+$/.test(password)))

assert.throws(() => generatePassword({ length: 0, range: 'ascii', characterTypes: ['number'] }))
assert.throws(() => generatePassword({ length: 1025, range: 'ascii', characterTypes: ['number'] }))
assert.throws(() => generatePassword({ length: 8, range: 'ascii', characterTypes: [] }))
assert.throws(() => generatePassword({
  length: 8,
  range: 'unicode',
  characterTypes: [],
  unicodeRanges: [],
}))
assert.throws(() => generatePasswords({ length: 8, range: 'ascii', characterTypes: ['number'] }, 256))

console.log('password generator tests passed')
