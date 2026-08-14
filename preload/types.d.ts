import type { PreloadServices } from '../shared/preload-api'

declare global {
  interface Window {
    services: PreloadServices
    runtime: 'utools' | 'electron'
    utools?: UToolsApi
  }
}

export {}
