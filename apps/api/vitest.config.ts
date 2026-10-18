import { defineConfig } from 'vitest/config'
import { getTestDatabaseUrl } from './test/testDb.ts'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    globalSetup: ['./test/globalSetup.ts'],
    // 所有測試檔共用同一個測試資料庫,所以一個一個依序執行,避免互相干擾
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: getTestDatabaseUrl(),
      RATE_LIMIT_ENABLED: 'false',
      STORE_SLUG: 'my-store',
    },
  },
})
