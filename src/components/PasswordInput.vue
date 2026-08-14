<script setup lang="ts">
import { computed } from 'vue'
import { Key, Refresh } from '@element-plus/icons-vue'

defineProps({
  inputId: {
    type: String,
    required: true
  },
  label: {
    type: String,
    default: '密码',
  },
  placeholder: {
    type: String,
    default: '输入密码',
  },
  disabled: Boolean,
  allowQuickFill: Boolean,
  showStrength: {
    type: Boolean,
    default: true,
  },
})

const emit = defineEmits(['enter'])
const model = defineModel({ type: String, default: '' })

const passwordStrength = computed(() => {
  const password = model.value
  const characterTypes = [
    /[a-z]/.test(password),
    /[A-Z]/.test(password),
    /\d/.test(password),
    /[^a-zA-Z\d]/.test(password),
  ].filter(Boolean).length

  let level = 1
  if (password.length >= 8 && characterTypes >= 2) level = 2
  if (password.length >= 12 && characterTypes >= 3) level = 3
  if (password.length >= 16 && characterTypes === 4) level = 4

  return [
    { label: '弱', color: '#dc2626' },
    { label: '一般', color: '#d97706' },
    { label: '强', color: '#16845b' },
    { label: '很强', color: '#176b4d' },
  ][level - 1]
})

function fillRandomPassword() {
  try {
    if (!window.services) throw new Error('请在 uTools 或 Electron 客户端中运行')
    model.value = window.services.generateRandomPassword()
    ElMessage.success('已填充随机密码')
  } catch (error) {
    ElMessage.error(error.message)
  }
}
</script>

<template>
  <div class="flex min-w-0 flex-col gap-2">
    <label class="text-[13px] font-semibold text-[#41464d]" :for="inputId">{{ label }}</label>
    <el-input
      :id="inputId"
      v-model="model"
      class="password-input"
      type="password"
      size="large"
      show-password
      autocomplete="off"
      :placeholder="placeholder"
      :disabled="disabled"
      @keyup.enter="emit('enter')"
    >
      <template #prefix><Key class="size-4" /></template>
      <template #suffix>
        <span class="flex items-center gap-0.5">
          <el-tooltip v-if="allowQuickFill" content="填充随机密码" placement="top">
            <el-button text circle aria-label="填充随机密码" :disabled="disabled" @click="fillRandomPassword">
              <Refresh class="size-4" />
            </el-button>
          </el-tooltip>
        </span>
      </template>
    </el-input>
    <div
      v-if="model && showStrength"
      class="flex items-center gap-2"
      role="status"
      aria-live="polite"
      :aria-label="`密码强度：${passwordStrength.label}`"
    >
      <span class="text-xs text-[#737a81]">密码强度</span>
      <span class="flex min-w-16 flex-1 gap-1" aria-hidden="true">
        <span
          v-for="index in 4"
          :key="index"
          class="h-1 flex-1 rounded-full bg-[#dfe3e6] transition-colors duration-200"
          :style="index <= ['弱', '一般', '强', '很强'].indexOf(passwordStrength.label) + 1
            ? { backgroundColor: passwordStrength.color }
            : undefined"
        />
      </span>
      <strong class="w-7 text-right text-xs font-semibold" :style="{ color: passwordStrength.color }">
        {{ passwordStrength.label }}
      </strong>
    </div>
  </div>
</template>
