import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  // iOS 的 Bundle ID 與 Android 的 applicationId；第一次上傳到商店後就不能改
  appId: 'com.tim890922.gudong',
  appName: '古董局中局',
  // npm run build:app 的輸出：API 指向線上的 Worker（見 .env.app）
  webDir: 'dist-app',
  backgroundColor: '#1C1B19',
  plugins: {
    SystemBars: {
      // 深色底、淺色字；index.html 用 viewport-fit=cover，先告訴 Android 避免版面跳動
      style: 'DARK',
      initialViewportFitValueHint: 'cover',
    },
  },
}

export default config
