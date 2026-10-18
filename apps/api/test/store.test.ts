import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '../src/db.js'
import { at, createFixture, createTestApp, json, loginCookie, phone, postOrder, resetDatabase, simpleOrder, type Fixture } from './helpers.js'

let fx: Fixture
let ctx: Awaited<ReturnType<typeof createTestApp>>
let managerCookie: string

beforeEach(async () => {
  await resetDatabase()
  fx = await createFixture()
  ctx = await createTestApp()
  managerCookie = await loginCookie(ctx.app, 'manager@test.local')
})
afterAll(async () => {
  await ctx?.app.close()
  await prisma.$disconnect()
})

const getStore = async () => json(await ctx.app.inject({ method: 'GET', url: '/api/store' }))
const patch = (payload: object, cookie = managerCookie) =>
  ctx.app.inject({ method: 'PATCH', url: '/api/admin/store', payload, headers: { cookie } })
const expectError = (response: { statusCode: number; body: string }, status: number, code: string) => {
  expect(response.statusCode, response.body).toBe(status)
  expect(json(response).error.code).toBe(code)
}

describe('GET /api/store:顧客看到的店家資訊', () => {
  it('營業中:可以下單', async () => {
    expect(await getStore()).toEqual({
      name: '測試早餐店', acceptingOrders: true, openTime: '06:00', closeTime: '13:00', prepMinutes: 10, isOpenNow: true, canOrderNow: true,
    })
  })

  it('還沒開店 / 已經打烊:不能下單', async () => {
    ctx.clock.current = at('05:00')
    expect(await getStore()).toMatchObject({ isOpenNow: false, canOrderNow: false })
    ctx.clock.current = at('13:30')
    expect(await getStore()).toMatchObject({ isOpenNow: false, canOrderNow: false })
  })

  it('快打烊:仍在營業,但已過最後下單時間(打烊 − 備餐時間)', async () => {
    ctx.clock.current = at('12:50')
    expect(await getStore()).toMatchObject({ isOpenNow: true, canOrderNow: true })
    ctx.clock.current = at('12:51')
    expect(await getStore()).toMatchObject({ isOpenNow: true, canOrderNow: false })
  })

  it('暫停接單:營業時間內也不能下單', async () => {
    await prisma.store.update({ where: { id: fx.store.id }, data: { acceptingOrders: false } })
    expect(await getStore()).toMatchObject({ acceptingOrders: false, isOpenNow: true, canOrderNow: false })
  })

  it('不會洩漏內部資料(例如店家 ID)', async () => {
    const store = await getStore()
    expect(store).not.toHaveProperty('id')
    expect(store).not.toHaveProperty('slug')
  })

  it('還沒執行 seed(找不到店家):503 STORE_NOT_CONFIGURED', async () => {
    await resetDatabase()
    const response = await ctx.app.inject({ method: 'GET', url: '/api/store' })
    expectError(response, 503, 'STORE_NOT_CONFIGURED')
  })
})

describe('PATCH /api/admin/store:店長修改店家設定', () => {
  it('改備餐時間與營業時間,立刻影響顧客端', async () => {
    const response = await patch({ prepMinutes: 20, openTime: '07:00', closeTime: '12:00' })
    expect(response.statusCode, response.body).toBe(200)
    expect(json(response)).toMatchObject({ prepMinutes: 20, openTime: '07:00', closeTime: '12:00', id: fx.store.id, slug: 'my-store' })
    expect(await getStore()).toMatchObject({ openTime: '07:00', closeTime: '12:00', prepMinutes: 20 })
  })

  it('只改有傳的欄位', async () => {
    await patch({ name: '新店名' })
    expect(await getStore()).toMatchObject({ name: '新店名', openTime: '06:00', prepMinutes: 10, acceptingOrders: true })
  })

  it('暫停接單 → 顧客不能下單(ORDERS_PAUSED);恢復接單 → 又可以', async () => {
    await patch({ acceptingOrders: false })
    expectError(await postOrder(ctx.app, simpleOrder(fx)), 409, 'ORDERS_PAUSED')
    await patch({ acceptingOrders: true })
    expect((await postOrder(ctx.app, simpleOrder(fx))).statusCode).toBe(201)
  })

  it('暫停接單只影響新訂單:已經進來的訂單,店員還是可以處理', async () => {
    const placed = json(await postOrder(ctx.app, simpleOrder(fx)))
    const order = await prisma.order.findFirstOrThrow({ where: { trackingToken: placed.order.trackingToken } })
    await patch({ acceptingOrders: false })
    const staffCookie = await loginCookie(ctx.app, 'staff@test.local')
    const accept = await ctx.app.inject({ method: 'POST', url: `/api/admin/orders/${order.id}/accept`, headers: { cookie: staffCookie } })
    expect(accept.statusCode).toBe(200)
  })

  it('改備餐時間會影響取餐時間的驗證', async () => {
    await patch({ prepMinutes: 30 })
    const tooEarly = await postOrder(ctx.app, simpleOrder(fx, { pickupAt: at('09:20').toISOString() }))
    expectError(tooEarly, 400, 'PICKUP_TIME_INVALID')
    const ok = await postOrder(ctx.app, simpleOrder(fx, { customerPhone: phone(2), pickupAt: at('09:30').toISOString() }))
    expect(ok.statusCode).toBe(201)
  })

  it('輸入驗證:時間格式、開店要早於關店、備餐分鐘數範圍、至少改一個欄位', async () => {
    expectError(await patch({ openTime: '6:00' }), 400, 'VALIDATION_ERROR')
    expectError(await patch({ openTime: '25:00' }), 400, 'VALIDATION_ERROR')
    expectError(await patch({ openTime: '14:00' }), 400, 'INVALID_HOURS') // 14:00 之後才開、13:00 關
    expectError(await patch({ closeTime: '05:00' }), 400, 'INVALID_HOURS')
    expectError(await patch({ prepMinutes: -1 }), 400, 'VALIDATION_ERROR')
    expectError(await patch({ prepMinutes: 241 }), 400, 'VALIDATION_ERROR')
    expectError(await patch({ prepMinutes: 10.5 }), 400, 'VALIDATION_ERROR')
    expectError(await patch({}), 400, 'VALIDATION_ERROR')
    expectError(await patch({ name: '   ' }), 400, 'VALIDATION_ERROR')
    expect(await getStore()).toMatchObject({ openTime: '06:00', closeTime: '13:00', prepMinutes: 10 }) // 都沒被改到
  })

  it('修改會寫稽核日誌', async () => {
    await patch({ acceptingOrders: false })
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: 'store.update' } })
    expect(log).toMatchObject({ actorId: fx.staff.manager.id, storeId: fx.store.id, entity: 'Store' })
    expect(log.meta).toMatchObject({ changes: { acceptingOrders: false } })
  })

  it('店員可以「看」店家設定(含 id 與 slug),但不能改', async () => {
    const staffCookie = await loginCookie(ctx.app, 'staff@test.local')
    const view = await ctx.app.inject({ method: 'GET', url: '/api/admin/store', headers: { cookie: staffCookie } })
    expect(view.statusCode).toBe(200)
    expect(json(view)).toMatchObject({ id: fx.store.id, slug: 'my-store' })
    expectError(await patch({ prepMinutes: 5 }, staffCookie), 403, 'FORBIDDEN')
  })
})
