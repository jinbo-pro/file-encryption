<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { storeToRefs } from 'pinia'
import {
  CircleCheck,
  Delete,
  DocumentAdd,
  FolderOpened,
  Lock,
  Refresh,
  Unlock,
  VideoPause,
  Warning,
} from '@element-plus/icons-vue'
import KeyInput from '../components/KeyInput.vue'
import PasswordInput from '../components/PasswordInput.vue'
import { useEncryptionSettingsStore } from '../stores/encryptionSettings'
import type {
  DecryptFileOptions,
  EncryptedFileInfo,
  EncryptionType,
  FileCryptoResult,
  FileInfo,
  FileMode,
  ManagedKeySummary,
  PublicKeyInfo,
} from '../../shared/preload-api'

type BatchStatus = 'pending' | 'running' | 'success' | 'error' | 'cancelled'
type OutputStrategy = 'source' | 'directory'

interface BatchFile extends FileInfo {
  id: string
  outputPath: string
  status: BatchStatus
  progress: number
  error?: string
  preflightError?: boolean
  encryptedInfo?: EncryptedFileInfo
  result?: FileCryptoResult
}

const modeOptions = [
  { label: '批量加密', value: 'encrypt' },
  { label: '批量解密', value: 'decrypt' },
]
const encryptionOptions = [
  { label: '密码', value: 0 },
  { label: '接收方公钥', value: 1 },
]
const outputOptions = [
  { label: '原文件目录', value: 'source' },
  { label: '指定目录', value: 'directory' },
]

const settings = useEncryptionSettingsStore()
const {
  fileCompressionType,
  fileScryptProfile,
  fileExtension,
  historyEnabled,
} = storeToRefs(settings)
const mode = ref<FileMode>('encrypt')
const encryptionType = ref<EncryptionType>(0)
const outputStrategy = ref<OutputStrategy>('source')
const outputDirectory = ref('')
const files = ref<BatchFile[]>([])
const password = ref('')
const publicKeyPem = ref('')
const publicKeyInfo = ref<PublicKeyInfo | null>(null)
const privateKeyPem = ref('')
const privateKeyPassphrase = ref('')
const managedKeys = ref<ManagedKeySummary[]>([])
const selectedManagedKeyId = ref('')
const processing = ref(false)
const cancellationRequested = ref(false)
const abortController = shallowRef<AbortController | null>(null)

const isEncrypt = computed(() => mode.value === 'encrypt')
const successCount = computed(() => files.value.filter((file) => file.status === 'success').length)
const failureCount = computed(() => files.value.filter((file) => file.status === 'error').length)
const cancelledCount = computed(() => files.value.filter((file) => file.status === 'cancelled').length)
const completedCount = computed(() => successCount.value + failureCount.value)
const hasSuccessfulOutput = computed(() => successCount.value > 0)
const editable = computed(() => !processing.value && !hasSuccessfulOutput.value)
const validFiles = computed(() => files.value.filter((file) => !file.preflightError))
const runnableFiles = computed(() => files.value.filter((file) => file.status === 'pending'))
const decryptTypes = computed(() => new Set(
  validFiles.value
    .map((file) => file.encryptedInfo?.encryptionType)
    .filter((value): value is EncryptionType => value === 0 || value === 1),
))
const decryptFingerprints = computed(() => new Set(
  validFiles.value
    .map((file) => file.encryptedInfo?.recipientFingerprint)
    .filter((value): value is string => Boolean(value)),
))
const selectedEncryptionType = computed<EncryptionType>(() => {
  if (isEncrypt.value) return encryptionType.value
  return decryptTypes.value.size === 1 ? [...decryptTypes.value][0] : 0
})
const isPublicKeyMode = computed(() => selectedEncryptionType.value === 1)
const compatibilityError = computed(() => {
  if (isEncrypt.value || validFiles.value.length === 0) return ''
  if (decryptTypes.value.size > 1) return '同一批次不能混合处理密码加密包和公钥加密包'
  if (decryptFingerprints.value.size > 1) return '同一批次的公钥加密包必须属于同一接收方'
  return ''
})
const expectedFingerprintValue = computed(() => [...decryptFingerprints.value][0] || '')
const expectedFingerprint = computed(() => (
  expectedFingerprintValue.value.match(/.{1,4}/g)?.join(' ') || ''
))
const managedPublicKeys = computed(() => managedKeys.value)
const managedPrivateKeys = computed(() => managedKeys.value.filter((item) => (
  item.kind === 'identity'
  && (!expectedFingerprintValue.value || item.fingerprint === expectedFingerprintValue.value)
)))
const selectedManagedKey = computed(() => (
  managedKeys.value.find((item) => item.id === selectedManagedKeyId.value) || null
))
const keyPem = computed<string>({
  get: () => isEncrypt.value ? publicKeyPem.value : privateKeyPem.value,
  set: (value) => {
    if (isEncrypt.value) publicKeyPem.value = value
    else privateKeyPem.value = value
  },
})
const privateKeyEncrypted = computed(() => (
  Boolean(selectedManagedKeyId.value)
  || /BEGIN ENCRYPTED PRIVATE KEY/.test(privateKeyPem.value)
))
const overallProgress = computed(() => {
  const candidates = validFiles.value
  const totalBytes = candidates.reduce((total, file) => total + Math.max(file.size, 1), 0)
  if (!totalBytes) return 0
  const processedBytes = candidates.reduce((total, file) => {
    const percentage = file.status === 'success' || file.status === 'error'
      ? 100
      : file.status === 'running' ? file.progress : 0
    return total + Math.max(file.size, 1) * percentage / 100
  }, 0)
  return Math.min(100, Math.round(processedBytes / totalBytes * 100))
})
const canSubmit = computed(() => (
  runnableFiles.value.length > 0
  && !compatibilityError.value
  && (
    selectedEncryptionType.value === 0
      ? Boolean(password.value)
      : isEncrypt.value
        ? Boolean(publicKeyInfo.value)
        : Boolean(selectedManagedKeyId.value || privateKeyPem.value)
          && (!privateKeyEncrypted.value || Boolean(privateKeyPassphrase.value))
  )
  && !processing.value
))

watch(mode, resetBatch)
watch(encryptionType, resetCredentials)
watch(outputStrategy, () => {
  if (outputStrategy.value === 'source') outputDirectory.value = ''
  planOutputs()
})
watch(fileExtension, () => {
  if (isEncrypt.value) planOutputs()
})
watch(publicKeyPem, (value) => {
  publicKeyInfo.value = null
  if (!value.trim()) return
  try {
    publicKeyInfo.value = serviceApi().inspectPublicKey(value)
  } catch {
    // 输入尚未完整时保持未通过状态。
  }
})
watch(selectedManagedKeyId, (id, previousId) => {
  if (!id) {
    if (previousId && isEncrypt.value) publicKeyPem.value = ''
    return
  }
  if (isEncrypt.value) {
    try {
      publicKeyPem.value = serviceApi().getManagedPublicKey(id)
    } catch (error) {
      selectedManagedKeyId.value = ''
      ElMessage.error(error.message)
    }
  } else {
    privateKeyPem.value = ''
    privateKeyPassphrase.value = ''
  }
})
watch(expectedFingerprintValue, () => {
  if (isEncrypt.value || selectedManagedKeyId.value) return
  const matched = managedPrivateKeys.value[0]
  if (matched) selectedManagedKeyId.value = matched.id
})

function serviceApi() {
  if (!window.services) throw new Error('请在 uTools 或 Electron 客户端中运行')
  return window.services
}

function normalizePath(filePath: string) {
  return filePath.replace(/\\/g, '/').toLowerCase()
}

function fileName(filePath: string) {
  return filePath.split(/[\\/]/).pop() || filePath
}

function directoryName(filePath: string) {
  return filePath.replace(/[\\/][^\\/]*$/, '')
}

function formatSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) return '--'
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let index = 0
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024
    index += 1
  }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[index]}`
}

function createId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`
}

function resetCredentials() {
  password.value = ''
  publicKeyPem.value = ''
  publicKeyInfo.value = null
  privateKeyPem.value = ''
  privateKeyPassphrase.value = ''
  selectedManagedKeyId.value = ''
}

function resetBatch() {
  if (processing.value) return
  files.value = []
  outputStrategy.value = 'source'
  outputDirectory.value = ''
  cancellationRequested.value = false
  resetCredentials()
}

function planOutputs() {
  if (!files.value.length || processing.value || hasSuccessfulOutput.value) return
  if (outputStrategy.value === 'directory' && !outputDirectory.value) {
    files.value.forEach((file) => { file.outputPath = '' })
    return
  }
  try {
    const plans = serviceApi().getBatchOutputPaths(
      files.value.map((file) => file.path),
      mode.value,
      outputStrategy.value === 'directory' ? outputDirectory.value : undefined,
      fileExtension.value,
      files.value.map((file) => file.encryptedInfo?.originalExtension || ''),
    )
    const outputs = new Map(plans.map((plan) => [normalizePath(plan.sourcePath), plan.outputPath]))
    files.value.forEach((file) => {
      file.outputPath = outputs.get(normalizePath(file.path)) || ''
    })
  } catch (error) {
    ElMessage.error(error.message)
  }
}

function inspectSelectedFile(file: FileInfo): BatchFile {
  const batchFile: BatchFile = {
    ...file,
    id: createId(),
    outputPath: '',
    status: 'pending',
    progress: 0,
  }
  if (isEncrypt.value) return batchFile
  try {
    batchFile.encryptedInfo = serviceApi().inspectEncryptedFile(file.path)
  } catch (error) {
    batchFile.status = 'error'
    batchFile.error = error.message
    batchFile.preflightError = true
  }
  return batchFile
}

function selectFiles() {
  try {
    const selected = serviceApi().selectSourceFiles(mode.value)
    if (!selected.length) return
    const existing = new Set(files.value.map((file) => normalizePath(file.path)))
    const additions = selected
      .filter((file) => !existing.has(normalizePath(file.path)))
      .map(inspectSelectedFile)
    files.value.push(...additions)
    planOutputs()
    if (!additions.length) ElMessage.info('所选文件已在列表中')
    const invalidCount = additions.filter((file) => file.preflightError).length
    if (invalidCount) ElMessage.warning(`${invalidCount} 个文件不是有效的 FENC 加密包`)
  } catch (error) {
    ElMessage.error(error.message)
  }
}

function selectDirectory() {
  try {
    const selected = serviceApi().selectOutputDirectory(
      outputDirectory.value || (files.value[0] ? directoryName(files.value[0].path) : undefined),
    )
    if (!selected) return
    outputDirectory.value = selected
    outputStrategy.value = 'directory'
    planOutputs()
  } catch (error) {
    ElMessage.error(error.message)
  }
}

function removeFile(id: string) {
  files.value = files.value.filter((file) => file.id !== id)
  planOutputs()
}

function clearFiles() {
  files.value = []
  resetCredentials()
}

function cancelBatch() {
  if (!abortController.value || cancellationRequested.value) return
  cancellationRequested.value = true
  abortController.value.abort()
}

function markRemainingCancelled() {
  files.value.forEach((file) => {
    if (file.status === 'pending') {
      file.status = 'cancelled'
      file.progress = 0
    }
  })
}

async function submit() {
  if (!canSubmit.value) return
  const controller = new AbortController()
  abortController.value = controller
  processing.value = true
  cancellationRequested.value = false
  let historyFailures = 0

  try {
    for (const file of files.value) {
      if (file.status !== 'pending') continue
      if (controller.signal.aborted) {
        markRemainingCancelled()
        break
      }

      file.status = 'running'
      file.progress = 0
      file.error = ''
      const startedAt = new Date().toISOString()
      try {
        const commonOptions = {
          sourcePath: file.path,
          outputPath: file.outputPath,
          signal: controller.signal,
          onProgress: (percentage: number) => { file.progress = percentage },
        }
        const result = isEncrypt.value
          ? await serviceApi().encryptFile({
              ...commonOptions,
              password: encryptionType.value === 0 ? password.value : undefined,
              publicKeyPem: encryptionType.value === 1 ? publicKeyPem.value : undefined,
              compressionType: fileCompressionType.value,
              encryptionType: encryptionType.value,
              scryptProfile: fileScryptProfile.value,
            })
          : await serviceApi().decryptFile({
              ...commonOptions,
              password: selectedEncryptionType.value === 0 ? password.value : undefined,
              privateKeyId: selectedManagedKeyId.value || undefined,
              privateKeyPem: selectedManagedKeyId.value ? undefined : privateKeyPem.value,
              privateKeyPassphrase: privateKeyPassphrase.value,
            } satisfies DecryptFileOptions)

        file.result = result
        file.progress = 100
        file.status = 'success'
        if (isEncrypt.value && historyEnabled.value) {
          try {
            serviceApi().addEncryptionHistory({
              filePath: file.path,
              outputPath: result.outputPath,
              encryptionType: encryptionType.value,
              password: encryptionType.value === 0 ? password.value : undefined,
              recipientFingerprint: result.recipientFingerprint,
              createdAt: startedAt,
            })
          } catch {
            historyFailures += 1
          }
        }
      } catch (error) {
        if (controller.signal.aborted || error.name === 'AbortError') {
          file.status = 'cancelled'
          file.progress = 0
          file.error = '操作已取消'
          markRemainingCancelled()
          break
        }
        file.status = 'error'
        file.progress = 100
        file.error = error.message
      }
    }

    if (cancellationRequested.value) ElMessage.info('批量任务已取消')
    else if (failureCount.value) ElMessage.warning(`处理完成，${failureCount.value} 个文件失败`)
    else ElMessage.success('批量处理完成')
    if (historyFailures) ElMessage.warning(`${historyFailures} 条加密历史保存失败`)
  } finally {
    processing.value = false
    cancellationRequested.value = false
    abortController.value = null
  }
}

function retryFailed() {
  files.value.forEach((file) => {
    if ((file.status === 'error' && !file.preflightError) || file.status === 'cancelled') {
      file.status = 'pending'
      file.progress = 0
      file.error = ''
      file.result = undefined
    }
  })
  void submit()
}

function revealOutput(file?: { result?: FileCryptoResult }) {
  const target = file?.result?.outputPath || files.value.find((item) => item.result)?.result?.outputPath
  if (target) serviceApi().showItemInFolder(target)
}

function loadManagedKeys() {
  if (!window.services) return
  try {
    managedKeys.value = serviceApi().listManagedKeys()
  } catch {
    managedKeys.value = []
  }
}

onMounted(loadManagedKeys)
onBeforeUnmount(() => abortController.value?.abort())
</script>

<template>
  <div class="p-5.5 max-[520px]:p-4.5">
    <el-segmented
      v-model="mode"
      :options="modeOptions"
      :disabled="processing"
      block
      class="w-full [--el-segmented-item-selected-bg-color:#176b4d] [--el-segmented-item-selected-color:#fff]"
    />

    <div v-if="isEncrypt" class="mt-4 flex min-w-0 items-center justify-between gap-4">
      <span class="shrink-0 text-[13px] font-semibold text-[#41464d]">加密方式</span>
      <el-segmented
        v-model="encryptionType"
        :options="encryptionOptions"
        :disabled="!editable"
        class="min-w-0 flex-1 min-[620px]:max-w-80 [--el-segmented-item-selected-bg-color:#176b4d] [--el-segmented-item-selected-color:#fff]"
      />
    </div>

    <div class="mt-5 flex min-w-0 flex-wrap items-center gap-3">
      <el-button type="primary" class="[&>span]:gap-2" :disabled="!editable" @click="selectFiles">
        <DocumentAdd class="size-4" />
        {{ files.length ? '添加文件' : '选择文件' }}
      </el-button>
      <el-button text class="[&>span]:gap-2" :disabled="!files.length || !editable" @click="clearFiles">
        <Delete class="size-4" />
        清空
      </el-button>
      <span v-if="files.length" class="ml-auto text-xs text-[#737a81]">
        {{ completedCount }} / {{ files.length }} 已处理
      </span>
    </div>

    <button
      v-if="!files.length"
      type="button"
      class="mt-4 flex min-h-38 w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-[7px] border border-dashed border-[#bdc5cd] bg-[#fafbfc] text-[#32373d] transition-colors hover:border-[#176b4d] hover:bg-[#f5faf7]"
      @click="selectFiles"
    >
      <span class="grid size-11 place-items-center rounded-lg bg-[#e1eee9] text-[#176b4d]">
        <DocumentAdd class="size-5.5" />
      </span>
      <strong class="text-sm font-semibold">选择多个文件</strong>
    </button>

    <div v-else class="mt-4 overflow-hidden rounded-[7px] border border-[#e0e3e6]">
      <el-table :data="files" table-layout="fixed" class="w-full">
        <el-table-column type="index" label="#" width="50" align="center" />
        <el-table-column label="输入文件" min-width="230">
          <template #default="{ row }">
            <div class="min-w-0">
              <strong class="block truncate text-[13px] font-medium" :title="row.path">{{ row.name }}</strong>
              <small class="mt-0.5 block truncate text-xs text-[#8a9097]" :title="row.path">{{ row.path }}</small>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="大小" width="92">
          <template #default="{ row }">{{ formatSize(row.size) }}</template>
        </el-table-column>
        <el-table-column label="输出文件" min-width="190">
          <template #default="{ row }">
            <span class="block truncate text-xs" :title="row.outputPath">{{ fileName(row.outputPath) || '--' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="进度" width="116">
          <template #default="{ row }">
            <el-progress
              v-if="row.status === 'running'"
              :percentage="row.progress"
              :stroke-width="6"
              :show-text="false"
            />
            <span v-else-if="row.status === 'pending'" class="text-xs text-[#8a9097]">待处理</span>
            <span v-else-if="row.status === 'cancelled'" class="text-xs text-[#8a9097]">已取消</span>
            <el-button v-else-if="row.status === 'success'" text type="primary" @click="revealOutput(row)">
              打开位置
            </el-button>
            <el-tooltip v-else :content="row.error || '处理失败'" placement="left">
              <span class="inline-flex items-center gap-1 text-xs text-[#c2413b]">
                <Warning class="size-4" />失败
              </span>
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column fixed="right" width="48" align="center">
          <template #default="{ row }">
            <el-tooltip content="移除" placement="left">
              <el-button
                text
                circle
                aria-label="移除文件"
                :disabled="!editable"
                @click="removeFile(row.id)"
              >
                <Delete class="size-4" />
              </el-button>
            </el-tooltip>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-alert
      v-if="compatibilityError"
      class="mt-4"
      type="warning"
      :title="compatibilityError"
      :closable="false"
      show-icon
    />

    <div v-if="files.length" class="mt-5 grid min-w-0 gap-5 border-t border-[#e4e7ea] pt-5 min-[760px]:grid-cols-2">
      <div class="min-w-0">
        <PasswordInput
          v-if="!isPublicKeyMode"
          v-model="password"
          input-id="batch-file-password"
          :disabled="processing"
          :allow-quick-fill="isEncrypt"
          @enter="canSubmit && submit()"
        />

        <div v-if="isPublicKeyMode" class="mb-4 flex min-w-0 flex-col gap-2">
          <span class="text-[13px] font-semibold text-[#41464d]">
            {{ isEncrypt ? '已保存的接收方' : '本机私钥' }}
          </span>
          <el-select
            v-model="selectedManagedKeyId"
            clearable
            filterable
            size="large"
            :disabled="processing"
            :placeholder="isEncrypt ? '选择已保存公钥，或在下方粘贴' : '选择匹配私钥，或在下方粘贴'"
          >
            <el-option
              v-for="item in isEncrypt ? managedPublicKeys : managedPrivateKeys"
              :key="item.id"
              :label="item.name"
              :value="item.id"
            />
          </el-select>
        </div>

        <KeyInput
          v-if="isPublicKeyMode && !selectedManagedKeyId"
          v-model="keyPem"
          :label="isEncrypt ? '接收方公钥' : '接收方私钥'"
          :key-type="isEncrypt ? 'public' : 'private'"
          :disabled="processing"
          :key-info="isEncrypt ? publicKeyInfo : null"
          :expected-fingerprint="isEncrypt ? '' : expectedFingerprint"
        />

        <div v-else-if="isPublicKeyMode && selectedManagedKey" class="break-all text-xs text-[#737a81]">
          SHA-256 {{ selectedManagedKey.formattedFingerprint }}
        </div>

        <PasswordInput
          v-if="!isEncrypt && isPublicKeyMode && privateKeyEncrypted"
          v-model="privateKeyPassphrase"
          input-id="batch-private-key-passphrase"
          label="私钥保护密码"
          placeholder="输入私钥保护密码"
          :disabled="processing"
          :show-strength="false"
          @enter="canSubmit && submit()"
        />
      </div>

      <div class="min-w-0">
        <div class="flex min-w-0 flex-col gap-2">
          <span class="text-[13px] font-semibold text-[#41464d]">输出位置</span>
          <el-segmented
            v-model="outputStrategy"
            :options="outputOptions"
            :disabled="!editable"
            block
          />
          <el-input
            v-if="outputStrategy === 'directory'"
            v-model="outputDirectory"
            readonly
            size="large"
            placeholder="选择输出文件夹"
            :disabled="!editable"
          >
            <template #suffix>
              <el-button text class="pr-0!" @click="selectDirectory">
                <FolderOpened class="size-4" />
              </el-button>
            </template>
          </el-input>
        </div>

        <div class="mt-5">
          <div class="mb-2 flex items-center justify-between text-xs">
            <span class="font-medium text-[#5f666d]">整体进度</span>
            <span class="font-mono text-[#737a81]">{{ overallProgress }}%</span>
          </div>
          <el-progress
            :percentage="overallProgress"
            :stroke-width="8"
            :show-text="false"
            :status="validFiles.length > 0 && successCount === validFiles.length ? 'success' : undefined"
          />
          <div class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#737a81]">
            <span>成功 {{ successCount }}</span>
            <span>失败 {{ failureCount }}</span>
            <span>取消 {{ cancelledCount }}</span>
          </div>
        </div>
      </div>
    </div>

    <div v-if="files.length" class="mt-5 flex min-w-0 gap-3">
      <el-button
        v-if="processing"
        class="h-10.5! flex-1 font-semibold [&>span]:gap-2"
        type="danger"
        plain
        :disabled="cancellationRequested"
        @click="cancelBatch"
      >
        <VideoPause class="size-4.5" />
        {{ cancellationRequested ? '正在取消...' : '取消任务' }}
      </el-button>
      <template v-else>
        <el-button
          v-if="failureCount || cancelledCount"
          class="h-10.5! [&>span]:gap-2"
          :disabled="!files.some((file) => (file.status === 'error' && !file.preflightError) || file.status === 'cancelled')"
          @click="retryFailed"
        >
          <Refresh class="size-4.5" />
          重试失败项
        </el-button>
        <el-button
          class="h-10.5! flex-1 font-semibold [--el-button-active-bg-color:#12573e] [--el-button-active-border-color:#12573e] [--el-button-bg-color:#176b4d] [--el-button-border-color:#176b4d] [--el-button-hover-bg-color:#217d5c] [--el-button-hover-border-color:#217d5c] [&>span]:gap-2"
          type="primary"
          :disabled="!canSubmit"
          @click="submit"
        >
          <Lock v-if="isEncrypt" class="size-4.5" />
          <Unlock v-else class="size-4.5" />
          {{ isEncrypt ? '开始批量加密' : '开始批量解密' }}
        </el-button>
        <el-button v-if="hasSuccessfulOutput" class="h-10.5!" @click="resetBatch">
          新任务
        </el-button>
      </template>
    </div>

    <div v-if="hasSuccessfulOutput" class="mt-4 flex items-center gap-2 text-xs text-[#176b4d]">
      <CircleCheck class="size-4.5" />
      已生成 {{ successCount }} 个文件
    </div>
  </div>
</template>
