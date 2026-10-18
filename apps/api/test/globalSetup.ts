import { execSync } from 'node:child_process'
import { resolve } from 'node:path'
import pg from 'pg'
import { databaseName, getTestDatabaseUrl, withDatabase } from './testDb.js'

/**
 * 整個測試開始前執行一次:
 *  1. 如果測試資料庫(例如 mystore_test)不存在,就建立
 *  2. 把所有 migration 套用上去,讓資料表與正式的一模一樣
 */
export default async function setup() {
  const testUrl = getTestDatabaseUrl()
  const name = databaseName(testUrl)

  if (!name.endsWith('_test') || !/^[a-z0-9_]+$/.test(name)) {
    throw new Error(`測試資料庫名稱必須是小寫英數字且以 _test 結尾,目前是:${name}`)
  }

  const admin = new pg.Client({ connectionString: withDatabase(testUrl, 'postgres') })
  await admin.connect()
  try {
    const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [name])
    if (exists.rowCount === 0) await admin.query(`CREATE DATABASE "${name}"`)
  } finally {
    await admin.end()
  }

  execSync('npx prisma migrate deploy', {
    cwd: resolve(import.meta.dirname, '..'),
    env: { ...process.env, DATABASE_URL: testUrl },
    stdio: 'pipe',
  })
}
