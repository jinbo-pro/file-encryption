<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import {
  CopyDocument,
  Delete,
  Download,
  Lock,
  Unlock,
  Upload,
} from '@element-plus/icons-vue'
import PasswordInput from '../components/PasswordInput.vue'
import { useEncryptionSettingsStore } from '../stores/encryptionSettings'
import type { FileMode, TextCryptoResult } from '../../shared/preload-api'

const modeOptions = [
  { label: '加密文本', value: 'encrypt' },
  { label: '解密文本', value: 'decrypt' },
]

const settings = useEncryptionSettingsStore()
const { textCompressionType, textScryptProfile } = storeToRefs(settings)
const mode = ref<FileMode>('encrypt')
const inputText = ref('')
const outputText = ref('')
const password = ref('')
const processing = ref(false)
const metadata = ref<TextCryptoResult | null>(null)

const isEncrypt = computed(() => mode.value === 'encrypt')
const canSubmit = computed(() => inputText.value.length > 0 && password.value && !processing.value)
const downloadFileName = computed(() => {
  const prefix = isEncrypt.value ? 'encrypted-base64' : 'decrypted-text'
  const md5Prefix = metadata.value?.plaintextMd5?.slice(0, 16)
  return `${prefix}${md5Prefix ? `-${md5Prefix}` : ''}.txt`
})

watch(mode, () => {
  inputText.value = ''
  outputText.value = ''
  password.value = ''
  metadata.value = null
})

function serviceApi() {
  if (!window.services) throw new Error('请在 uTools 或 Electron 客户端中运行')
  return window.services
}

function clearText() {
  inputText.value = ''
  outputText.value = ''
  metadata.value = null
}

function uploadText() {
  try {
    const file = serviceApi().selectTextFile()
    if (!file) return
    inputText.value = file.text
    outputText.value = ''
    metadata.value = null
    ElMessage.success(`已读取 ${file.name}`)
  } catch (error) {
    ElMessage.error(error.message)
  }
}

function downloadResult() {
  if (!outputText.value) return
  try {
    const outputPath = serviceApi().saveTextResult({
      text: outputText.value,
      defaultName: downloadFileName.value,
    })
    if (outputPath) ElMessage.success('结果已保存')
  } catch (error) {
    ElMessage.error(error.message)
  }
}

async function copyOutput() {
  if (!outputText.value) return
  try {
    await navigator.clipboard.writeText(outputText.value)
    ElMessage.success('已复制')
  } catch {
    ElMessage.error('复制失败，请手动复制')
  }
}

async function submit() {
  if (!inputText.value) return ElMessage.warning(isEncrypt.value ? '请输入要加密的文本' : '请输入 Base64 密文')
  if (!password.value) return ElMessage.warning('请输入密码')

  processing.value = true
  outputText.value = ''
  metadata.value = null
  try {
    const result = isEncrypt.value
      ? await serviceApi().encryptText({
          text: inputText.value,
          password: password.value,
          compressionType: textCompressionType.value,
          scryptProfile: textScryptProfile.value,
        })
      : await serviceApi().decryptText({
          text: inputText.value,
          password: password.value,
        })
    outputText.value = result.text
    metadata.value = result
    ElMessage.success(`${isEncrypt.value ? '加密' : '解密'}完成`)
  } catch (error) {
    ElMessage.error(error.message)
  } finally {
    processing.value = false
  }
}
</script>

<template>
  <div class="p-5.5 max-[520px]:p-4.5">
    <el-segmented
      v-model="mode"
      :options="modeOptions"
      block
      class="w-full [--el-segmented-item-selected-bg-color:#176b4d] [--el-segmented-item-selected-color:#fff]"
    />

    <div class="mt-6 grid min-w-0 gap-5 min-[900px]:grid-cols-2">
      <div class="flex min-w-0 flex-col gap-2">
        <div class="flex h-8 items-center justify-between gap-3">
          <span class="text-[13px] font-semibold text-[#41464d]">
            {{ isEncrypt ? '原始文本' : 'Base64 密文' }}
          </span>
          <div class="flex shrink-0 items-center gap-1">
            <el-button link type="primary" :disabled="processing" class="[&>span]:gap-1.5" @click="uploadText">
              <Upload class="size-4" />
              上传文本
            </el-button>
            <el-tooltip content="清空" placement="top">
              <el-button text circle aria-label="清空" :disabled="!inputText || processing" @click="clearText">
                <Delete class="size-4" />
              </el-button>
            </el-tooltip>
          </div>
        </div>
        <el-input
          v-model="inputText"
          type="textarea"
          :rows="6"
          resize="none"
          :placeholder="isEncrypt ? '输入要加密的文本' : '输入 Base64 密文'"
          :disabled="processing"
          class="encryption-textarea"
        />
        <span class="text-right text-xs text-[#93989f] mt-2">{{ inputText.length }} 字符</span>
      </div>

      <div class="flex min-w-0 flex-col gap-2">
        <div class="flex h-8 items-center justify-between gap-3">
          <span class="text-[13px] font-semibold text-[#41464d]">
            {{ isEncrypt ? 'Base64 密文' : '解密结果' }}
          </span>
          <el-tooltip content="复制结果" placement="top">
            <el-button text circle aria-label="复制结果" :disabled="!outputText" @click="copyOutput">
              <CopyDocument class="size-4" />
            </el-button>
          </el-tooltip>
        </div>
        <el-input
          v-model="outputText"
          type="textarea"
          :rows="6"
          resize="none"
          readonly
          placeholder="处理结果"
          class="encryption-textarea encryption-textarea-output"
        />
        <div class="flex min-h-8 items-center justify-between gap-3">
          <span class="text-xs text-[#93989f]">
            <template v-if="metadata">{{ metadata.sourceSize }} B → {{ metadata.outputSize }} B</template>
            <template v-else>0 字符</template>
          </span>
          <el-button
            link
            type="primary"
            :disabled="!outputText"
            class="[&>span]:gap-1.5"
            @click="downloadResult"
          >
            <Download class="size-4" />
            下载结果
          </el-button>
        </div>
      </div>
    </div>

    <div class="mt-5 grid min-w-0 items-end gap-4 min-[760px]:grid-cols-[minmax(280px,1fr)_minmax(220px,0.45fr)]">
      <PasswordInput
        v-model="password"
        input-id="text-password"
        :disabled="processing"
        :allow-quick-fill="isEncrypt"
        @enter="canSubmit && submit()"
      />

      <el-button
        class="h-10! w-full font-semibold [--el-button-active-bg-color:#12573e] [--el-button-active-border-color:#12573e] [--el-button-bg-color:#176b4d] [--el-button-border-color:#176b4d] [--el-button-hover-bg-color:#217d5c] [--el-button-hover-border-color:#217d5c] [&>span]:gap-2"
        type="primary"
        size="large"
        :disabled="!canSubmit"
        :loading="processing"
        @click="submit"
      >
        <Lock v-if="isEncrypt && !processing" class="size-4.5" />
        <Unlock v-if="!isEncrypt && !processing" class="size-4.5" />
        {{ processing ? '正在处理...' : isEncrypt ? '开始加密' : '开始解密' }}
      </el-button>
    </div>
  </div>
</template>
