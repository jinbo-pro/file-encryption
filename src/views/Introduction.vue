<script setup lang="ts">
import { Clock, DataAnalysis, Document, EditPen, Connection, Key, Link, Lock, Setting } from '@element-plus/icons-vue'

const features = [
  {
    title: '非对称密钥',
    description: '生成或导入 X25519 身份密钥，维护联系人公钥并核对 SHA-256 指纹。',
    icon: Connection
  },
  {
    title: '文件加解密',
    description: '支持单文件和串行批量处理，可用密码或 X25519 公钥保护，并可真正取消批量任务。',
    icon: Document
  },
  {
    title: '密码修改',
    description: '只更新密码元数据并重新包装数据密钥，无需重新加密文件内容。',
    icon: Key
  },
  {
    title: '文本加解密',
    description: '将 UTF-8 文本加密为 Base64 密文，或将密文还原并复制、下载。',
    icon: EditPen
  },
  {
    title: '文件校验',
    description: '批量计算 MD5、SHA-1 和 SHA-256，便于核对文件完整性与重复文件。',
    icon: DataAnalysis
  },
  {
    title: '加密历史',
    description: '按需记录加密文件、输出位置、密码和时间，支持查看、复制与清理。',
    icon: Clock
  }
]

const buildTime = __APP_BUILD_TIME__
</script>

<template>
  <div class="p-5.5 max-[520px]:p-4.5">
    <div class="flex items-start gap-3.5 border-b border-[#eceef0] pb-5">
      <span class="grid size-10 shrink-0 place-items-center rounded-lg bg-[#e5f1ec] text-[#176b4d]">
        <Lock class="size-5" />
      </span>
      <div class="min-w-0">
        <h2 class="m-0 text-base font-semibold text-[#30353a]">文件安全工具介绍</h2>
        <p class="mt-1.5 text-[13px] leading-6 text-[#666d74]">
          用于本地文件与文本加解密、文件哈希校验的 uTools 插件。所有数据均在本机处理，不会上传到网络。
        </p>
      </div>
    </div>

    <section class="pt-5">
      <h3 class="m-0 text-sm font-semibold text-[#30353a]">主要功能</h3>
      <div class="mt-3 grid border-y border-[#e7e9ec] min-[760px]:grid-cols-2">
        <div
          v-for="(feature, index) in features"
          :key="feature.title"
          class="flex min-w-0 gap-3 px-3 py-4 max-[759px]:border-b max-[759px]:border-[#eceef0] max-[759px]:last:border-b-0 min-[760px]:odd:border-r min-[760px]:odd:border-[#eceef0] min-[760px]:nth-[n+3]:border-t min-[760px]:nth-[n+3]:border-[#eceef0]"
        >
          <component :is="feature.icon" class="mt-0.5 size-4.5 shrink-0 text-[#176b4d]" />
          <div class="min-w-0">
            <h4 class="m-0 text-[13px] font-semibold text-[#41464d]">{{ feature.title }}</h4>
            <p class="mt-1 text-xs leading-5 text-[#737980]">{{ feature.description }}</p>
          </div>
        </div>
      </div>
    </section>

    <section class="pt-5">
      <h3 class="m-0 text-sm font-semibold text-[#30353a]">基本使用</h3>
      <ol class="mt-3 space-y-3">
        <li class="flex gap-3 text-[13px] leading-5.5 text-[#555c64]">
          <span
            class="grid size-5.5 shrink-0 place-items-center rounded-full bg-[#176b4d] text-xs font-semibold text-white"
            >1</span
          >
          <span>从左侧菜单进入所需功能；“文件加密”下可选择单个处理或批量处理。</span>
        </li>
        <li class="flex gap-3 text-[13px] leading-5.5 text-[#555c64]">
          <span
            class="grid size-5.5 shrink-0 place-items-center rounded-full bg-[#176b4d] text-xs font-semibold text-white"
            >2</span
          >
          <span>文件加密可填写密码或选择接收方公钥；文本加密使用密码。插件不会删除或覆盖原文件。</span>
        </li>
        <li class="flex gap-3 text-[13px] leading-5.5 text-[#555c64]">
          <span
            class="grid size-5.5 shrink-0 place-items-center rounded-full bg-[#176b4d] text-xs font-semibold text-white"
            >3</span
          >
          <span>批量任务按顺序处理，单项失败会继续；取消时会中止当前文件、清理半成品并跳过剩余文件。</span>
        </li>
        <li class="flex gap-3 text-[13px] leading-5.5 text-[#555c64]">
          <span
            class="grid size-5.5 shrink-0 place-items-center rounded-full bg-[#176b4d] text-xs font-semibold text-white"
            >4</span
          >
          <span class="inline-flex flex-wrap items-center gap-x-1">
            点击侧边栏底部的
            <Setting class="size-4 text-[#176b4d]" />
            可打开左侧设置抽屉，分别管理文件和文本参数，以及文件后缀和历史记录开关。
          </span>
        </li>
        <li class="flex gap-3 text-[13px] leading-5.5 text-[#555c64]">
          <span
            class="grid size-5.5 shrink-0 place-items-center rounded-full bg-[#176b4d] text-xs font-semibold text-white"
            >5</span
          >
          <span>解密会自动读取密文中的方式和参数；公钥包需使用与接收方指纹匹配的本机私钥。</span>
        </li>
      </ol>
    </section>

    <div class="mt-5">
      <el-alert
        type="warning"
        title="重要数据请保留原文件和独立备份；随机密码遗失后无法从密文恢复。"
        :closable="false"
        show-icon
      />
    </div>

    <section class="pt-5">
      <h3 class="m-0 text-sm font-semibold text-[#30353a]">开源共建</h3>
      <p class="mt-2 text-[13px] leading-6 text-[#666d74]">
        项目已开源，欢迎开发者参与完善功能、修复问题或改进体验。你可以提交
        Issue、分享建议，也可以直接贡献代码，一起把它做得更安全、更好用。
      </p>
      <div class="mt-3 gap-x-5 gap-y-2 border-y border-[#e7e9ec] px-3 py-3">
        <div>
          <el-link href="https://github.com/jinbo-pro/file-encryption" target="_blank" rel="noopener noreferrer">
            <Link class="size-4" />
            GitHub：https://github.com/jinbo-pro/file-encryption
          </el-link>
        </div>
        <div>
          <el-link href="https://gitee.com/lijinbode/file-encryption" target="_blank" rel="noopener noreferrer">
            <Link class="size-4" />
            Gitee：https://gitee.com/lijinbode/file-encryption
          </el-link>
        </div>
      </div>
    </section>

    <footer class="mt-5 border-t border-[#eceef0] pt-4 text-center font-mono text-xs text-[#92979e]">
      {{ buildTime }}
    </footer>
  </div>
</template>
