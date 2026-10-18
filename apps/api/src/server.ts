import { buildApp } from './app.js'
import { config } from './config.js'
import { prisma } from './db.js'

const app = await buildApp()

// 收到 Ctrl+C 或停止訊號時,先把請求處理完、關閉資料庫連線,再結束
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    app.log.info(`收到 ${signal},正在關閉…`)
    await app.close()
    await prisma.$disconnect()
    process.exit(0)
  })
}

try {
  await app.listen({ host: config.host, port: config.port })
} catch (error) {
  app.log.error(error)
  process.exit(1)
}
