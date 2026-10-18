import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '../src/db.js'
import { generateToken, hashToken, maskPhone, TRACKING_TOKEN_PATTERN } from '../src/lib/security.js'
import { createFixture, createTestApp, json, phone, postOrder, resetDatabase, simpleOrder, type Fixture } from './helpers.js'

let fx: Fixture
let ctx: Awaited<ReturnType<typeof createTestApp>>

beforeEach(async () => {
  await resetDatabase()
  fx = await createFixture()
  ctx = await createTestApp({ rateLimit: true }) // 這個測試檔開啟「請求太頻繁就擋下」
})
afterAll(async () => {
  await ctx?.app.close()
  await prisma.$disconnect()
})

describe('請求頻率限制', () => {
  it('登入:同一個 IP 一分鐘內第 11 次起被擋(429 RATE_LIMITED),訊息告訴你要等幾秒', async () => {
    const attempt = (i: number) =>
      ctx.app.inject({ method: 'POST', url: '/api/admin/auth/login', payload: { email: `nobody${i}@test.local`, password: 'x' } })
    for (let i = 0; i < 10; i += 1) expect((await attempt(i)).statusCode).toBe(401)

    const blocked = await attempt(11)
    expect(blocked.statusCode).toBe(429)
    expect(json(blocked).error.code).toBe('RATE_LIMITED')
    expect(json(blocked).error.message).toMatch(/秒/)
  })

  it('下單:同一個 IP 10 分鐘內第 11 張起被擋', async () => {
    for (let i = 1; i <= 10; i += 1) {
      const response = await postOrder(ctx.app, simpleOrder(fx, { customerPhone: phone(i) }))
      expect(response.statusCode, response.body).toBe(201)
    }
    const blocked = await postOrder(ctx.app, simpleOrder(fx, { customerPhone: phone(11) }))
    expect(blocked.statusCode).toBe(429)
    expect(json(blocked).error.code).toBe('RATE_LIMITED')
    expect(await prisma.order.count()).toBe(10)
  })

  it('被擋時回應帶有 retry-after 標頭;一般查詢(菜單)不受影響', async () => {
    for (let i = 0; i < 10; i += 1) {
      await ctx.app.inject({ method: 'POST', url: '/api/admin/auth/login', payload: { email: 'a@test.local', password: 'x' } })
    }
    const blocked = await ctx.app.inject({ method: 'POST', url: '/api/admin/auth/login', payload: { email: 'a@test.local', password: 'x' } })
    expect(blocked.headers['retry-after']).toBeDefined()
    expect((await ctx.app.inject({ method: 'GET', url: '/api/menu' })).statusCode).toBe(200)
  })
})

describe('安全工具', () => {
  it('追蹤碼:32 字元、不可預測、每次都不同', () => {
    const tokens = new Set(Array.from({ length: 200 }, () => generateToken(24)))
    expect(tokens.size).toBe(200)
    for (const token of tokens) {
      expect(token).toHaveLength(32)
      expect(TRACKING_TOKEN_PATTERN.test(token)).toBe(true)
    }
  })

  it('通行證雜湊:固定長度的 64 字元十六進位,同樣的輸入得到同樣的結果', () => {
    expect(hashToken('abc')).toMatch(/^[0-9a-f]{64}$/)
    expect(hashToken('abc')).toBe(hashToken('abc'))
    expect(hashToken('abc')).not.toBe(hashToken('abd'))
  })

  it('電話遮罩', () => {
    expect(maskPhone('0912345678')).toBe('0912***678')
    expect(maskPhone('123')).toBe('***')
  })

  it('追蹤碼格式檢查:太短、太長、有奇怪字元都不合格', () => {
    for (const bad of ['short', 'a'.repeat(65), 'has space in it 0123456789', '../../../etc/passwd/123456', 'ä'.repeat(30)]) {
      expect(TRACKING_TOKEN_PATTERN.test(bad)).toBe(false)
    }
  })
})
