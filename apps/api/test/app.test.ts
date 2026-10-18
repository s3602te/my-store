import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { ORDER_STATUSES } from '../src/lib/orderStatus.js'
import { OrderStatus as PrismaOrderStatus } from '../src/generated/prisma/enums.js'

describe('GET /health(用假的資料庫檢查,不需要真的資料庫)', () => {
  let dbUp = true
  let app: Awaited<ReturnType<typeof buildApp>>

  beforeAll(async () => {
    app = await buildApp({ logger: false, checkDb: async () => dbUp })
  })
  afterAll(() => app.close())

  it('資料庫正常:200 與 db: up', async () => {
    dbUp = true
    const response = await app.inject({ method: 'GET', url: '/health' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ status: 'ok', db: 'up' })
  })

  it('資料庫連不上:503 與 db: down(後端本身仍然回應)', async () => {
    dbUp = false
    const response = await app.inject({ method: 'GET', url: '/health' })
    expect(response.statusCode).toBe(503)
    expect(response.json()).toMatchObject({ status: 'degraded', db: 'down' })
  })

  it('不存在的網址:404 與統一的錯誤格式', async () => {
    const response = await app.inject({ method: 'GET', url: '/not-exist' })
    expect(response.statusCode).toBe(404)
    expect(response.json()).toEqual({ error: { code: 'NOT_FOUND', message: '找不到這個網址' } })
  })

  it('只允許設定好的前端網址跨來源呼叫(CORS)', async () => {
    const allowed = await app.inject({ method: 'GET', url: '/health', headers: { origin: 'http://localhost:5173' } })
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173')

    const blocked = await app.inject({ method: 'GET', url: '/health', headers: { origin: 'http://evil.example' } })
    expect(blocked.headers['access-control-allow-origin']).toBeUndefined()
  })
})

describe('訂單狀態機與資料庫列舉保持一致', () => {
  it('lib/orderStatus.ts 的狀態,和 schema.prisma 的 OrderStatus 完全相同', () => {
    expect([...ORDER_STATUSES].sort()).toEqual(Object.values(PrismaOrderStatus).sort())
  })
})
