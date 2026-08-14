<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { CopyDocument, Delete, Document, Hide, Key, View } from '@element-plus/icons-vue'
import type { EncryptionHistoryRecord } from '../../shared/preload-api'

const records = ref<EncryptionHistoryRecord[]>([])
const loading = ref(false)
const visiblePasswords = ref(new Set<string>())

function serviceApi() {
  if (!window.services) throw new Error('请在 uTools 或 Electron 客户端中运行')
  return window.services
}

function fileName(filePath: string) {
  return filePath.split(/[\\/]/).pop()
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
    second: '2-digit',
    hour12: false
  }).format(date)
}

function loadHistory() {
  loading.value = true
  try {
    records.value = serviceApi().getEncryptionHistory()
  } catch (error) {
    ElMessage.error(error.message)
  } finally {
    loading.value = false
  }
}

function togglePassword(id: string) {
  const next = new Set(visiblePasswords.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  visiblePasswords.value = next
}

async function copyValue(value: string, label = '密码') {
  try {
    await navigator.clipboard.writeText(value)
    ElMessage.success(`${label}已复制`)
  } catch {
    ElMessage.error('复制失败，请手动复制')
  }
}

function deleteRecord(id: string) {
  try {
    records.value = serviceApi().deleteEncryptionHistory(id)
    const next = new Set(visiblePasswords.value)
    next.delete(id)
    visiblePasswords.value = next
    ElMessage.success('记录已删除')
  } catch (error) {
    ElMessage.error(error.message)
  }
}

function clearHistory() {
  try {
    serviceApi().clearEncryptionHistory()
    records.value = []
    visiblePasswords.value = new Set()
    ElMessage.success('历史记录已清空')
  } catch (error) {
    ElMessage.error(error.message)
  }
}

onMounted(loadHistory)
</script>

<template>
  <div class="p-5.5 max-[520px]:p-4.5">
    <div class="flex min-w-0 items-center gap-3">
      <div class="min-w-0 flex-1">
        <h2 class="m-0 text-base font-semibold text-[#30353a]">加密历史</h2>
        <p class="mt-1 text-xs text-[#858b93]">共 {{ records.length }} 条记录</p>
      </div>
      <el-popconfirm
        title="确定清空全部加密历史？"
        confirm-button-text="清空"
        cancel-button-text="取消"
        width="220"
        @confirm="clearHistory"
      >
        <template #reference>
          <el-button text type="danger" :disabled="!records.length" class="[&>span]:gap-1.5">
            <Delete class="size-4" />
            全部清空
          </el-button>
        </template>
      </el-popconfirm>
    </div>
    
    <div class="mt-4">
      <el-alert
        type="warning"
        title="密码记录使用 uTools 加密存储；公钥记录仅保存接收方指纹。"
        :closable="false"
        show-icon
      />
    </div>

    <div v-loading="loading" class="mt-4 min-h-60">
      <el-empty v-if="!records.length && !loading" description="暂无加密记录" />

      <div v-else class="overflow-hidden rounded-[7px] border border-[#e0e3e6]">
        <el-table :data="records" table-layout="fixed" class="w-full">
          <el-table-column label="类型" width="110">
            <template #default="{ row }">
              <el-tag v-if="row.action === 'password-change'" type="warning" effect="plain" size="small">
                <span class="inline-flex items-center gap-1"><Key class="size-3.5" />密码修改</span>
              </el-tag>
              <el-tag v-else-if="row.encryptionType === 1" type="info" effect="plain" size="small"> 公钥加密 </el-tag>
              <el-tag v-else type="success" effect="plain" size="small">文件加密</el-tag>
            </template>
          </el-table-column>

          <el-table-column label="时间" width="180">
            <template #default="{ row }">
              <span class="text-xs text-[#5f666d]">{{ formatTime(row.createdAt) }}</span>
            </template>
          </el-table-column>

          <el-table-column label="文件路径" min-width="360">
            <template #default="{ row }">
              <div class="flex min-w-0 items-center gap-2.5">
                <Document class="size-4.5 shrink-0 text-[#176b4d]" />
                <span class="min-w-0 flex-1">
                  <strong class="block truncate text-[13px] font-medium" :title="row.filePath">
                    {{ fileName(row.filePath) }}
                  </strong>
                  <small class="mt-0.5 block truncate text-xs text-[#8a9097]" :title="row.filePath">
                    {{ row.filePath }}
                  </small>
                </span>
              </div>
            </template>
          </el-table-column>

          <el-table-column label="凭据" min-width="300">
            <template #default="{ row }">
              <div v-if="row.encryptionType === 1" class="flex min-w-0 items-center gap-1">
                <code
                  class="min-w-0 flex-1 truncate font-mono text-xs text-[#3f464d]"
                  :title="row.recipientFingerprint"
                >
                  {{ row.recipientFingerprint }}
                </code>
                <el-tooltip content="复制公钥指纹" placement="top">
                  <el-button
                    text
                    circle
                    aria-label="复制公钥指纹"
                    @click="copyValue(row.recipientFingerprint, '公钥指纹')"
                  >
                    <CopyDocument class="size-4" />
                  </el-button>
                </el-tooltip>
              </div>
              <div v-else class="flex min-w-0 items-center gap-1">
                <code
                  class="min-w-0 flex-1 truncate font-mono text-xs text-[#3f464d]"
                  :title="visiblePasswords.has(row.id) ? row.password : ''"
                >
                  {{ visiblePasswords.has(row.id) ? row.password : '********' }}
                </code>
                <el-tooltip :content="visiblePasswords.has(row.id) ? '隐藏密码' : '显示密码'" placement="top">
                  <el-button
                    text
                    circle
                    :aria-label="visiblePasswords.has(row.id) ? '隐藏密码' : '显示密码'"
                    @click="togglePassword(row.id)"
                  >
                    <Hide v-if="visiblePasswords.has(row.id)" class="size-4" />
                    <View v-else class="size-4" />
                  </el-button>
                </el-tooltip>
                <el-tooltip content="复制密码" placement="top">
                  <el-button text circle aria-label="复制密码" @click="copyValue(row.password)">
                    <CopyDocument class="size-4" />
                  </el-button>
                </el-tooltip>
              </div>
            </template>
          </el-table-column>

          <el-table-column label="操作" fixed="right" width="70" align="center">
            <template #default="{ row }">
              <el-popconfirm
                title="删除这条记录？"
                confirm-button-text="删除"
                cancel-button-text="取消"
                @confirm="deleteRecord(row.id)"
              >
                <template #reference>
                  <el-button text circle type="danger" aria-label="删除记录">
                    <Delete class="size-4" />
                  </el-button>
                </template>
              </el-popconfirm>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </div>
  </div>
</template>
