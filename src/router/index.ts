import { createRouter, createWebHashHistory } from 'vue-router'
import FileEncryption from '../views/FileEncryption.vue'
import FileBatchEncryption from '../views/FileBatchEncryption.vue'
import TextEncryption from '../views/TextEncryption.vue'
import FileHash from '../views/FileHash.vue'
import EncryptionHistory from '../views/EncryptionHistory.vue'
import FilePasswordChange from '../views/FilePasswordChange.vue'
import KeyManagement from '../views/KeyManagement.vue'
import Introduction from '../views/Introduction.vue'
import PasswordGenerator from '../views/PasswordGenerator.vue'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/file' },
    { path: '/file', name: 'file-single', component: FileEncryption },
    { path: '/file/batch', name: 'file-batch', component: FileBatchEncryption },
    { path: '/text', name: 'text', component: TextEncryption },
    { path: '/hash', name: 'hash', component: FileHash },
    { path: '/history', name: 'history', component: EncryptionHistory },
    { path: '/password-change', name: 'password-change', component: FilePasswordChange },
    { path: '/keys', name: 'keys', component: KeyManagement },
    { path: '/password-generator', name: 'password-generator', component: PasswordGenerator },
    { path: '/introduction', name: 'introduction', component: Introduction },
  ],
})

export default router
