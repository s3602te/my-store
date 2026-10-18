import type { FastifyInstance } from 'fastify'

interface HealthOptions {
  /** 檢查資料庫是否連得上(測試時可以換成假的) */
  checkDb: () => Promise<boolean>
}

/**
 * GET /health — 健康檢查。
 * 資料庫正常:200 { status: "ok", db: "up" }
 * 資料庫連不上:503 { status: "degraded", db: "down" }(後端本身還活著,只是資料庫有問題)
 */
export async function healthRoutes(app: FastifyInstance, options: HealthOptions) {
  app.get('/health', async (_request, reply) => {
    const dbUp = await options.checkDb()
    return reply.status(dbUp ? 200 : 503).send({
      status: dbUp ? 'ok' : 'degraded',
      db: dbUp ? 'up' : 'down',
      time: new Date().toISOString(),
    })
  })
}
