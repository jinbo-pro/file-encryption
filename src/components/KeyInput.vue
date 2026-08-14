<script setup lang="ts">
import { Delete, Key, Upload } from '@element-plus/icons-vue'
import type { KeyType, PublicKeyInfo } from '../../shared/preload-api'

const props = withDefaults(defineProps<{
  label: string
  keyType: KeyType
  disabled?: boolean
  keyInfo?: PublicKeyInfo | null
  expectedFingerprint?: string
}>(), {
  disabled: false,
  keyInfo: null,
  expectedFingerprint: '',
})

const model = defineModel<string>({ default: '' })

function serviceApi() {
  if (!window.services) throw new Error('请在 uTools 或 Electron 客户端中运行')
  return window.services
}

function uploadKey() {
  try {
    const file = serviceApi().selectKeyFile(props.keyType)
    if (!file) return
    model.value = file.text
    ElMessage.success(`已读取 ${file.name}`)
  } catch (error) {
    ElMessage.error(error.message)
  }
}
</script>

<template>
  <div class="flex min-w-0 flex-col gap-2">
    <div class="flex min-h-8 items-center justify-between gap-3">
      <span class="text-[13px] font-semibold text-[#41464d]">{{ label }}</span>
      <div class="flex shrink-0 items-center gap-1">
        <el-button
          link
          type="primary"
          :disabled="disabled"
          class="[&>span]:gap-1.5"
          @click="uploadKey"
        >
          <Upload class="size-4" />
          上传密钥
        </el-button>
        <el-tooltip content="清空" placement="top">
          <el-button
            text
            circle
            aria-label="清空密钥"
            :disabled="!model || disabled"
            @click="model = ''"
          >
            <Delete class="size-4" />
          </el-button>
        </el-tooltip>
      </div>
    </div>

    <el-input
      v-model="model"
      type="textarea"
      :rows="5"
      resize="none"
      maxlength="65536"
      :disabled="disabled"
      :placeholder="keyType === 'public'
        ? '粘贴 -----BEGIN PUBLIC KEY----- 公钥'
        : '粘贴 -----BEGIN PRIVATE KEY----- 或加密私钥'"
      class="encryption-textarea font-mono"
    />

    <div v-if="keyInfo" class="flex min-w-0 items-start gap-2 text-xs text-[#5f666d]">
      <Key class="mt-px size-3.75 shrink-0 text-[#176b4d]" />
      <span class="min-w-0 break-all">
        {{ keyInfo.algorithm }} · SHA-256 {{ keyInfo.formattedFingerprint }}
      </span>
    </div>
    <div v-else-if="expectedFingerprint" class="break-all text-xs text-[#737a81]">
      接收方指纹：{{ expectedFingerprint }}
    </div>
  </div>
</template>
