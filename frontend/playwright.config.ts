import { defineConfig, devices } from '@playwright/test'

// 先啟動後端（會 serve 前端 build）：cd backend && uv run uvicorn app.main:app --port 8000
export default defineConfig({
  testDir: './e2e',
  timeout: 180_000,
  fullyParallel: false,
  reporter: 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:8000',
    ...devices['Pixel 7'],
    locale: 'zh-TW',
  },
})
