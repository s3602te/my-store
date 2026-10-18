import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'

interface HealthOptions {
  /** 檢查資料庫是否連得上(測試時可以換成假的) */
  checkDb: () => Promise<boolean>
}

const healthResponse = z.object({
  status: z.enum(['ok', 'degraded']),
  db: z.enum(['up', 'down']),
  time: z.string(),
})

/**
 * GET /health — 健康檢查。
 * 資料庫正常:200 { status: "ok", db: "up" }
 * 資料庫連不上:503 { status: "degraded", db: "down" }(後端本身還活著,只是資料庫有問題)
 */
export const healthRoutes: FastifyPluginAsyncZod<HealthOptions> = async (app, options) => {
  app.get(
    '/health',
    {
      schema: {
        tags: ['系統'],
        summary: '健康檢查(含資料庫狀態)',
        response: { 200: healthResponse, 503: healthResponse },
      },
    },
    async (_request, reply) => {
      const dbUp = await options.checkDb()
      return reply.status(dbUp ? 200 : 503).send({
        status: dbUp ? 'ok' : 'degraded',
        db: dbUp ? 'up' : 'down',
        time: new Date().toISOString(),
      })
    },
  )
}
