<script setup lang="ts">
import { Document, FolderOpened } from '@element-plus/icons-vue'
import type { FileInfo, SourceFileMode } from '../../shared/preload-api'

withDefaults(defineProps<{
  file?: FileInfo | null
  mode?: SourceFileMode
  disabled?: boolean
}>(), {
  file: null,
  mode: 'encrypt',
  disabled: false,
})

defineEmits<{
  select: []
  clear: []
}>()

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
</script>

<template>
  <div class="mt-5 flex min-w-0 flex-col gap-2">
    <span class="text-[13px] font-semibold text-[#41464d]">输入文件</span>

    <button
      v-if="!file"
      type="button"
      class="flex min-h-23 w-full cursor-pointer items-center justify-center gap-3.25 rounded-[7px] border border-dashed border-[#bdc5cd] bg-[#fafbfc] p-4 text-[#32373d] transition-colors hover:border-[#176b4d] hover:bg-[#f5faf7] disabled:cursor-not-allowed disabled:opacity-60"
      :disabled="disabled"
      @click="$emit('select')"
    >
      <FolderOpened class="size-6 shrink-0 text-[#176b4d]" />
      <span class="flex min-w-0 flex-col text-left">
        <strong class="truncate text-sm font-semibold">
          {{ mode === 'encrypt'
            ? '选择要加密的文件'
            : mode === 'password-change' ? '选择要修改密码的加密包' : '选择要解密的文件' }}
        </strong>
        <small class="mt-0.75 text-xs text-[#858b93]">
          {{ mode === 'password-change' ? '仅支持 FENC 加密包' : '支持任意类型文件' }}
        </small>
      </span>
    </button>

    <div
      v-else
      class="flex min-h-18 min-w-0 items-center gap-2.75 rounded-[7px] border border-[#dfe3e7] bg-[#fafbfc] px-3.5 py-3"
    >
      <Document class="size-5.5 shrink-0 text-[#176b4d]" />
      <span class="flex min-w-0 flex-1 flex-col text-left">
        <strong class="truncate text-sm font-semibold">{{ file.name }}</strong>
        <small class="mt-0.75 text-xs text-[#858b93]">{{ formatSize(file.size) }}</small>
      </span>
      <el-button text type="primary" :disabled="disabled" @click="$emit('select')">
        更换
      </el-button>
      <el-button text :disabled="disabled" @click="$emit('clear')">
        清除
      </el-button>
    </div>
  </div>
</template>
