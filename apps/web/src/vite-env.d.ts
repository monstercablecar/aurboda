/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  readonly VITE_FOGHOUSE_PRIVACY_ENABLED?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

interface Window {
  __RUNTIME_CONFIG__?: {
    API_URL?: string
  }
}
