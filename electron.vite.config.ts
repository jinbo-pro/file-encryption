import { hostname } from 'node:os'
import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'dist/electron/main',
      rollupOptions: {
        input: { index: resolve(__dirname, 'platforms/electron/main.ts') },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'dist/electron/preload',
      rollupOptions: {
        input: { index: resolve(__dirname, 'platforms/electron/preload.ts') },
        output: {
          format: 'cjs',
          entryFileNames: '[name].cjs',
        },
      },
    },
  },
  renderer: {
    root: '.',
    publicDir: false,
    base: './',
    server: {
      port: 5173,
      strictPort: true,
    },
    plugins: [
      tailwindcss(),
      vue(),
      AutoImport({
        resolvers: [ElementPlusResolver()],
        dts: 'src/auto-imports.d.ts',
      }),
      Components({
        resolvers: [ElementPlusResolver()],
        dts: 'src/components.d.ts',
      }),
    ],
    define: {
      __APP_BUILD_TIME__: JSON.stringify(`build: ${hostname()} ${new Date().toLocaleString()}`),
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, './src'),
      },
    },
    build: {
      outDir: 'dist/electron/renderer',
      cssTarget: 'chrome108',
      rollupOptions: {
        input: resolve(__dirname, 'index.html'),
      },
    },
  },
})
