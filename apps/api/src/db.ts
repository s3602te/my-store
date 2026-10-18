import { PrismaPg } from '@prisma/adapter-pg'
import { config } from './config.js'
import { PrismaClient } from './generated/prisma/client.js'

/** 整個後端共用同一個資料庫連線(Prisma Client) */
export const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: config.databaseUrl }),
})

/** 檢查資料庫是否連得上(給 /health 使用);最多等 2 秒 */
export async function checkDatabase(): Promise<boolean> {
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000)),
    ])
    return true
  } catch {
    return false
  }
}
