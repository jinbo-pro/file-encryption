<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  CircleCheck,
  Delete,
  Document,
  DocumentAdd,
  Refresh,
  Tickets,
  Warning,
} from '@element-plus/icons-vue'
import HashValueCell from '../components/HashValueCell.vue'
import type { FileInfo, HashResult } from '../../shared/preload-api'

type HashStatus = 'pending' | 'calculating' | 'done' | 'error'
interface DisplayHashFile extends FileInfo {
  status: HashStatus
  md5?: string
  sha1?: string
  sha256?: string
  error?: string
}

const files = ref<DisplayHashFile[]>([])
const calculating = ref(false)

const completedCount = computed(() => files.value.filter((file) => file.sha256).length)
const allCompleted = computed(() => (
  files.value.length > 0 && completedCount.value === files.value.length
))
const duplicateHashes = computed(() => {
  const counts = new Map<string, number>()
  for (const file of files.value) {
    if (file.sha256) counts.set(file.sha256, (counts.get(file.sha256) || 0) + 1)
  }
  return new Set([...counts].filter(([, count]) => count > 1).map(([hash]) => hash))
})

function serviceApi() {
  if (!window.services) throw new Error('请在 uTools 或 Electron 客户端中运行')
  return window.services
}

function normalizePath(filePath: string) {
  return filePath.replace(/\\/g, '/')
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

async function selectFiles() {
  try {
    const selected = serviceApi().selectHashFiles()
    if (!selected.length) return
    const existing = new Set(files.value.map((file) => normalizePath(file.path)))
    const additions = selected
      .filter((file) => !existing.has(normalizePath(file.path)))
      .map((file): DisplayHashFile => ({ ...file, status: 'pending' }))
    files.value.push(...additions)
    if (additions.length === 0) ElMessage.info('所选文件已在列表中')
    if (files.value.length === 1 && additions.length === 1) await calculate()
  } catch (error) {
    ElMessage.error(error.message)
  }
}

async function calculate() {
  if (!files.value.length) return ElMessage.warning('请选择要校验的文件')
  calculating.value = true
  files.value = files.value.map((file) => ({ ...file, status: 'calculating', error: '' }))
  try {
    const results = await serviceApi().calculateFileHashes(files.value.map((file) => file.path))
    files.value = results.map(toDisplayHashFile)
    const failures = results.filter((file) => file.error).length
    if (failures) ElMessage.warning(`${failures} 个文件计算失败`)
    else ElMessage.success('哈希计算完成')
  } catch (error) {
    ElMessage.error(error.message)
  } finally {
    calculating.value = false
  }
}

function toDisplayHashFile(file: HashResult): DisplayHashFile {
  if ('error' in file) {
    return { path: file.path, name: file.name, size: 0, error: file.error, status: 'error' }
  }
  return { ...file, status: 'done' }
}

function removeFile(filePath: string) {
  files.value = files.value.filter((file) => file.path !== filePath)
}

function clearFiles() {
  files.value = []
}

async function copyHash(value: string) {
  try {
    await navigator.clipboard.writeText(value)
    ElMessage.success('已复制')
  } catch {
    ElMessage.error('复制失败，请手动复制')
  }
}
</script>

<template>
  <div class="p-5.5 max-[520px]:p-4.5">
    <div class="flex min-w-0 flex-wrap items-center gap-3">
      <el-button type="primary" class="[&>span]:gap-2" :disabled="calculating" @click="selectFiles">
        <DocumentAdd class="size-4" />
        {{ files.length ? '添加文件' : '选择文件' }}
      </el-button>
      <el-button
        class="[&>span]:gap-2"
        :disabled="!files.length"
        :loading="calculating"
        @click="calculate"
      >
        <Refresh v-if="!calculating" class="size-4" />
        {{ allCompleted ? '重新计算' : '计算哈希' }}
      </el-button>
      <el-button text class="[&>span]:gap-2" :disabled="!files.length || calculating" @click="clearFiles">
        <Delete class="size-4" />
        清空
      </el-button>
      <span v-if="files.length" class="ml-auto text-xs text-[#7a8087]">
        {{ completedCount }} / {{ files.length }} 已完成
      </span>
    </div>

    <button
      v-if="!files.length"
      type="button"
      class="mt-5 flex min-h-65 w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-[7px] border border-dashed border-[#bdc5cd] bg-[#fafbfc] text-[#32373d] transition-colors hover:border-[#176b4d] hover:bg-[#f5faf7]"
      @click="selectFiles"
    >
      <span class="grid size-12 place-items-center rounded-lg bg-[#e1eee9] text-[#176b4d]">
        <Tickets class="size-6" />
      </span>
      <strong class="text-sm font-semibold">选择多个文件</strong>
    </button>

    <section
      v-else-if="files.length === 1"
      v-loading="calculating"
      class="mt-5 overflow-hidden rounded-[7px] border border-[#dfe3e7] bg-[#fafbfc]"
    >
      <header class="flex min-w-0 items-center gap-3 border-b border-[#e2e5e8] bg-white px-5 py-4">
        <span class="grid size-10 shrink-0 place-items-center rounded-lg bg-[#e1eee9] text-[#176b4d]">
          <Document class="size-5" />
        </span>
        <span class="min-w-0 flex-1">
          <strong class="block truncate text-sm font-semibold" :title="files[0].name">{{ files[0].name }}</strong>
          <small class="mt-1 block truncate text-xs text-[#858b93]" :title="files[0].path">{{ files[0].path }}</small>
        </span>
        <span class="shrink-0 text-xs text-[#70767d]">{{ formatSize(files[0].size) }}</span>
        <CircleCheck v-if="files[0].status === 'done'" class="size-5 shrink-0 text-[#176b4d]" />
      </header>

      <el-alert
        v-if="files[0].status === 'error'"
        class="rounded-none!"
        type="error"
        :title="files[0].error || '计算失败'"
        :closable="false"
        show-icon
      />

      <dl class="grid min-w-0 grid-cols-[76px_minmax(0,1fr)] gap-x-4 gap-y-1 px-5 py-4 max-[520px]:grid-cols-1 max-[520px]:gap-y-2">
        <dt class="py-2 text-xs font-semibold text-[#60676e]">MD5</dt>
        <dd class="m-0 min-w-0 border-b border-[#e4e7e9] py-1">
          <HashValueCell :value="files[0].md5" wrap @copy="copyHash" />
        </dd>
        <dt class="py-2 text-xs font-semibold text-[#60676e]">SHA-1</dt>
        <dd class="m-0 min-w-0 border-b border-[#e4e7e9] py-1">
          <HashValueCell :value="files[0].sha1" wrap @copy="copyHash" />
        </dd>
        <dt class="py-2 text-xs font-semibold text-[#60676e]">SHA-256</dt>
        <dd class="m-0 min-w-0 py-1">
          <HashValueCell :value="files[0].sha256" wrap @copy="copyHash" />
        </dd>
      </dl>
    </section>

    <div v-else class="mt-5 overflow-hidden rounded-[7px] border border-[#e0e3e6]">
      <el-table
        v-loading="calculating"
        :data="files"
        table-layout="fixed"
        class="w-full"
      >
        <el-table-column type="index" label="#" width="52" align="center" />
        <el-table-column label="文件" fixed min-width="240">
          <template #default="{ row }">
            <div class="flex min-w-0 items-center gap-2">
              <span class="min-w-0 flex-1">
                <strong class="block truncate text-[13px] font-medium" :title="row.path">{{ row.name }}</strong>
                <small class="mt-0.5 block truncate text-xs text-[#8a9097]" :title="row.path">{{ row.path }}</small>
              </span>
              <el-tag v-if="duplicateHashes.has(row.sha256)" size="small" type="warning">相同</el-tag>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="大小" width="100">
          <template #default="{ row }">{{ formatSize(row.size) }}</template>
        </el-table-column>
        <el-table-column label="MD5" min-width="300">
          <template #default="{ row }"><HashValueCell :value="row.md5" @copy="copyHash" /></template>
        </el-table-column>
        <el-table-column label="SHA-1" min-width="340">
          <template #default="{ row }"><HashValueCell :value="row.sha1" @copy="copyHash" /></template>
        </el-table-column>
        <el-table-column label="SHA-256" min-width="460">
          <template #default="{ row }"><HashValueCell :value="row.sha256" @copy="copyHash" /></template>
        </el-table-column>
        <el-table-column label="状态" fixed="right" width="82" align="center">
          <template #default="{ row }">
            <el-tooltip v-if="row.status === 'error'" :content="row.error" placement="left">
              <Warning class="mx-auto size-4.5 text-[#d97706]" />
            </el-tooltip>
            <CircleCheck v-else-if="row.status === 'done'" class="mx-auto size-4.5 text-[#176b4d]" />
            <span v-else class="text-xs text-[#92979d]">待计算</span>
          </template>
        </el-table-column>
        <el-table-column fixed="right" width="52" align="center">
          <template #default="{ row }">
            <el-tooltip content="移除" placement="left">
              <el-button text circle aria-label="移除文件" :disabled="calculating" @click="removeFile(row.path)">
                <Delete class="size-4" />
              </el-button>
            </el-tooltip>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>
