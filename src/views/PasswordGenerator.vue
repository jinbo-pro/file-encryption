<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { CopyDocument, Delete, MagicStick } from '@element-plus/icons-vue'
import {
  ALLOW_RANGES,
  ALL_PASSWORD_CHARACTER_TYPES,
  ALL_UNICODE_RANGE_IDS,
  generatePasswords,
  type PasswordCharacterType,
  type PasswordGenerationRange,
  type UnicodeRangeId
} from '../utils/passwordGenerator'

type LengthOption = 6 | 8 | 14 | 16 | 32 | 64 | 'custom'

interface PasswordGeneratorSettings {
  range: PasswordGenerationRange
  lengthOption: LengthOption
  customLength: number
  characterTypes: PasswordCharacterType[]
  unicodeRanges: UnicodeRangeId[]
  count: number
}

const STORAGE_KEY = 'password-generator-settings'
const RANGE_OPTIONS: Array<{ label: string; value: PasswordGenerationRange }> = [
  { label: 'ASCII', value: 'ascii' },
  { label: 'Unicode', value: 'unicode' }
]
const LENGTH_OPTIONS: Exclude<LengthOption, 'custom'>[] = [6, 8, 14, 16, 32, 64]
const CHARACTER_TYPE_OPTIONS: Array<{ label: string; value: PasswordCharacterType }> = [
  { label: '数字', value: 'number' },
  { label: '小写字母', value: 'lowercase' },
  { label: '大写字母', value: 'uppercase' },
  { label: '符号', value: 'symbol' }
]
const DEFAULT_SETTINGS: PasswordGeneratorSettings = {
  range: 'ascii',
  lengthOption: 16,
  customLength: 20,
  characterTypes: [...ALL_PASSWORD_CHARACTER_TYPES],
  unicodeRanges: [...ALL_UNICODE_RANGE_IDS],
  count: 1
}

function isLengthOption(value: unknown): value is LengthOption {
  return value === 'custom' || LENGTH_OPTIONS.includes(value as Exclude<LengthOption, 'custom'>)
}

function isPasswordGenerationRange(value: unknown): value is PasswordGenerationRange {
  return value === 'ascii' || value === 'unicode'
}

function clampInteger(value: unknown, minimum: number, maximum: number, fallback: number) {
  const parsed = Number(value)
  return Number.isInteger(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback
}

function loadSettings(): PasswordGeneratorSettings {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as Partial<PasswordGeneratorSettings>
    const characterTypes = Array.isArray(parsed.characterTypes)
      ? parsed.characterTypes.filter((type): type is PasswordCharacterType =>
          ALL_PASSWORD_CHARACTER_TYPES.includes(type as PasswordCharacterType)
        )
      : DEFAULT_SETTINGS.characterTypes
    const unicodeRanges = Array.isArray(parsed.unicodeRanges)
      ? parsed.unicodeRanges.filter((id): id is UnicodeRangeId => ALL_UNICODE_RANGE_IDS.includes(id as UnicodeRangeId))
      : DEFAULT_SETTINGS.unicodeRanges

    return {
      range: isPasswordGenerationRange(parsed.range) ? parsed.range : DEFAULT_SETTINGS.range,
      lengthOption: isLengthOption(parsed.lengthOption) ? parsed.lengthOption : DEFAULT_SETTINGS.lengthOption,
      customLength: clampInteger(parsed.customLength, 1, 1024, DEFAULT_SETTINGS.customLength),
      characterTypes: [...new Set(characterTypes)],
      unicodeRanges: [...new Set(unicodeRanges)],
      count: clampInteger(parsed.count, 1, 255, DEFAULT_SETTINGS.count)
    }
  } catch {
    return {
      ...DEFAULT_SETTINGS,
      characterTypes: [...DEFAULT_SETTINGS.characterTypes],
      unicodeRanges: [...DEFAULT_SETTINGS.unicodeRanges]
    }
  }
}

const savedSettings = loadSettings()
const passwordRange = ref<PasswordGenerationRange>(savedSettings.range)
const lengthOption = ref<LengthOption>(savedSettings.lengthOption)
const customLength = ref(savedSettings.customLength)
const characterTypes = ref<PasswordCharacterType[]>(savedSettings.characterTypes)
const unicodeRanges = ref<UnicodeRangeId[]>(savedSettings.unicodeRanges)
const count = ref(savedSettings.count)
const passwords = ref<string[]>([])

const passwordLength = computed(() => (lengthOption.value === 'custom' ? customLength.value : lengthOption.value))
const canGenerate = computed(() =>
  passwordRange.value === 'unicode' ? unicodeRanges.value.length > 0 : characterTypes.value.length > 0
)

watch(
  [passwordRange, lengthOption, customLength, characterTypes, unicodeRanges, count],
  () => {
    const settings: PasswordGeneratorSettings = {
      range: passwordRange.value,
      lengthOption: lengthOption.value,
      customLength: clampInteger(customLength.value, 1, 1024, DEFAULT_SETTINGS.customLength),
      characterTypes: characterTypes.value,
      unicodeRanges: unicodeRanges.value,
      count: clampInteger(count.value, 1, 255, DEFAULT_SETTINGS.count)
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  },
  { deep: true }
)

function generate() {
  if (passwordRange.value === 'ascii' && !characterTypes.value.length) {
    return ElMessage.warning('请至少选择一种密码类型')
  }
  if (passwordRange.value === 'unicode' && !unicodeRanges.value.length) {
    return ElMessage.warning('请至少选择一种 Unicode 字符范围')
  }
  try {
    passwords.value = generatePasswords(
      {
        length: passwordLength.value,
        range: passwordRange.value,
        characterTypes: characterTypes.value,
        unicodeRanges: unicodeRanges.value
      },
      count.value
    )
  } catch (error) {
    ElMessage.error(error.message)
  }
}

async function copy(value: string, all = false) {
  try {
    await navigator.clipboard.writeText(value)
    ElMessage.success(all ? `已复制 ${passwords.value.length} 个密码` : '密码已复制')
  } catch {
    ElMessage.error('复制失败，请手动复制')
  }
}

function copyAll() {
  if (passwords.value.length) void copy(passwords.value.join('\n'), true)
}

function resetSettings() {
  localStorage.removeItem(STORAGE_KEY)
  window.location.reload()
}
</script>

<template>
  <div class="p-5.5">
    <el-form
      class="password-generator-form border-y border-[#eceef0] bg-[#fafbfc] px-5 py-5"
      label-position="left"
      label-width="112px"
    >
      <el-form-item label="密码位数">
        <div class="flex">
          <div class="w-50 mr-4">
            <el-select v-model="lengthOption">
              <el-option v-for="length in LENGTH_OPTIONS" :key="length" :value="length">{{ length }}</el-option>
              <el-option label="自定义" value="custom" />
            </el-select>
          </div>
          <el-input-number
            v-if="lengthOption === 'custom'"
            v-model="customLength"
            class="w-40!"
            :min="1"
            :max="1024"
            :step="1"
            step-strictly
            controls-position="right"
            aria-label="自定义密码位数"
          />
        </div>
      </el-form-item>

      <el-form-item label="生成范围">
        <el-segmented
          v-model="passwordRange"
          :options="RANGE_OPTIONS"
          block
          class="w-70 max-w-full [--el-segmented-item-selected-bg-color:#176b4d] [--el-segmented-item-selected-color:#fff]"
        />
      </el-form-item>

      <el-form-item v-if="passwordRange === 'ascii'" :error="characterTypes.length ? '' : '请至少选择一种密码类型'">
        <el-checkbox-group
          v-model="characterTypes"
          class="grid w-full grid-cols-4 gap-x-5 gap-y-2 max-[760px]:grid-cols-2"
        >
          <el-checkbox v-for="option in CHARACTER_TYPE_OPTIONS" :key="option.value" :value="option.value">
            {{ option.label }}
          </el-checkbox>
        </el-checkbox-group>
      </el-form-item>

      <el-form-item v-else :error="unicodeRanges.length ? '' : '请至少选择一种字符范围'">
        <el-checkbox-group
          v-model="unicodeRanges"
          class="grid w-full grid-cols-4 gap-x-5 gap-y-2 max-[760px]:grid-cols-2"
        >
          <el-checkbox v-for="range in ALLOW_RANGES" :key="range.id" :value="range.id">
            {{ range.label }}
          </el-checkbox>
        </el-checkbox-group>
      </el-form-item>

      <el-form-item label="生成个数">
        <div class="flex flex-wrap items-center gap-3">
          <el-input-number
            id="password-count"
            v-model="count"
            :min="1"
            :max="255"
            :step="1"
            step-strictly
            controls-position="right"
            aria-label="生成个数"
          />
        </div>
      </el-form-item>
      <el-form-item label="操作" class="mb-0!">
        <el-button @click="resetSettings">重置</el-button>
        <el-button
          type="primary"
          class="px-5! [--el-button-bg-color:#176b4d] [--el-button-border-color:#176b4d] [--el-button-hover-bg-color:#217d5c] [--el-button-hover-border-color:#217d5c] [&>span]:gap-2"
          :disabled="!canGenerate"
          @click="generate"
        >
          <MagicStick class="size-4" />
          生成密码
        </el-button>
      </el-form-item>
    </el-form>

    <section v-if="passwords.length" class="pt-5">
      <div class="mb-3 flex min-h-8 items-center justify-between gap-3">
        <span class="font-semibold text-[#41464d]">生成结果（{{ passwords.length }}）</span>
        <div class="flex items-center gap-1">
          <el-button link type="primary" class="[&>span]:gap-1.5" @click="copyAll">
            <CopyDocument class="size-4" />
            全部复制
          </el-button>
          <el-tooltip content="清空结果" placement="top">
            <el-button text circle aria-label="清空结果" @click="passwords = []">
              <Delete class="size-4" />
            </el-button>
          </el-tooltip>
        </div>
      </div>

      <ol
        class="m-0 max-h-[min(430px,48vh)] list-none overflow-y-auto rounded-[7px] border border-[#dfe3e7] bg-[#fafbfc] p-0"
      >
        <li
          v-for="(password, index) in passwords"
          :key="`${index}-${password}`"
          class="grid min-w-0 grid-cols-[42px_minmax(0,1fr)_42px] items-center border-b border-[#e7e9ec] last:border-b-0"
        >
          <span class="text-center text-xs tabular-nums text-[#969ba1]">{{ index + 1 }}</span>
          <code
            class="min-w-0 truncate border-x border-[#e7e9ec] bg-white px-3 py-2.5 font-mono text-[#343a40]"
            :title="password"
          >
            {{ password }}
          </code>
          <el-tooltip content="复制密码" placement="left">
            <el-button text circle aria-label="复制密码" class="mx-auto" @click="copy(password)">
              <CopyDocument class="size-4" />
            </el-button>
          </el-tooltip>
        </li>
      </ol>
    </section>

    <div v-else class="flex min-h-44 flex-col items-center justify-center gap-2 text-center text-[#92979e]">
      <MagicStick class="size-7 text-[#aeb5bb]" />
      <span class="">设置选项后生成密码</span>
    </div>
  </div>
</template>

<style scoped></style>
