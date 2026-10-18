import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '../src/db.js'
import { createFixture, createTestApp, json, loginCookie, phone, postOrder, resetDatabase, simpleOrder, type Fixture } from './helpers.js'

let fx: Fixture
let ctx: Awaited<ReturnType<typeof createTestApp>>
let staffCookie: string

beforeEach(async () => {
  await resetDatabase()
  fx = await createFixture()
  ctx = await createTestApp()
  staffCookie = await loginCookie(ctx.app, 'staff@test.local')
})
afterAll(async () => {
  await ctx?.app.close()
  await prisma.$disconnect()
})

/** 顧客下一張單,回傳訂單 id 與追蹤碼 */
async function placeOrder(overrides: Record<string, unknown> = {}) {
  const response = await postOrder(ctx.app, simpleOrder(fx, overrides))
  expect(response.statusCode, response.body).toBe(201)
  const { order } = json(response)
  const row = await prisma.order.findFirstOrThrow({ where: { trackingToken: order.trackingToken } })
  return { id: row.id, token: order.trackingToken as string, number: order.orderNumber as string }
}

const admin = (method: 'GET' | 'POST', url: string, payload?: object, cookie = staffCookie) =>
  ctx.app.inject({ method, url: `/api/admin${url}`, payload, headers: { cookie } })

const expectError = (response: { statusCode: number; body: string }, status: number, code: string) => {
  expect(response.statusCode, response.body).toBe(status)
  expect(json(response).error.code).toBe(code)
}

/** 把訂單一路推到某個狀態(含收款) */
async function advance(id: string, steps: Array<'accept' | 'preparing' | 'ready' | 'pay' | 'complete'>) {
  for (const step of steps) {
    const response =
      step === 'accept' ? await admin('POST', `/orders/${id}/accept`)
      : step === 'pay' ? await admin('POST', `/orders/${id}/payments/cash-confirm`)
      : await admin('POST', `/orders/${id}/status`, { status: { preparing: 'PREPARING', ready: 'READY', complete: 'COMPLETED' }[step] })
    expect(response.statusCode, `${step}: ${response.body}`).toBe(200)
  }
}

describe('顧客用追蹤碼查詢訂單', () => {
  it('查得到自己的訂單,看得到狀態與明細', async () => {
    const { token, number } = await placeOrder()
    const response = await ctx.app.inject({ method: 'GET', url: `/api/orders/${token}` })
    expect(response.statusCode).toBe(200)
    expect(json(response)).toMatchObject({ orderNumber: number, status: 'PENDING', total: 15 })
  })

  it('追蹤碼格式不對、或查不到:一律 404 ORDER_NOT_FOUND,不透露任何資訊', async () => {
    for (const bad of ['abc', 'x'.repeat(32), '../../etc/passwd', `${'a'.repeat(65)}`]) {
      const response = await ctx.app.inject({ method: 'GET', url: `/api/orders/${encodeURIComponent(bad)}` })
      expectError(response, 404, 'ORDER_NOT_FOUND')
    }
  })

  it('不能用「訂單編號」或「資料庫 ID」查訂單(只有追蹤碼可以)', async () => {
    const { id, number } = await placeOrder()
    expectError(await ctx.app.inject({ method: 'GET', url: `/api/orders/${number}` }), 404, 'ORDER_NOT_FOUND')
    expectError(await ctx.app.inject({ method: 'GET', url: `/api/orders/${id}` }), 404, 'ORDER_NOT_FOUND')
  })

  it('店員接單後,顧客的追蹤頁會看到新狀態', async () => {
    const { id, token } = await placeOrder()
    await advance(id, ['accept', 'preparing'])
    const tracked = json(await ctx.app.inject({ method: 'GET', url: `/api/orders/${token}` }))
    expect(tracked.status).toBe('PREPARING')
    expect(tracked.acceptedAt).not.toBeNull()
  })
})

describe('顧客自行取消', () => {
  it('待接單時可以取消,沒填原因會記為「顧客自行取消」', async () => {
    const { token } = await placeOrder()
    const response = await ctx.app.inject({ method: 'POST', url: `/api/orders/${token}/cancel`, payload: {} })
    expect(response.statusCode).toBe(200)
    expect(json(response)).toMatchObject({ status: 'CANCELLED', cancelReason: '顧客自行取消' })
    expect(json(response).cancelledAt).not.toBeNull()
  })

  it('可以自己填取消原因', async () => {
    const { token } = await placeOrder()
    const response = await ctx.app.inject({ method: 'POST', url: `/api/orders/${token}/cancel`, payload: { reason: '臨時有事' } })
    expect(json(response).cancelReason).toBe('臨時有事')
  })

  it('店家接單之後就不能自己取消:409 CANNOT_CANCEL,請聯絡店家', async () => {
    const { id, token } = await placeOrder()
    await advance(id, ['accept'])
    const response = await ctx.app.inject({ method: 'POST', url: `/api/orders/${token}/cancel`, payload: {} })
    expectError(response, 409, 'CANNOT_CANCEL')
    expect(json(response).error.message).toContain('聯絡店家')
    expect((await prisma.order.findUniqueOrThrow({ where: { id } })).status).toBe('ACCEPTED')
  })

  it('取消兩次:第二次被拒絕', async () => {
    const { token } = await placeOrder()
    await ctx.app.inject({ method: 'POST', url: `/api/orders/${token}/cancel`, payload: {} })
    expectError(await ctx.app.inject({ method: 'POST', url: `/api/orders/${token}/cancel`, payload: {} }), 409, 'CANNOT_CANCEL')
  })

  it('取消後,同一支電話又可以再下單(不佔用待接單名額)', async () => {
    for (let i = 0; i < 3; i += 1) {
      const { token } = await placeOrder()
      await ctx.app.inject({ method: 'POST', url: `/api/orders/${token}/cancel`, payload: {} })
    }
    expect((await postOrder(ctx.app, simpleOrder(fx))).statusCode).toBe(201)
  })
})

describe('後台:登入與資料範圍', () => {
  it('沒登入不能看訂單、不能操作:401', async () => {
    const { id } = await placeOrder()
    for (const [method, url] of [['GET', '/orders'], ['GET', `/orders/${id}`], ['POST', `/orders/${id}/accept`]] as const) {
      const response = await ctx.app.inject({ method, url: `/api/admin${url}` })
      expectError(response, 401, 'UNAUTHENTICATED')
    }
  })

  it('員工只能看到自己店的訂單;別家店的訂單 ID 一律 404(不洩漏存在與否)', async () => {
    const other = await prisma.store.create({ data: { slug: 'other-store', name: '別家店' } })
    const foreign = await prisma.order.create({
      data: {
        storeId: other.id, businessDate: new Date('2026-10-20'), sequence: 1, orderNumber: 'A001', trackingToken: 'foreign-token-0000000000000000',
        customerName: '別家顧客', customerPhone: phone(9), subtotal: 10, total: 10,
      },
    })
    expectError(await admin('GET', `/orders/${foreign.id}`), 404, 'ORDER_NOT_FOUND')
    expectError(await admin('POST', `/orders/${foreign.id}/accept`), 404, 'ORDER_NOT_FOUND')
    expectError(await admin('POST', `/orders/${foreign.id}/payments/cash-confirm`), 404, 'ORDER_NOT_FOUND')
    const list = json(await admin('GET', '/orders'))
    expect(list.orders.every((o: { id: string }) => o.id !== foreign.id)).toBe(true)
  })

  it('訂單詳情給店員看完整電話、付款與發票資訊', async () => {
    const { id } = await placeOrder({ customerPhone: '0912345678', customerName: '王小明' })
    const detail = json(await admin('GET', `/orders/${id}`))
    expect(detail).toMatchObject({ id, customerPhone: '0912345678', customerName: '王小明', status: 'PENDING', businessDate: '2026-10-20' })
    expect(detail.payments).toEqual([expect.objectContaining({ provider: 'cash', status: 'PENDING', amount: 15, paidAt: null })])
    expect(detail.invoice).toEqual({ status: 'NOT_REQUIRED', invoiceNumber: null })
    expect(detail).not.toHaveProperty('trackingToken') // 店員端不需要追蹤碼
  })
})

describe('後台:訂單列表', () => {
  it('預設顯示「今天」的訂單,附上各狀態的數量', async () => {
    const a = await placeOrder({ customerPhone: phone(1) })
    await placeOrder({ customerPhone: phone(2) })
    await advance(a.id, ['accept'])

    const list = json(await admin('GET', '/orders'))
    expect(list.date).toBe('2026-10-20')
    expect(list.total).toBe(2)
    expect(list.counts).toMatchObject({ PENDING: 1, ACCEPTED: 1, PREPARING: 0, READY: 0, COMPLETED: 0, CANCELLED: 0, REJECTED: 0 })
  })

  it('可以用狀態篩選(多個用逗號);counts 不受篩選影響', async () => {
    const a = await placeOrder({ customerPhone: phone(1) })
    await placeOrder({ customerPhone: phone(2) })
    await advance(a.id, ['accept'])

    const pendingOnly = json(await admin('GET', '/orders?status=PENDING'))
    expect(pendingOnly.orders).toHaveLength(1)
    expect(pendingOnly.orders[0].status).toBe('PENDING')
    expect(pendingOnly.counts.ACCEPTED).toBe(1)

    expect(json(await admin('GET', '/orders?status=pending,accepted')).orders).toHaveLength(2)
    expectError(await admin('GET', '/orders?status=BOGUS'), 400, 'INVALID_STATUS_FILTER')
  })

  it('依日期篩選:其他日期沒有訂單;日期格式錯誤 400', async () => {
    await placeOrder()
    expect(json(await admin('GET', '/orders?date=2026-10-19')).orders).toHaveLength(0)
    expect(json(await admin('GET', '/orders?date=2026-10-20')).orders).toHaveLength(1)
    expectError(await admin('GET', '/orders?date=2026-02-31'), 400, 'INVALID_DATE')
    expectError(await admin('GET', '/orders?date=hello'), 400, 'VALIDATION_ERROR')
  })

  it('排序與分頁', async () => {
    for (let i = 1; i <= 5; i += 1) await placeOrder({ customerPhone: phone(i) })
    const asc = json(await admin('GET', '/orders?sort=asc&pageSize=2&page=1'))
    expect(asc.orders.map((o: { orderNumber: string }) => o.orderNumber)).toEqual(['A001', 'A002'])
    expect(asc.total).toBe(5)
    const page3 = json(await admin('GET', '/orders?sort=asc&pageSize=2&page=3'))
    expect(page3.orders.map((o: { orderNumber: string }) => o.orderNumber)).toEqual(['A005'])
    const desc = json(await admin('GET', '/orders?pageSize=2'))
    expect(desc.orders.map((o: { orderNumber: string }) => o.orderNumber)).toEqual(['A005', 'A004'])
  })
})

describe('後台:訂單狀態流程', () => {
  it('完整流程:接單 → 製作中 → 可取餐 → 收現金 → 完成,每一步都記下時間', async () => {
    const { id } = await placeOrder()
    const accepted = json(await admin('POST', `/orders/${id}/accept`))
    expect(accepted).toMatchObject({ status: 'ACCEPTED' })
    expect(accepted.acceptedAt).not.toBeNull()

    expect(json(await admin('POST', `/orders/${id}/status`, { status: 'PREPARING' })).status).toBe('PREPARING')
    const ready = json(await admin('POST', `/orders/${id}/status`, { status: 'READY' }))
    expect(ready.status).toBe('READY')
    expect(ready.readyAt).not.toBeNull()

    const paid = json(await admin('POST', `/orders/${id}/payments/cash-confirm`))
    expect(paid.paymentStatus).toBe('SUCCEEDED')
    expect(paid.payments[0]).toMatchObject({ status: 'SUCCEEDED', confirmedById: fx.staff.staff.id })
    expect(paid.payments[0].paidAt).not.toBeNull()

    const done = json(await admin('POST', `/orders/${id}/status`, { status: 'COMPLETED' }))
    expect(done.status).toBe('COMPLETED')
    expect(done.completedAt).not.toBeNull()
  })

  it('還沒收現金,不能完成:409 PAYMENT_REQUIRED', async () => {
    const { id } = await placeOrder()
    await advance(id, ['accept', 'preparing', 'ready'])
    expectError(await admin('POST', `/orders/${id}/status`, { status: 'COMPLETED' }), 409, 'PAYMENT_REQUIRED')
  })

  it('不能跳級:待接單不能直接變成已完成/可取餐;不能倒退', async () => {
    const { id } = await placeOrder()
    expectError(await admin('POST', `/orders/${id}/status`, { status: 'READY' }), 409, 'INVALID_TRANSITION')
    expectError(await admin('POST', `/orders/${id}/status`, { status: 'COMPLETED' }), 409, 'INVALID_TRANSITION')
    await advance(id, ['accept', 'preparing'])
    const back = await admin('POST', `/orders/${id}/status`, { status: 'ACCEPTED' })
    expectError(back, 409, 'INVALID_TRANSITION')
    expect(json(back).error.message).toContain('製作中') // 訊息用中文狀態名稱
  })

  it('不能把狀態改成「待接單」', async () => {
    const { id } = await placeOrder()
    expectError(await admin('POST', `/orders/${id}/status`, { status: 'PENDING' }), 400, 'VALIDATION_ERROR')
  })

  it('拒單必須填原因;填了之後訂單變成「店家拒絕」,顧客看得到原因', async () => {
    const { id, token } = await placeOrder()
    expectError(await admin('POST', `/orders/${id}/reject`, { reason: '   ' }), 400, 'VALIDATION_ERROR')
    expectError(await admin('POST', `/orders/${id}/reject`, {}), 400, 'VALIDATION_ERROR')

    const rejected = await admin('POST', `/orders/${id}/reject`, { reason: '今日已售完' })
    expect(json(rejected)).toMatchObject({ status: 'REJECTED', cancelReason: '今日已售完' })
    const tracked = json(await ctx.app.inject({ method: 'GET', url: `/api/orders/${token}` }))
    expect(tracked).toMatchObject({ status: 'REJECTED', cancelReason: '今日已售完' })
  })

  it('已接單後只有「待接單」才能拒單', async () => {
    const { id } = await placeOrder()
    await advance(id, ['accept'])
    expectError(await admin('POST', `/orders/${id}/reject`, { reason: '太忙' }), 409, 'INVALID_TRANSITION')
  })

  it('店員取消製作中的訂單,必須填原因(REASON_REQUIRED)', async () => {
    const { id } = await placeOrder()
    await advance(id, ['accept', 'preparing'])
    expectError(await admin('POST', `/orders/${id}/status`, { status: 'CANCELLED' }), 400, 'REASON_REQUIRED')
    const cancelled = json(await admin('POST', `/orders/${id}/status`, { status: 'CANCELLED', reason: '食材用完' }))
    expect(cancelled).toMatchObject({ status: 'CANCELLED', cancelReason: '食材用完' })
  })

  it('終點狀態(已完成、已取消、店家拒絕)不能再改', async () => {
    const done = await placeOrder({ customerPhone: phone(1) })
    await advance(done.id, ['accept', 'preparing', 'ready', 'pay', 'complete'])
    expectError(await admin('POST', `/orders/${done.id}/status`, { status: 'CANCELLED', reason: 'x' }), 409, 'INVALID_TRANSITION')

    const rejected = await placeOrder({ customerPhone: phone(2) })
    await admin('POST', `/orders/${rejected.id}/reject`, { reason: 'x' })
    expectError(await admin('POST', `/orders/${rejected.id}/accept`), 409, 'INVALID_TRANSITION')
  })

  it('兩個人同時按「接單」:只會有一個成功,另一個得到衝突(不會重複處理)', async () => {
    const { id } = await placeOrder()
    const managerCookie = await loginCookie(ctx.app, 'manager@test.local')
    const [a, b] = await Promise.all([
      admin('POST', `/orders/${id}/accept`),
      admin('POST', `/orders/${id}/accept`, undefined, managerCookie),
    ])
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 409])
    const row = await prisma.order.findUniqueOrThrow({ where: { id } })
    expect(row.status).toBe('ACCEPTED')
  })
})

describe('後台:現金收款', () => {
  it('待接單的訂單還不能收款:409 PAYMENT_NOT_ALLOWED', async () => {
    const { id } = await placeOrder()
    expectError(await admin('POST', `/orders/${id}/payments/cash-confirm`), 409, 'PAYMENT_NOT_ALLOWED')
  })

  it('已接單、製作中、可取餐都可以收款;重複收款被拒絕 ALREADY_PAID', async () => {
    for (const steps of [['accept'], ['accept', 'preparing'], ['accept', 'preparing', 'ready']] as const) {
      await resetDatabase()
      fx = await createFixture()
      ctx = await createTestApp()
      staffCookie = await loginCookie(ctx.app, 'staff@test.local')
      const { id } = await placeOrder()
      await advance(id, [...steps])
      expect((await admin('POST', `/orders/${id}/payments/cash-confirm`)).statusCode).toBe(200)
      expectError(await admin('POST', `/orders/${id}/payments/cash-confirm`), 409, 'ALREADY_PAID')
    }
  })

  it('同時按兩次「已收現金」,只會成功一次', async () => {
    const { id } = await placeOrder()
    await advance(id, ['accept'])
    const [a, b] = await Promise.all([admin('POST', `/orders/${id}/payments/cash-confirm`), admin('POST', `/orders/${id}/payments/cash-confirm`)])
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 409])
    expect(await prisma.payment.count({ where: { status: 'SUCCEEDED' } })).toBe(1)
  })

  it('已經收了現金的訂單被取消:付款自動標成「已退款」', async () => {
    const { id } = await placeOrder()
    await advance(id, ['accept', 'preparing', 'ready', 'pay'])
    const cancelled = json(await admin('POST', `/orders/${id}/status`, { status: 'CANCELLED', reason: '顧客反悔' }))
    expect(cancelled).toMatchObject({ status: 'CANCELLED', paymentStatus: 'REFUNDED' })
  })

  it('已取消 / 已拒絕 / 已完成的訂單不能再收款', async () => {
    const { id } = await placeOrder()
    await admin('POST', `/orders/${id}/reject`, { reason: 'x' })
    expectError(await admin('POST', `/orders/${id}/payments/cash-confirm`), 409, 'PAYMENT_NOT_ALLOWED')
  })
})

describe('稽核日誌', () => {
  it('接單、收現金、取消都會留下紀錄(誰、何時、什麼)', async () => {
    const { id } = await placeOrder()
    await advance(id, ['accept', 'pay'])
    await admin('POST', `/orders/${id}/status`, { status: 'CANCELLED', reason: '測試' })

    const logs = await prisma.auditLog.findMany({ where: { entity: 'Order', entityId: id }, orderBy: { createdAt: 'asc' } })
    expect(logs.map((log) => log.action)).toEqual(['order.accepted', 'payment.cash_confirm', 'order.cancelled'])
    expect(logs.every((log) => log.actorId === fx.staff.staff.id && log.storeId === fx.store.id)).toBe(true)
    expect(logs[2].meta).toMatchObject({ from: 'ACCEPTED', to: 'CANCELLED', reason: '測試' })
  })

  it('顧客自己取消不寫員工稽核(沒有操作員工)', async () => {
    const { token } = await placeOrder()
    await ctx.app.inject({ method: 'POST', url: `/api/orders/${token}/cancel`, payload: {} })
    expect(await prisma.auditLog.count({ where: { entity: 'Order' } })).toBe(0)
  })
})

describe('不需要內容的操作(前端常會宣告 JSON 卻不送內容)', () => {
  const emptyJson = { 'content-type': 'application/json' }

  it('接單、收現金、顧客取消:內容是空的也能正常運作', async () => {
    const { id, token } = await placeOrder({ customerPhone: phone(1) })
    const accept = await ctx.app.inject({ method: 'POST', url: `/api/admin/orders/${id}/accept`, headers: { cookie: staffCookie, ...emptyJson } })
    expect(accept.statusCode, accept.body).toBe(200)
    const pay = await ctx.app.inject({ method: 'POST', url: `/api/admin/orders/${id}/payments/cash-confirm`, headers: { cookie: staffCookie, ...emptyJson } })
    expect(pay.statusCode, pay.body).toBe(200)

    const other = await placeOrder({ customerPhone: phone(2) })
    const cancel = await ctx.app.inject({ method: 'POST', url: `/api/orders/${other.token}/cancel`, headers: emptyJson })
    expect(cancel.statusCode, cancel.body).toBe(200)
    expect(json(cancel).status).toBe('CANCELLED')
    expect(token).toBeTruthy()
  })

  it('需要內容的操作(例如拒單)送空內容:400,不會當成成功', async () => {
    const { id } = await placeOrder()
    const response = await ctx.app.inject({ method: 'POST', url: `/api/admin/orders/${id}/reject`, headers: { cookie: staffCookie, ...emptyJson } })
    expect(response.statusCode).toBe(400)
    expect((await prisma.order.findUniqueOrThrow({ where: { id } })).status).toBe('PENDING')
  })

  it('格式錯誤的 JSON:400(不會造成 500)', async () => {
    const response = await ctx.app.inject({ method: 'POST', url: '/api/orders', headers: emptyJson, payload: '{not json' })
    expect(response.statusCode).toBe(400)
  })

  it('偷塞 __proto__ 想污染物件原型:被擋下,不會成功', async () => {
    const response = await ctx.app.inject({ method: 'POST', url: '/api/orders', headers: emptyJson, payload: '{"__proto__":{"admin":true},"customerName":"x"}' })
    expect(response.statusCode).toBe(400)
  })
})
