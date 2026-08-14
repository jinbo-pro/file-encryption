<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { Key, Select } from '@element-plus/icons-vue'
import FileSelector from '../components/FileSelector.vue'
import PasswordInput from '../components/PasswordInput.vue'
import { useEncryptionSettingsStore } from '../stores/encryptionSettings'
import type {
  ChangeFilePasswordResult,
  EncryptedFileInfo,
} from '../../shared/preload-api'

const { fileScryptProfile, historyEnabled } = storeToRefs(useEncryptionSettingsStore())
const sourceFile = ref<EncryptedFileInfo | null>(null)
const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const processing = ref(false)
const result = ref<ChangeFilePasswordResult | null>(null)

const canSubmit = computed(() => (
  sourceFile.value
  && currentPassword.value
  && newPassword.value
  && confirmPassword.value
  && !processing.value
))

function serviceApi() {
  if (!window.services) throw new Error('请在 uTools 或 Electron 客户端中运行')
  return window.services
}

function selectSource() {
  try {
    const selected = serviceApi().selectSourceFile('password-change')
    if (!selected) return
    sourceFile.value = serviceApi().inspectEncryptedFile(selected.path)
    currentPassword.value = ''
    result.value = null
  } catch (error) {
    sourceFile.value = null
    ElMessage.error(error.message)
  }
}

function clearSource() {
  sourceFile.value = null
  currentPassword.value = ''
  result.value = null
}

async function submit() {
  if (!sourceFile.value) return ElMessage.warning('请选择加密包')
  if (!currentPassword.value) return ElMessage.warning('请输入当前密码')
  if (!newPassword.value) return ElMessage.warning('请输入新密码')
  if (newPassword.value !== confirmPassword.value) {
    return ElMessage.warning('两次输入的新密码不一致')
  }
  if (currentPassword.value === newPassword.value) {
    return ElMessage.warning('新密码不能与当前密码相同')
  }

  const changedAt = new Date().toISOString()
  processing.value = true
  result.value = null
  try {
    const operationResult = await serviceApi().changeFilePassword({
      filePath: sourceFile.value.path,
      currentPassword: currentPassword.value,
      newPassword: newPassword.value,
      scryptProfile: fileScryptProfile.value,
    })
    result.value = operationResult

    let historySaved = true
    if (historyEnabled.value) {
      try {
        serviceApi().addEncryptionHistory({
          filePath: operationResult.filePath,
          outputPath: operationResult.filePath,
          password: newPassword.value,
          createdAt: changedAt,
          action: 'password-change',
        })
      } catch {
        historySaved = false
      }
    }

    currentPassword.value = ''
    confirmPassword.value = ''
    if (!historySaved) ElMessage.warning('密码修改完成，但历史记录保存失败')
    else ElMessage.success('密码修改完成')
  } catch (error) {
    ElMessage.error(error.message)
  } finally {
    processing.value = false
  }
}

function revealResult() {
  if (result.value) serviceApi().showItemInFolder(result.value.filePath)
}
</script>

<template>
  <div class="p-5.5 max-[520px]:p-4.5">
    <div class="grid min-w-0 items-start gap-6">
      <FileSelector
        class="mt-0!"
        :file="sourceFile"
        mode="password-change"
        :disabled="processing"
        @select="selectSource"
        @clear="clearSource"
      />

      <div class="min-w-0 space-y-4">
        <PasswordInput
          v-model="currentPassword"
          input-id="current-file-password"
          label="当前密码"
          placeholder="输入当前密码"
          :disabled="processing"
          :show-strength="false"
          @enter="canSubmit && submit()"
        />
        <PasswordInput
          v-model="newPassword"
          input-id="new-file-password"
          label="新密码"
          placeholder="输入新密码"
          :disabled="processing"
          allow-quick-fill
          @enter="canSubmit && submit()"
        />
        <PasswordInput
          v-model="confirmPassword"
          input-id="confirm-file-password"
          label="确认新密码"
          placeholder="再次输入新密码"
          :disabled="processing"
          :show-strength="false"
          @enter="canSubmit && submit()"
        />

        <el-button
          class="h-10.5! w-full font-semibold [--el-button-active-bg-color:#12573e] [--el-button-active-border-color:#12573e] [--el-button-bg-color:#176b4d] [--el-button-border-color:#176b4d] [--el-button-hover-bg-color:#217d5c] [--el-button-hover-border-color:#217d5c] [&>span]:gap-2"
          type="primary"
          size="large"
          :disabled="!canSubmit"
          :loading="processing"
          @click="submit"
        >
          <Key v-if="!processing" class="size-4.5" />
          {{ processing ? '正在修改...' : '修改密码' }}
        </el-button>
      </div>
    </div>

    <transition
      enter-active-class="fade-up-active"
      enter-from-class="fade-up-hidden"
      leave-active-class="fade-up-active"
      leave-to-class="fade-up-hidden"
    >
      <div v-if="result" class="mt-5 flex min-w-0 items-center gap-3 rounded-[7px] border border-[#cfe3da] bg-[#f3f9f6] px-3.5 py-3.25">
        <span class="grid size-8.5 shrink-0 place-items-center rounded-full bg-[#dceee6] text-[#176b4d]">
          <Select class="size-5" />
        </span>
        <span class="min-w-0 flex-1">
          <strong class="block truncate text-sm font-semibold">密码修改完成</strong>
          <small class="mt-0.5 block truncate text-xs text-[#858b93]" :title="result.filePath">
            {{ result.filePath }}
          </small>
        </span>
        <el-button type="primary" plain @click="revealResult">打开位置</el-button>
      </div>
    </transition>
  </div>
</template>
