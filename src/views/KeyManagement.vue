<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import {
  CopyDocument,
  Delete,
  Download,
  EditPen,
  Key,
  Plus,
  Upload,
} from '@element-plus/icons-vue'
import KeyInput from '../components/KeyInput.vue'
import PasswordInput from '../components/PasswordInput.vue'
import type {
  KeyType,
  ManagedKeySummary,
  PublicKeyInfo,
} from '../../shared/preload-api'

const activeTab = ref<'identity' | 'contact'>('identity')
const keys = ref<ManagedKeySummary[]>([])
const loading = ref(false)
const submitting = ref(false)

const generateVisible = ref(false)
const generateName = ref('')
const generatePassphrase = ref('')
const generateConfirm = ref('')

const publicImportVisible = ref(false)
const publicName = ref('')
const publicKeyPem = ref('')
const publicKeyInfo = ref<PublicKeyInfo | null>(null)

const privateImportVisible = ref(false)
const privateName = ref('')
const privateKeyPem = ref('')
const currentPassphrase = ref('')
const storagePassphrase = ref('')
const storageConfirm = ref('')

const renameVisible = ref(false)
const renameId = ref('')
const renameName = ref('')

const identities = computed(() => keys.value.filter((item) => item.kind === 'identity'))
const contacts = computed(() => keys.value.filter((item) => item.kind === 'contact'))
const importedPrivateEncrypted = computed(() => (
  /BEGIN ENCRYPTED PRIVATE KEY/.test(privateKeyPem.value)
))

function serviceApi() {
  if (!window.services) throw new Error('请在 uTools 或 Electron 客户端中运行')
  return window.services
}

function loadKeys() {
  if (!window.services) return
  loading.value = true
  try {
    keys.value = serviceApi().listManagedKeys()
  } catch (error) {
    ElMessage.error(error.message)
  } finally {
    loading.value = false
  }
}

function formatTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '--'
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

function resetGenerateForm() {
  generateName.value = ''
  generatePassphrase.value = ''
  generateConfirm.value = ''
}

function openGenerate() {
  resetGenerateForm()
  generateVisible.value = true
}

function openPublicImport() {
  resetPublicImportForm()
  publicImportVisible.value = true
}

function resetPublicImportForm() {
  publicName.value = ''
  publicKeyPem.value = ''
  publicKeyInfo.value = null
}

function openPrivateImport() {
  resetPrivateImportForm()
  privateImportVisible.value = true
}

function resetPrivateImportForm() {
  privateName.value = ''
  privateKeyPem.value = ''
  currentPassphrase.value = ''
  storagePassphrase.value = ''
  storageConfirm.value = ''
}

watch(publicKeyPem, (value) => {
  publicKeyInfo.value = null
  if (!value.trim() || !window.services) return
  try {
    publicKeyInfo.value = serviceApi().inspectPublicKey(value)
  } catch {
    // 输入完成前保持未校验状态。
  }
})

function generateKey() {
  if (!generateName.value.trim()) return ElMessage.warning('请输入密钥名称')
  if (generatePassphrase.value.length < 8) {
    return ElMessage.warning('私钥保护密码至少需要 8 个字符')
  }
  if (generatePassphrase.value !== generateConfirm.value) {
    return ElMessage.warning('两次输入的私钥保护密码不一致')
  }
  submitting.value = true
  try {
    serviceApi().generateManagedKey({
      name: generateName.value,
      passphrase: generatePassphrase.value,
    })
    generateVisible.value = false
    loadKeys()
    ElMessage.success('密钥对已生成')
  } catch (error) {
    ElMessage.error(error.message)
  } finally {
    submitting.value = false
  }
}

function importPublicKey() {
  if (!publicName.value.trim()) return ElMessage.warning('请输入联系人名称')
  if (!publicKeyInfo.value) {
    try {
      publicKeyInfo.value = serviceApi().inspectPublicKey(publicKeyPem.value)
    } catch (error) {
      return ElMessage.warning(error.message)
    }
  }
  submitting.value = true
  try {
    serviceApi().importManagedPublicKey({
      name: publicName.value,
      publicKeyPem: publicKeyPem.value,
    })
    publicImportVisible.value = false
    loadKeys()
    ElMessage.success('联系人公钥已导入')
  } catch (error) {
    ElMessage.error(error.message)
  } finally {
    submitting.value = false
  }
}

function importPrivateKey() {
  if (!privateName.value.trim()) return ElMessage.warning('请输入密钥名称')
  if (!privateKeyPem.value.trim()) return ElMessage.warning('请输入私钥')
  if (importedPrivateEncrypted.value && !currentPassphrase.value) {
    return ElMessage.warning('请输入原私钥保护密码')
  }
  if (storagePassphrase.value.length < 8) {
    return ElMessage.warning('新的私钥保护密码至少需要 8 个字符')
  }
  if (storagePassphrase.value !== storageConfirm.value) {
    return ElMessage.warning('两次输入的新私钥保护密码不一致')
  }
  submitting.value = true
  try {
    serviceApi().importManagedPrivateKey({
      name: privateName.value,
      privateKeyPem: privateKeyPem.value,
      currentPassphrase: currentPassphrase.value,
      storagePassphrase: storagePassphrase.value,
    })
    privateImportVisible.value = false
    loadKeys()
    ElMessage.success('本机私钥已导入')
  } catch (error) {
    ElMessage.error(error.message)
  } finally {
    submitting.value = false
  }
}

function openRename(row: Record<string, any>) {
  renameId.value = row.id
  renameName.value = row.name
  renameVisible.value = true
}

function renameKey() {
  try {
    serviceApi().renameManagedKey(renameId.value, renameName.value)
    renameVisible.value = false
    loadKeys()
    ElMessage.success('名称已更新')
  } catch (error) {
    ElMessage.error(error.message)
  }
}

async function copyPublicKey(id: string) {
  try {
    await navigator.clipboard.writeText(serviceApi().getManagedPublicKey(id))
    ElMessage.success('公钥已复制')
  } catch (error) {
    ElMessage.error(error.message || '复制失败')
  }
}

function exportKey(id: string, keyType: KeyType) {
  try {
    const outputPath = serviceApi().exportManagedKey({ id, keyType })
    if (outputPath) ElMessage.success(keyType === 'private' ? '加密私钥已导出' : '公钥已导出')
  } catch (error) {
    ElMessage.error(error.message)
  }
}

function deleteKey(id: string) {
  try {
    keys.value = serviceApi().deleteManagedKey(id)
    ElMessage.success('密钥已删除')
  } catch (error) {
    ElMessage.error(error.message)
  }
}

onMounted(loadKeys)
</script>

<template>
  <div class="p-5.5 max-[520px]:p-4.5">
    <el-tabs v-model="activeTab" class="key-management-tabs">
      <el-tab-pane :label="`我的密钥 (${identities.length})`" name="identity">
        <div class="mb-4 flex flex-wrap items-center justify-end gap-2">
          <el-button class="[&>span]:gap-1.5" @click="openPrivateImport">
            <Upload class="size-4" />
            导入私钥
          </el-button>
          <el-button type="primary" class="[&>span]:gap-1.5" @click="openGenerate">
            <Plus class="size-4" />
            生成密钥对
          </el-button>
        </div>

        <el-table v-loading="loading" :data="identities" table-layout="fixed" class="w-full">
          <el-table-column label="名称" min-width="150">
            <template #default="{ row }">
              <span class="inline-flex min-w-0 items-center gap-2">
                <Key class="size-4 shrink-0 text-[#176b4d]" />
                <strong class="truncate text-[13px] font-medium">{{ row.name }}</strong>
              </span>
            </template>
          </el-table-column>
          <el-table-column label="SHA-256 指纹" min-width="360">
            <template #default="{ row }">
              <code class="block truncate font-mono text-xs text-[#555c64]" :title="row.formattedFingerprint">
                {{ row.formattedFingerprint }}
              </code>
            </template>
          </el-table-column>
          <el-table-column label="创建时间" width="170">
            <template #default="{ row }">
              <span class="text-xs text-[#737a81]">{{ formatTime(row.createdAt) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="操作" fixed="right" width="260" align="center">
            <template #default="{ row }">
              <el-tooltip content="重命名" placement="top">
                <el-button text circle aria-label="重命名" @click="openRename(row)"><EditPen class="size-4" /></el-button>
              </el-tooltip>
              <el-tooltip content="复制公钥" placement="top">
                <el-button text circle aria-label="复制公钥" @click="copyPublicKey(row.id)"><CopyDocument class="size-4" /></el-button>
              </el-tooltip>
              <el-tooltip content="导出公钥" placement="top">
                <el-button text circle aria-label="导出公钥" @click="exportKey(row.id, 'public')"><Download class="size-4" /></el-button>
              </el-tooltip>
              <el-tooltip content="导出加密私钥" placement="top">
                <el-button text circle aria-label="导出加密私钥" @click="exportKey(row.id, 'private')"><Key class="size-4" /></el-button>
              </el-tooltip>
              <el-popconfirm title="删除后将无法使用该私钥解密文件，确定删除？" width="260" @confirm="deleteKey(row.id)">
                <template #reference>
                  <el-button text circle type="danger" aria-label="删除密钥"><Delete class="size-4" /></el-button>
                </template>
              </el-popconfirm>
            </template>
          </el-table-column>
          <template #empty><el-empty description="暂无本机密钥" /></template>
        </el-table>
      </el-tab-pane>

      <el-tab-pane :label="`联系人公钥 (${contacts.length})`" name="contact">
        <div class="mb-4 flex items-center justify-end">
          <el-button type="primary" class="[&>span]:gap-1.5" @click="openPublicImport">
            <Upload class="size-4" />
            导入联系人公钥
          </el-button>
        </div>

        <el-table v-loading="loading" :data="contacts" table-layout="fixed" class="w-full">
          <el-table-column label="名称" min-width="80" prop="name" />
          <el-table-column label="SHA-256 指纹"  min-width="360">
            <template #default="{ row }">
              <code class="block truncate font-mono text-xs text-[#555c64]" :title="row.formattedFingerprint">
                {{ row.formattedFingerprint }}
              </code>
            </template>
          </el-table-column>
          <el-table-column label="导入时间" width="170">
            <template #default="{ row }">
              <span class="text-xs text-[#737a81]">{{ formatTime(row.createdAt) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="操作" fixed="right" width="260" align="center">
            <template #default="{ row }">
              <el-tooltip content="重命名" placement="top">
                <el-button text circle aria-label="重命名" @click="openRename(row)"><EditPen class="size-4" /></el-button>
              </el-tooltip>
              <el-tooltip content="复制公钥" placement="top">
                <el-button text circle aria-label="复制公钥" @click="copyPublicKey(row.id)"><CopyDocument class="size-4" /></el-button>
              </el-tooltip>
              <el-tooltip content="导出公钥" placement="top">
                <el-button text circle aria-label="导出公钥" @click="exportKey(row.id, 'public')"><Download class="size-4" /></el-button>
              </el-tooltip>
              <el-popconfirm title="确定删除该联系人公钥？" @confirm="deleteKey(row.id)">
                <template #reference>
                  <el-button text circle type="danger" aria-label="删除公钥"><Delete class="size-4" /></el-button>
                </template>
              </el-popconfirm>
            </template>
          </el-table-column>
          <template #empty><el-empty description="暂无联系人公钥" /></template>
        </el-table>
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="generateVisible" title="生成 X25519 密钥对" width="min(460px, calc(100vw - 32px))" append-to-body align-center @closed="resetGenerateForm">
      <div class="flex min-w-0 flex-col gap-4">
        <el-input v-model="generateName" size="large" maxlength="50" placeholder="密钥名称" />
        <PasswordInput v-model="generatePassphrase" input-id="generate-key-passphrase" label="私钥保护密码" placeholder="至少 8 个字符" />
        <PasswordInput v-model="generateConfirm" input-id="generate-key-confirm" label="确认私钥保护密码" placeholder="再次输入" :show-strength="false" @enter="generateKey" />
      </div>
      <template #footer><el-button @click="generateVisible = false">取消</el-button><el-button type="primary" :loading="submitting" @click="generateKey">生成</el-button></template>
    </el-dialog>

    <el-dialog v-model="publicImportVisible" title="导入联系人公钥" width="min(560px, calc(100vw - 32px))" append-to-body align-center @closed="resetPublicImportForm">
      <div class="flex min-w-0 flex-col gap-4">
        <el-input v-model="publicName" size="large" maxlength="50" placeholder="联系人名称" />
        <KeyInput v-model="publicKeyPem" label="X25519 公钥" key-type="public" :key-info="publicKeyInfo" />
      </div>
      <template #footer><el-button @click="publicImportVisible = false">取消</el-button><el-button type="primary" :loading="submitting" @click="importPublicKey">导入</el-button></template>
    </el-dialog>

    <el-dialog v-model="privateImportVisible" title="导入本机私钥" width="min(560px, calc(100vw - 32px))" append-to-body align-center @closed="resetPrivateImportForm">
      <div class="flex min-w-0 flex-col gap-4">
        <el-input v-model="privateName" size="large" maxlength="50" placeholder="密钥名称" />
        <KeyInput v-model="privateKeyPem" label="X25519 私钥" key-type="private" />
        <PasswordInput v-if="importedPrivateEncrypted" v-model="currentPassphrase" input-id="current-private-passphrase" label="原私钥保护密码" :show-strength="false" />
        <PasswordInput v-model="storagePassphrase" input-id="storage-private-passphrase" label="新的私钥保护密码" placeholder="至少 8 个字符" />
        <PasswordInput v-model="storageConfirm" input-id="storage-private-confirm" label="确认新的保护密码" :show-strength="false" @enter="importPrivateKey" />
      </div>
      <template #footer><el-button @click="privateImportVisible = false">取消</el-button><el-button type="primary" :loading="submitting" @click="importPrivateKey">导入</el-button></template>
    </el-dialog>

    <el-dialog v-model="renameVisible" title="重命名密钥" width="min(400px, calc(100vw - 32px))" append-to-body align-center>
      <el-input v-model="renameName" size="large" maxlength="50" placeholder="密钥名称" @keyup.enter="renameKey" />
      <template #footer><el-button @click="renameVisible = false">取消</el-button><el-button type="primary" @click="renameKey">保存</el-button></template>
    </el-dialog>
  </div>
</template>
