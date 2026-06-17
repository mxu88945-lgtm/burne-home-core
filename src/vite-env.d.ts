/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_TITLE?: string
  readonly VITE_NOTION_PROXY_URL?: string
  readonly VITE_NOTION_DATABASE_ID?: string
  readonly VITE_SYNC_WORKER_URL?: string
  readonly VITE_SYNC_SPACE_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
