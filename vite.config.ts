import { hostname } from 'node:os'
import { defineConfig } from 'vite'
import { resolve } from 'node:path'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    tailwindcss(),
    vue(),
    // Element Plus 按需自动引入：API（ElMessage 等）+ 组件样式
    AutoImport({
      resolvers: [ElementPlusResolver()],
      dts: 'src/auto-imports.d.ts'
    }),
    // 模板中使用的 el-xxx 组件自动引入
    Components({
      resolvers: [ElementPlusResolver()],
      dts: 'src/components.d.ts'
    })
  ],
  define: {
    __APP_BUILD_TIME__: JSON.stringify(`build: ${hostname()} ${new Date().toLocaleString()}`)
  },
  base: './',
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    cssTarget: 'chrome108'
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src')
    }
  }
})
