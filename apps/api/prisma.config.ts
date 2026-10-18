import { resolve } from 'node:path'
import { config as loadEnv } from 'dotenv'
import { defineConfig, env } from 'prisma/config'

// Prisma 指令(migrate、studio、seed)也讀「專案根目錄」的 .env,和後端、docker compose 共用同一份
loadEnv({ path: resolve(import.meta.dirname, '../../.env'), quiet: true })

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    // `npx prisma db seed` 會執行這個指令
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
})
