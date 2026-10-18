import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import Fastify from 'fastify'
import {
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod'
import { config } from './config.js'
import { checkDatabase } from './db.js'
import { AppError } from './lib/errors.js'
import { SESSION_COOKIE } from './plugins/auth.js'
import { adminRoutes } from './routes/admin/index.js'
import { healthRoutes } from './routes/health.js'
import { menuRoutes } from './routes/menu.js'
import { orderRoutes } from './routes/orders.js'
import { storeRoutes } from './routes/store.js'

export interface BuildAppOptions {
  logger?: boolean
  /** 檢查資料庫是否連得上;測試時可以傳入假的函式 */
  checkDb?: () => Promise<boolean>
  /** 取得「現在時間」;測試時可以傳入固定的時間(營業時間、取餐時間的判斷都靠它) */
  clock?: () => Date
  /** 是否啟用「請求太頻繁就擋下」;預設依環境變數 RATE_LIMIT_ENABLED */
  rateLimit?: boolean
  /** 是否提供 /docs;預設依環境變數 ENABLE_DOCS */
  docs?: boolean
}

/** 建立後端應用程式(不啟動,方便測試時直接呼叫) */
export async function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify({
    logger: options.logger ?? config.nodeEnv !== 'test',
    trustProxy: config.trustProxy,
  }).withTypeProvider<ZodTypeProvider>()

  // 用 zod 驗證所有輸入與輸出(輸出多餘的欄位會被濾掉,不會不小心把不該給的資料送出去)
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  app.decorate('clock', options.clock ?? (() => new Date()))

  // 讓「宣告是 JSON、但內容是空的」請求也能通過(例如前端對『接單』這類不需要內容的按鈕送 POST)。
  // 其餘行為(包含防原型污染)沿用 Fastify 預設的 JSON 解析。
  const defaultJsonParser = app.getDefaultJsonParser('error', 'error')
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (request, body, done) => {
    if (typeof body === 'string' && body.trim() === '') return done(null, undefined)
    defaultJsonParser(request, body as string, done)
  })

  // ── API 說明文件(/docs):可以直接在網頁上試打 API ──
  await app.register(swagger, {
    openapi: {
      openapi: '3.0.3',
      info: {
        title: '我的早餐店 API',
        version: '1.0.0',
        description:
          '外帶點餐系統後端。顧客端不需登入;後台需要員工登入(`POST /api/admin/auth/login`),登入後瀏覽器會自動帶上 Cookie。\n\n' +
          '所有金額都是新台幣元的整數;價格一律由後端計算。',
      },
      tags: [
        { name: '顧客', description: '顧客端(不需登入):菜單、店家資訊、下單、追蹤、取消' },
        { name: '後台-登入', description: '員工登入、登出' },
        { name: '後台-訂單', description: '接單、改狀態、收現金(店員以上)' },
        { name: '後台-菜單', description: '菜單管理(看與售完:店員;新增修改刪除:店長以上)' },
        { name: '後台-店家', description: '店家設定(店長以上可改)' },
        { name: '後台-員工(老闆)', description: '員工帳號管理(只有老闆)' },
        { name: '系統', description: '健康檢查' },
      ],
      components: {
        securitySchemes: { cookieAuth: { type: 'apiKey', in: 'cookie', name: SESSION_COOKIE } },
      },
    },
    transform: jsonSchemaTransform,
  })
  if (options.docs ?? config.enableDocs) {
    await app.register(swaggerUi, {
      routePrefix: '/docs',
      uiConfig: { docExpansion: 'list', deepLinking: false },
    })
  }

  await app.register(cors, {
    origin: config.corsOrigins,
    credentials: true, // 讓前端(不同網址)的請求可以帶 Cookie
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  })
  await app.register(cookie)

  if (options.rateLimit ?? config.rateLimitEnabled) {
    await app.register(rateLimit, {
      global: true,
      max: 300, // 所有路由的預設:同一個 IP 每分鐘最多 300 次;重要的路由另外設更嚴格的限制
      timeWindow: '1 minute',
      errorResponseBuilder: (_request, context) =>
        new AppError(429, 'RATE_LIMITED', `請求太頻繁了,請 ${Math.max(1, Math.ceil(context.ttl / 1000))} 秒後再試`),
    })
  }

  // ── 統一錯誤格式:{ "error": { "code": "...", "message": "..." } } ──
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({ error: { code: error.code, message: error.message } })
    }

    if (hasZodFastifySchemaValidationErrors(error)) {
      const message = error.validation
        .map((issue) => {
          const field = issue.instancePath.replace(/^\//, '').replaceAll('/', '.')
          return field && issue.message && !/[一-鿿]/.test(issue.message) ? `${field}:${issue.message}` : issue.message
        })
        .join(';')
      return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: message || '輸入的資料格式不正確' } })
    }

    const status = (error as { statusCode?: number }).statusCode ?? 500
    if (isResponseSerializationError(error) || status >= 500) {
      // 不把內部錯誤細節回傳給使用者,只記在伺服器日誌
      request.log.error(error)
      return reply.status(500).send({ error: { code: 'INTERNAL_ERROR', message: '伺服器發生錯誤,請稍後再試' } })
    }
    return reply.status(status).send({
      error: { code: (error as { code?: string }).code ?? 'BAD_REQUEST', message: (error as Error).message },
    })
  })

  app.setNotFoundHandler((_request, reply) =>
    reply.status(404).send({ error: { code: 'NOT_FOUND', message: '找不到這個網址' } }),
  )

  await app.register(healthRoutes, { checkDb: options.checkDb ?? checkDatabase })
  await app.register(menuRoutes, { prefix: '/api' })
  await app.register(storeRoutes, { prefix: '/api' })
  await app.register(orderRoutes, { prefix: '/api' })
  await app.register(adminRoutes, { prefix: '/api/admin' })

  return app
}
