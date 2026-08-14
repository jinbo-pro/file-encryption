import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { CompressionType, ScryptProfile } from '../../shared/preload-api'

export const useEncryptionSettingsStore = defineStore('encryptionSettings', () => {
  const fileCompressionType = ref<CompressionType>(0)
  const fileScryptProfile = ref<ScryptProfile>(0)
  const textCompressionType = ref<CompressionType>(2)
  const textScryptProfile = ref<ScryptProfile>(0)
  const fileExtension = ref('enc')
  const historyEnabled = ref(false)

  function resetSettings() {
    fileCompressionType.value = 0
    fileScryptProfile.value = 0
    textCompressionType.value = 2
    textScryptProfile.value = 0
    fileExtension.value = 'enc'
    historyEnabled.value = false
  }

  return {
    fileCompressionType,
    fileScryptProfile,
    textCompressionType,
    textScryptProfile,
    fileExtension,
    historyEnabled,
    resetSettings,
  }
})
