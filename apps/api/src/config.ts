import { resolve } from 'node:path'
import { config as loadEnv } from 'dotenv'
import { z } from 'zod'

// 整個專案共用「專案根目錄」的 .env(後端、資料庫、docker compose 都讀同一份)
loadEnv({ path: resolve(import.meta.dirname, '../../../.env'), quiet: true })

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_HOST: z.string().default('127.0.0.1'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  // 允許呼叫後端的前端網址,用逗號分隔
  CORS_ORIGINS: z.string().default('http://localhost:5173,http://127.0.0.1:5173'),
  // 這個後端負責的店家(目前只有一家)。對應資料庫 Store.slug
  STORE_SLUG: z.string().min(1).default('my-store'),
  DATABASE_URL: z
    .string({ error: '缺少 DATABASE_URL' })
    .min(1, 'DATABASE_URL 不可為空')
    .startsWith('postgres', 'DATABASE_URL 必須是 postgresql:// 開頭的連線字串'),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error('❌ 環境變數設定有問題,後端無法啟動:')
  for (const issue of parsed.error.issues) {
    console.error(`   - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
  }
  console.error('\n請確認專案根目錄有 .env 檔案(可由 .env.example 複製)。')
  process.exit(1)
}

const env = parsed.data

export const config = {
  nodeEnv: env.NODE_ENV,
  isProduction: env.NODE_ENV === 'production',
  host: env.API_HOST,
  port: env.API_PORT,
  corsOrigins: env.CORS_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  storeSlug: env.STORE_SLUG,
  databaseUrl: env.DATABASE_URL,
}
