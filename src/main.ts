import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './styles/tailwind.css'
import './styles/chrome108.css'

const featureRoutes: Record<string, string> = {
  'file-encryption': '/file',
  'text-encryption': '/text',
  'file-hash': '/hash',
  'encryption-history': '/history',
  'password-change': '/password-change',
  'key-management': '/keys',
}

window.utools?.onPluginEnter(({ code }) => {
  const path = featureRoutes[code]
  if (path && router.currentRoute.value.path !== path) void router.replace(path)
})

createApp(App)
  .use(createPinia())
  .use(router)
  .mount('#app')
