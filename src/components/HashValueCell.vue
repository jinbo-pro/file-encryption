<script setup lang="ts">
import { CopyDocument } from '@element-plus/icons-vue'

withDefaults(defineProps<{ value?: string; wrap?: boolean }>(), {
  value: '',
  wrap: false,
})

defineEmits<{ copy: [value: string] }>()
</script>

<template>
  <div v-if="value" class="flex min-w-0 items-center gap-2">
    <code
      class="min-w-0 flex-1 select-all font-mono text-xs leading-5 text-[#3f464d]"
      :class="wrap ? 'break-all' : 'truncate'"
      :title="value"
    >
      {{ value }}
    </code>
    <el-tooltip content="复制" placement="top">
      <el-button text circle aria-label="复制哈希值" class="shrink-0" @click="$emit('copy', value)">
        <CopyDocument class="size-4" />
      </el-button>
    </el-tooltip>
  </div>
  <span v-else class="text-xs text-[#a1a6ac]">--</span>
</template>
