<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { FolderOpened, Lock, Unlock } from '@element-plus/icons-vue'
import FileSelector from '../components/FileSelector.vue'
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

const modeOptions = [
  { label: '加密文件', value: 'encrypt' },
  { label: '解密文件', value: 'decrypt' },
]
const encryptionOptions = [
  { label: '密码', value: 0 },
  { label: '接收方公钥', value: 1 },
]
const settings = useEncryptionSettingsStore()
if (typeof settings.fileExtension !== 'string') settings.fileExtension = 'enc'
const {
  fileCompressionType,
  fileScryptProfile,
  fileExtension,
  historyEnabled,
} = storeToRefs(settings)
const mode = ref<FileMode>('encrypt')
const encryptionType = ref<EncryptionType>(0)
const sourceFile = ref<FileInfo | EncryptedFileInfo | null>(null)
const outputPath = ref('')
const password = ref('')
const publicKeyPem = ref('')
const publicKeyInfo = ref<PublicKeyInfo | null>(null)
const privateKeyPem = ref('')
const privateKeyPassphrase = ref('')
const managedKeys = ref<ManagedKeySummary[]>([])
const selectedManagedKeyId = ref('')
const processing = ref(false)
const progress = ref(0)
const result = ref<FileCryptoResult | null>(null)

const isEncrypt = computed(() => mode.value === 'encrypt')
const selectedEncryptionType = computed(() => (
  isEncrypt.value
    ? encryptionType.value
    : sourceFile.value && 'encryptionType' in sourceFile.value
      ? sourceFile.value.encryptionType
      : 0
))
const isPublicKeyMode = computed(() => selectedEncryptionType.value === 1)
const managedPublicKeys = computed(() => managedKeys.value)
const managedPrivateKeys = computed(() => {
  const identities = managedKeys.value.filter((item) => item.kind === 'identity')
  const fingerprint = sourceFile.value && 'recipientFingerprint' in sourceFile.value
    ? sourceFile.value.recipientFingerprint
    : ''
  return fingerprint
    ? identities.filter((item) => item.fingerprint === fingerprint)
    : identities
})
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
const expectedFingerprint = computed(() => {
  const value = sourceFile.value && 'recipientFingerprint' in sourceFile.value
    ? sourceFile.value.recipientFingerprint
    : ''
  return value.match(/.{1,4}/g)?.join(' ') || ''
})
const canSubmit = computed(() => (
  sourceFile.value
  && outputPath.value
  && (
    selectedEncryptionType.value === 0
      ? password.value
      : isEncrypt.value
        ? publicKeyInfo.value
        : (selectedManagedKeyId.value || privateKeyPem.value)
          && (!privateKeyEncrypted.value || privateKeyPassphrase.value)
  )
  && !processing.value
))

watch(mode, () => {
  sourceFile.value = null
  outputPath.value = ''
  password.value = ''
  publicKeyPem.value = ''
  publicKeyInfo.value = null
  privateKeyPem.value = ''
  privateKeyPassphrase.value = ''
  selectedManagedKeyId.value = ''
  progress.value = 0
  result.value = null
})

watch(encryptionType, () => {
  password.value = ''
  publicKeyPem.value = ''
  publicKeyInfo.value = null
  selectedManagedKeyId.value = ''
  result.value = null
})

watch(publicKeyPem, (value) => {
  publicKeyInfo.value = null
  if (!value.trim()) return
  try {
    publicKeyInfo.value = serviceApi().inspectPublicKey(value)
  } catch {
    // 输入过程中保持未通过状态，提交时再显示具体错误。
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

watch(fileExtension, () => {
  if (sourceFile.value && isEncrypt.value && !processing.value) {
    outputPath.value = serviceApi().getDefaultOutputPath(
      sourceFile.value.path,
      mode.value,
      fileExtension.value,
    )
  }
})

function serviceApi() {
  if (!window.services) throw new Error('请在 uTools 或 Electron 客户端中运行')
  return window.services
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

function fileName(filePath: string) {
  return filePath.split(/[\\/]/).pop()
}

function originalExtension(file: FileInfo | EncryptedFileInfo | null) {
  return file && 'originalExtension' in file && typeof file.originalExtension === 'string'
    ? file.originalExtension
    : ''
}

function selectSource() {
  try {
    const file = serviceApi().selectSourceFile(mode.value)
    if (!file) return
    const selectedSource: FileInfo | EncryptedFileInfo = isEncrypt.value
      ? file
      : serviceApi().inspectEncryptedFile(file.path)
    sourceFile.value = selectedSource
    outputPath.value = serviceApi().getDefaultOutputPath(
      file.path,
      mode.value,
      fileExtension.value,
      originalExtension(selectedSource),
    )
    progress.value = 0
    result.value = null
    password.value = ''
    privateKeyPem.value = ''
    privateKeyPassphrase.value = ''
    selectedManagedKeyId.value = ''
    const encryptedSource = !isEncrypt.value ? selectedSource as EncryptedFileInfo : null
    if (encryptedSource?.encryptionType === 1) {
      const matched = managedPrivateKeys.value.find((item) => (
        item.fingerprint === encryptedSource.recipientFingerprint
      ))
      if (matched) selectedManagedKeyId.value = matched.id
    }
  } catch (error) {
    if (!isEncrypt.value) {
      sourceFile.value = null
      outputPath.value = ''
    }
    ElMessage.error(error.message)
  }
}

function loadManagedKeys() {
  if (!window.services) return
  try {
    managedKeys.value = serviceApi().listManagedKeys()
  } catch {
    managedKeys.value = []
  }
}

function clearSource() {
  sourceFile.value = null
  outputPath.value = ''
  progress.value = 0
  result.value = null
  password.value = ''
  privateKeyPem.value = ''
  privateKeyPassphrase.value = ''
  selectedManagedKeyId.value = ''
}

function selectOutput() {
  if (!sourceFile.value) return ElMessage.warning('请先选择输入文件')
  try {
    const selectedPath = serviceApi().selectOutputFile(
      sourceFile.value.path,
      mode.value,
      fileExtension.value,
      originalExtension(sourceFile.value),
    )
    if (selectedPath) outputPath.value = selectedPath
  } catch (error) {
    ElMessage.error(error.message)
  }
}

async function submit() {
  if (!sourceFile.value) return ElMessage.warning('请选择输入文件')
  if (!outputPath.value) return ElMessage.warning('请选择输出位置')
  if (selectedEncryptionType.value === 0 && !password.value) {
    return ElMessage.warning('请输入密码')
  }
  if (isEncrypt.value && selectedEncryptionType.value === 1 && !publicKeyInfo.value) {
    try {
      publicKeyInfo.value = serviceApi().inspectPublicKey(publicKeyPem.value)
    } catch (error) {
      return ElMessage.warning(error.message)
    }
  }
  if (!isEncrypt.value
    && selectedEncryptionType.value === 1
    && !selectedManagedKeyId.value
    && !privateKeyPem.value) {
    return ElMessage.warning('请输入接收方私钥')
  }
  if (!isEncrypt.value && privateKeyEncrypted.value && !privateKeyPassphrase.value) {
    return ElMessage.warning('请输入私钥保护密码')
  }

  const encryptionStartedAt = isEncrypt.value ? new Date().toISOString() : ''
  processing.value = true
  progress.value = 0
  result.value = null
  try {
    const sourcePath = sourceFile.value.path
    const commonOptions = {
      sourcePath,
      outputPath: outputPath.value,
      onProgress: (percentage: number) => {
        progress.value = percentage
      },
    }
    const operationResult = isEncrypt.value
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
    result.value = operationResult

    let historySaved = true
    if (isEncrypt.value && historyEnabled.value) {
      try {
        serviceApi().addEncryptionHistory({
          filePath: sourcePath,
          outputPath: operationResult.outputPath,
          encryptionType: encryptionType.value,
          password: encryptionType.value === 0 ? password.value : undefined,
          recipientFingerprint: operationResult.recipientFingerprint,
          createdAt: encryptionStartedAt,
        })
      } catch {
        historySaved = false
      }
    }

    if (!historySaved) ElMessage.warning('加密完成，但历史记录保存失败')
    else ElMessage.success(`${isEncrypt.value ? '加密' : '解密'}完成`)
  } catch (error) {
    progress.value = 0
    ElMessage.error(error.message)
  } finally {
    processing.value = false
  }
}

function revealResult() {
  if (result.value) serviceApi().showItemInFolder(result.value.outputPath)
}

onMounted(loadManagedKeys)
</script>

<template>
  <div class="p-5.5 max-[520px]:p-4.5">
    <el-segmented
      v-model="mode"
      :options="modeOptions"
      block
      class="w-full [--el-segmented-item-selected-bg-color:#176b4d] [--el-segmented-item-selected-color:#fff]"
    />

    <div v-if="isEncrypt" class="mt-4 flex min-w-0 items-center justify-between gap-4">
      <span class="shrink-0 text-[13px] font-semibold text-[#41464d]">加密方式</span>
      <el-segmented
        v-model="encryptionType"
        :options="encryptionOptions"
        :disabled="processing"
        class="min-w-0 flex-1 min-[620px]:max-w-80 [--el-segmented-item-selected-bg-color:#176b4d] [--el-segmented-item-selected-color:#fff]"
      />
    </div>

    <div class="mt-6 grid min-w-0 items-start gap-6">
      <FileSelector
        class="mt-0!"
        :file="sourceFile"
        :mode="mode"
        :disabled="processing"
        @select="selectSource"
        @clear="clearSource"
      />

      <div class="min-w-0">
        <PasswordInput
          v-if="!isPublicKeyMode"
          v-model="password"
          input-id="file-password"
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
            >
              <span class="flex min-w-0 items-center justify-between gap-3">
                <span class="truncate">{{ item.name }}</span>
                <small class="shrink-0 font-mono text-[#8a9097]">{{ item.fingerprint.slice(0, 12) }}</small>
              </span>
            </el-option>
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

        <div
          v-else-if="isPublicKeyMode && selectedManagedKey"
          class="break-all text-xs text-[#737a81]"
        >
          SHA-256 {{ selectedManagedKey.formattedFingerprint }}
        </div>

        <PasswordInput
          v-if="!isEncrypt && isPublicKeyMode && privateKeyEncrypted"
          v-model="privateKeyPassphrase"
          input-id="private-key-passphrase"
          label="私钥保护密码"
          placeholder="输入私钥保护密码"
          :disabled="processing"
          :show-strength="false"
          @enter="canSubmit && submit()"
        />

        <div class="mt-5 flex min-w-0 flex-col gap-2">
          <span class="text-[13px] font-semibold text-[#41464d]">输出位置</span>
          <el-input
            v-model="outputPath"
            size="large"
            readonly
            placeholder="选择输入文件后自动生成"
            :disabled="processing"
          >
            <template #suffix>
              <el-button text class="gap-1.5 pr-0!" @click="selectOutput">
                <FolderOpened class="size-4" />
                浏览
              </el-button>
            </template>
          </el-input>
        </div>

        <el-button
          class="mt-6 h-10.5! w-full font-semibold [--el-button-active-bg-color:#12573e] [--el-button-active-border-color:#12573e] [--el-button-bg-color:#176b4d] [--el-button-border-color:#176b4d] [--el-button-hover-bg-color:#217d5c] [--el-button-hover-border-color:#217d5c] [&>span]:gap-2"
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

        <transition
          enter-active-class="fade-up-active"
          enter-from-class="fade-up-hidden"
          leave-active-class="fade-up-active"
          leave-to-class="fade-up-hidden"
        >
          <div v-if="processing || result" class="mt-4">
            <div class="mb-2 flex items-center justify-between text-xs">
              <span class="font-medium text-[#5f666d]">{{ isEncrypt ? '加密进度' : '解密进度' }}</span>
              <span class="font-mono text-[#737a81]">{{ progress }}%</span>
            </div>
            <el-progress
              :percentage="progress"
              :stroke-width="8"
              :show-text="false"
              :status="result ? 'success' : undefined"
            />
          </div>
        </transition>
      </div>
    </div>

    <transition
      enter-active-class="fade-up-active"
      enter-from-class="fade-up-hidden"
      leave-active-class="fade-up-active"
      leave-to-class="fade-up-hidden"
    >
      <div v-if="result" class="mt-4 flex min-w-0 items-center gap-3 rounded-[7px] border border-[#cfe3da] bg-[#f3f9f6] px-3.5 py-3.25">
        <span class="grid size-8.5 shrink-0 place-items-center rounded-full bg-[#dceee6] text-[#176b4d]">
          <Lock v-if="isEncrypt" class="size-5" />
          <Unlock v-else class="size-5" />
        </span>
        <span class="flex min-w-0 flex-1 flex-col overflow-hidden text-left">
          <strong class="truncate text-sm font-semibold">{{ isEncrypt ? '加密完成' : '解密完成' }}</strong>
          <span class="mt-0.5 truncate text-xs text-[#555c64]" :title="result.outputPath">
            {{ fileName(result.outputPath) }}
          </span>
          <small class="mt-0.75 text-xs text-[#858b93]">{{ formatSize(result.outputSize) }}</small>
          <small
            v-if="result.recipientFingerprint"
            class="mt-0.75 truncate font-mono text-xs text-[#737a81]"
            :title="result.recipientFingerprint"
          >
            接收方 {{ result.recipientFingerprint }}
          </small>
        </span>
        <el-button type="primary" plain @click="revealResult">打开位置</el-button>
      </div>
    </transition>

  </div>
</template>
