import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parse } from 'dotenv'

/**
 * 測試專用資料庫的連線字串。
 *
 * 規則:資料庫名稱一定以 _test 結尾(例如 mystore → mystore_test)。
 * 測試會「清空這個資料庫」,所以絕對不可以指到開發用的資料庫。
 * 來源優先順序:TEST_DATABASE_URL → DATABASE_URL(環境變數)→ 專案根目錄 .env → 預設值
 */
export function getTestDatabaseUrl(): string {
  const rootEnv = resolve(import.meta.dirname, '../../../.env')
  const fromFile = existsSync(rootEnv) ? parse(readFileSync(rootEnv)).DATABASE_URL : undefined
  const base =
    process.env.TEST_DATABASE_URL ??
    process.env.DATABASE_URL ??
    fromFile ??
    'postgresql://mystore:dev_only_change_me@localhost:5432/mystore'

  const url = new URL(base)
  const name = url.pathname.slice(1)
  if (!name.endsWith('_test')) url.pathname = `/${name}_test`
  return url.toString()
}

/** 同一個伺服器上、不同資料庫名稱的連線字串(用來連到 postgres 這個管理用資料庫) */
export function withDatabase(connectionString: string, database: string): string {
  const url = new URL(connectionString)
  url.pathname = `/${database}`
  return url.toString()
}

export function databaseName(connectionString: string): string {
  return new URL(connectionString).pathname.slice(1)
}
