import cors from '@fastify/cors'
import Fastify, { type FastifyError } from 'fastify'
import { ZodError } from 'zod'
import { config } from './config.js'
import { checkDatabase } from './db.js'
import { healthRoutes } from './routes/health.js'
import { menuRoutes } from './routes/menu.js'

export interface BuildAppOptions {
  logger?: boolean
  /** 檢查資料庫是否連得上;測試時可以傳入假的函式 */
  checkDb?: () => Promise<boolean>
}

/** 建立後端應用程式(不啟動,方便測試時直接呼叫) */
export async function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify({ logger: options.logger ?? config.nodeEnv !== 'test' })

  await app.register(cors, {
    origin: config.corsOrigins,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  })

  // 統一錯誤格式:{ "error": { "code": "...", "message": "..." } }
  app.setErrorHandler((error: FastifyError | ZodError, request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: error.issues.map((issue) => issue.message).join(';') },
      })
    }

    const status = error.statusCode ?? 500
    if (status >= 500) {
      // 不把內部錯誤細節回傳給使用者,只記在伺服器日誌
      request.log.error(error)
      return reply.status(500).send({
        error: { code: 'INTERNAL_ERROR', message: '伺服器發生錯誤,請稍後再試' },
      })
    }
    return reply.status(status).send({
      error: { code: error.code ?? 'BAD_REQUEST', message: error.message },
    })
  })

  app.setNotFoundHandler((_request, reply) =>
    reply.status(404).send({ error: { code: 'NOT_FOUND', message: '找不到這個網址' } }),
  )

  await app.register(healthRoutes, { checkDb: options.checkDb ?? checkDatabase })
  await app.register(menuRoutes, { prefix: '/api' })

  return app
}
