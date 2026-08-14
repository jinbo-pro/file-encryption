<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { RefreshLeft } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useEncryptionSettingsStore } from '../stores/encryptionSettings'

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false,
  },
})
const emit = defineEmits(['update:modelValue'])

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
})

const settings = useEncryptionSettingsStore()
if (typeof settings.fileExtension !== 'string') settings.fileExtension = 'enc'
const {
  fileCompressionType,
  fileScryptProfile,
  textCompressionType,
  textScryptProfile,
  fileExtension,
  historyEnabled,
} = storeToRefs(settings)
const resetting = ref(false)
const activeGroup = ref('file')

function formatFileExtension(value: string) {
  return String(value)
    .replace(/[^a-zA-Z0-9]/g, '')
    .replace(/^[^a-zA-Z]+/, '')
    .slice(0, 8)
}

function ensureFileExtension() {
  if (!fileExtension.value) fileExtension.value = 'enc'
}

async function resetApplicationData() {
  try {
    await ElMessageBox.confirm(
      '将清空加密历史、非对称密钥、记住的密码填充方式和当前设置，且无法恢复。',
      '确认重置',
      {
        type: 'warning',
        confirmButtonText: '确认重置',
        cancelButtonText: '取消',
        confirmButtonClass: 'el-button--danger',
      },
    )
  } catch {
    return
  }

  resetting.value = true
  try {
    if (!window.services) throw new Error('请在 uTools 或 Electron 客户端中运行')
    window.services.clearEncryptionHistory()
    window.services.clearManagedKeys()
    localStorage.clear()
    sessionStorage.clear()
    settings.resetSettings()
    visible.value = false
    window.location.reload()
  } catch (error) {
    resetting.value = false
    ElMessage.error(`重置失败：${error.message}`)
  }
}
</script>

<template>
  <el-drawer
    v-model="visible"
    title="加密设置"
    direction="ltr"
    size="min(440px, calc(100vw - 32px))"
    class="encryption-settings-drawer"
    append-to-body
  >
    <el-collapse v-model="activeGroup" accordion class="border-t-0!">
      <el-collapse-item name="file">
        <template #title>
          <span class="text-sm font-semibold text-[#30353a]">文件加密设置</span>
        </template>

        <div class="flex min-w-0 flex-col gap-5 pb-2">
          <div class="flex min-w-0 flex-col gap-2">
            <span class="text-[13px] font-semibold text-[#41464d]">压缩方式</span>
            <el-select v-model="fileCompressionType" size="large">
              <el-option label="Gzip（兼容性好）" :value="0" />
              <el-option label="Brotli（压缩率高）" :value="1" />
              <el-option label="不压缩" :value="2" />
            </el-select>
          </div>

          <div class="flex min-w-0 flex-col gap-2">
            <span class="text-[13px] font-semibold text-[#41464d]">密钥派生强度</span>
            <el-select v-model="fileScryptProfile" size="large">
              <el-option label="标准（推荐）" :value="0" />
              <el-option label="性能（速度优先）" :value="1" />
              <el-option label="安全（强度优先）" :value="2" />
            </el-select>
          </div>

          <div class="flex min-w-0 flex-col gap-2">
            <span class="text-[13px] font-semibold text-[#41464d]">加密文件后缀</span>
            <el-input
              v-model="fileExtension"
              size="large"
              maxlength="8"
              placeholder="enc"
              :formatter="formatFileExtension"
              :parser="formatFileExtension"
              @blur="ensureFileExtension"
            >
              <template #prepend>.</template>
            </el-input>
          </div>

          <div class="flex min-w-0 items-center justify-between gap-4">
            <span class="text-[13px] font-semibold text-[#41464d]">记录加密历史</span>
            <el-switch
              v-model="historyEnabled"
              class="shrink-0 [--el-switch-on-color:#176b4d]"
            />
          </div>
        </div>
      </el-collapse-item>

      <el-collapse-item name="text">
        <template #title>
          <span class="text-sm font-semibold text-[#30353a]">文本加密设置</span>
        </template>

        <div class="flex min-w-0 flex-col gap-5 pb-2">
          <div class="flex min-w-0 flex-col gap-2">
            <span class="text-[13px] font-semibold text-[#41464d]">压缩方式</span>
            <el-select v-model="textCompressionType" size="large">
              <el-option label="Gzip（兼容性好）" :value="0" />
              <el-option label="Brotli（压缩率高）" :value="1" />
              <el-option label="不压缩" :value="2" />
            </el-select>
          </div>

          <div class="flex min-w-0 flex-col gap-2">
            <span class="text-[13px] font-semibold text-[#41464d]">密钥派生强度</span>
            <el-select v-model="textScryptProfile" size="large">
              <el-option label="标准（推荐）" :value="0" />
              <el-option label="性能（速度优先）" :value="1" />
              <el-option label="安全（强度优先）" :value="2" />
            </el-select>
          </div>
        </div>
      </el-collapse-item>
    </el-collapse>

    <template #footer>
      <div class="flex items-center justify-between gap-3">
        <el-button
          type="danger"
          plain
          :loading="resetting"
          class="[&>span]:gap-1.5"
          @click="resetApplicationData"
        >
          <RefreshLeft v-if="!resetting" class="size-4" />
          重置
        </el-button>
        <el-button
          type="primary"
          class="[--el-button-bg-color:#176b4d] [--el-button-border-color:#176b4d] [--el-button-hover-bg-color:#217d5c] [--el-button-hover-border-color:#217d5c]"
          @click="visible = false"
        >
          完成
        </el-button>
      </div>
    </template>
  </el-drawer>
</template>
