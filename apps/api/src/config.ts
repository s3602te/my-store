import { resolve } from 'node:path'
import { config as loadEnv } from 'dotenv'
import { z } from 'zod'

// 整個專案共用「專案根目錄」的 .env(後端、資料庫、docker compose 都讀同一份)
loadEnv({ path: resolve(import.meta.dirname, '../../../.env'), quiet: true })

/** 環境變數裡的 true/false 字串 */
const booleanString = z.enum(['true', 'false']).transform((value) => value === 'true')

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

  // ── 員工登入 ──
  /** 登入後多久過期(小時) */
  SESSION_TTL_HOURS: z.coerce.number().min(0.1).max(24 * 30).default(12),
  /** 連續輸錯密碼幾次就暫時鎖定帳號 */
  LOGIN_MAX_FAILURES: z.coerce.number().int().min(1).max(20).default(5),
  /** 鎖定幾分鐘 */
  LOGIN_LOCK_MINUTES: z.coerce.number().int().min(1).max(24 * 60).default(15),

  // ── 安全與防濫用 ──
  /**
   * 登入 Cookie 的 SameSite 設定。
   * lax(預設):前端與後端在同一個網站底下(例如 www.example.com 與 api.example.com)時使用,最安全。
   * none:前端與後端在完全不同的網站(例如前端在 github.io、後端在別的網域)時才需要,且必須使用 HTTPS。
   */
  COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  /** 是否啟用「同一個 IP 呼叫太頻繁就暫時擋下」 */
  RATE_LIMIT_ENABLED: booleanString.default(true),
  /** 後端前面有反向代理(例如 Nginx、雲端平台)時才設 true,否則會把代理的 IP 當成使用者 IP */
  TRUST_PROXY: booleanString.default(false),
  /** 是否提供 /docs(API 說明與測試頁面);正式環境預設關閉 */
  ENABLE_DOCS: booleanString.optional(),
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
const isProduction = env.NODE_ENV === 'production'

export const config = {
  nodeEnv: env.NODE_ENV,
  isProduction,
  host: env.API_HOST,
  port: env.API_PORT,
  corsOrigins: env.CORS_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  storeSlug: env.STORE_SLUG,
  databaseUrl: env.DATABASE_URL,

  sessionTtlMs: env.SESSION_TTL_HOURS * 60 * 60 * 1000,
  loginMaxFailures: env.LOGIN_MAX_FAILURES,
  loginLockMs: env.LOGIN_LOCK_MINUTES * 60 * 1000,

  cookieSameSite: env.COOKIE_SAMESITE,
  rateLimitEnabled: env.RATE_LIMIT_ENABLED,
  trustProxy: env.TRUST_PROXY,
  enableDocs: env.ENABLE_DOCS ?? !isProduction,
}
