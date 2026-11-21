/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** App 版要連線的 Worker 網址（見 .env.app）；網頁版留空 */
  readonly VITE_API_BASE?: string
}
