<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { Clock, Document, EditPen, Notebook, Key, MagicStick, Setting } from '@element-plus/icons-vue'
import EncryptionSettingsDialog from './components/EncryptionSettingsDialog.vue'

const router = useRouter()

const navigation = [
  {
    label: '文件加密',
    name: 'file-group',
    icon: Document,
    children: [
      { label: '单个处理', name: 'file-single' },
      { label: '批量处理', name: 'file-batch' },
      { label: '密码修改', name: 'password-change' }
    ]
  },
  { label: '文本加密', name: 'text', icon: EditPen },
  { label: '密钥管理', name: 'keys', icon: Key },
  { label: '加密历史', name: 'history', icon: Clock },
  { label: '随机密码', name: 'password-generator', icon: MagicStick },
  { label: '使用说明', name: 'introduction', icon: Notebook }
]

const settingsVisible = ref(false)

function handleMenuSelect(index: string) {
  void router.push({ name: index })
}
</script>

<template>
  <el-container class="h-screen w-full min-w-0 bg-[#f5f6f8] text-[#202124]">
    <el-aside width="150px" class="flex h-full flex-col overflow-hidden border-r border-[#e1e4e8] bg-white">
      <el-menu
        :default-active="String($route.name)"
        class="navigation-menu min-h-0 flex-1 border-r-0! py-3"
        @select="handleMenuSelect"
      >
        <template v-for="item in navigation" :key="item.name">
          <el-sub-menu v-if="item.children" :index="item.name">
            <template #title>
              <el-icon><component :is="item.icon" /></el-icon>
              <span>{{ item.label }}</span>
            </template>
            <el-menu-item v-for="child in item.children" :key="child.name" :index="child.name">
              <span>{{ child.label }}</span>
            </el-menu-item>
          </el-sub-menu>
          <el-menu-item v-else :index="item.name">
            <el-icon><component :is="item.icon" /></el-icon>
            <span>{{ item.label }}</span>
          </el-menu-item>
        </template>
      </el-menu>

      <div class="shrink-0 border-t border-[#e1e4e8] px-4 py-3 flex items-center justify-center">
        <el-tooltip content="加密设置" placement="top">
          <el-button circle text aria-label="加密设置" @click="settingsVisible = true">
            <el-icon><Setting /></el-icon>
          </el-button>
        </el-tooltip>
      </div>
    </el-aside>

    <el-main class="min-w-0 [--el-main-padding:0]">
      <div class="flex h-full min-w-0 flex-col">
        <section
          class="w-full min-h-0 flex-1 overflow-auto rounded-lg border border-[#e1e4e8] bg-white shadow-[0_8px_24px_rgba(27,31,35,0.05)]"
        >
          <RouterView />
        </section>
      </div>
    </el-main>

    <EncryptionSettingsDialog v-model="settingsVisible" />
  </el-container>
</template>

<style scoped>
:deep(.navigation-menu .el-menu-item) {
  height: 44px;
  margin: 2px 8px;
  border-radius: 6px;
  padding: 0 12px !important;
}

:deep(.navigation-menu .el-sub-menu__title) {
  height: 44px;
  margin: 2px 8px;
  border-radius: 6px;
  padding: 0 12px !important;
}

:deep(.navigation-menu .el-sub-menu .el-menu-item) {
  min-width: 0;
  padding-left: 39px !important;
}

:deep(.navigation-menu .el-menu-item.is-active) {
  background-color: var(--el-color-primary-light-9);
  box-shadow: inset 3px 0 0 var(--el-color-primary);
  color: var(--el-color-primary);
  font-weight: 600;
}
</style>
