import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '../src/db.js'
import { MAX_LINE_QUANTITY, MAX_ORDER_LINES } from '../src/lib/limits.js'
import { at, createFixture, createTestApp, json, phone, postOrder, resetDatabase, simpleOrder, type Fixture } from './helpers.js'

let fx: Fixture
let ctx: Awaited<ReturnType<typeof createTestApp>>
const order = (overrides: Record<string, unknown> = {}) => simpleOrder(fx, overrides)

beforeEach(async () => {
  await resetDatabase()
  fx = await createFixture()
  ctx = await createTestApp()
})
afterAll(async () => {
  await ctx?.app.close()
  await prisma.$disconnect()
})

const expectError = (response: { statusCode: number; body: string }, status: number, code: string) => {
  expect(response.statusCode, response.body).toBe(status)
  expect(json(response).error.code).toBe(code)
}

describe('下單:價格由後端計算', () => {
  it('蛋餅(30)選起司(+10)加蛋(+10)× 2 = 100;豆漿(20)選大杯(+10)= 30;總額 130', async () => {
    const response = await postOrder(ctx.app, {
      customerName: '王小明',
      customerPhone: phone(1),
      items: [
        { menuItemId: fx.items.egg.id, quantity: 2, optionIds: [fx.opt.起司, fx.opt.加蛋] },
        { menuItemId: fx.items.soy.id, quantity: 1, optionIds: [fx.opt.熱, fx.opt.大] },
      ],
    })
    expect(response.statusCode, response.body).toBe(201)
    const { order: created, duplicate } = json(response)
    expect(duplicate).toBe(false)
    expect(created.items[0]).toMatchObject({ name: '蛋餅', unitPrice: 30, quantity: 2, lineTotal: 100 })
    expect(created.items[1]).toMatchObject({ name: '豆漿', unitPrice: 20, quantity: 1, lineTotal: 30 })
    expect(created.subtotal).toBe(130)
    expect(created.discount).toBe(0)
    expect(created.total).toBe(130)
  })

  it('就算前端偷偷傳了價格(例如把價格改成 1 元),也會被忽略,依資料庫價格計算', async () => {
    const response = await postOrder(ctx.app, {
      customerName: '想占便宜',
      customerPhone: phone(1),
      price: 1,
      total: 1,
      items: [{ menuItemId: fx.items.egg.id, quantity: 1, optionIds: [fx.opt.原味], price: 1, unitPrice: 1, lineTotal: 1 }],
    })
    expect(response.statusCode, response.body).toBe(201)
    expect(json(response).order).toMatchObject({ subtotal: 30, total: 30 })
  })

  it('明細存「下單當下」的名稱與價格(快照);之後改菜單價格,舊訂單不變', async () => {
    const created = json(await postOrder(ctx.app, order({ items: [{ menuItemId: fx.items.egg.id, quantity: 1, optionIds: [fx.opt.鮪魚] }] }))).order
    await prisma.menuItem.update({ where: { id: fx.items.egg.id }, data: { price: 99, name: '豪華蛋餅' } })
    await prisma.option.update({ where: { id: fx.opt.鮪魚 }, data: { priceDelta: 50 } })

    const fetched = json(await ctx.app.inject({ method: 'GET', url: `/api/orders/${created.trackingToken}` }))
    expect(fetched.items[0]).toMatchObject({ name: '蛋餅', unitPrice: 30, lineTotal: 45 })
    expect(fetched.items[0].options).toEqual([{ group: '蛋餅口味', name: '鮪魚', priceDelta: 15 }])
    expect(fetched.total).toBe(45)
  })

  it('同一道餐點可以分成多列(不同選項)', async () => {
    const response = await postOrder(
      ctx.app,
      order({
        items: [
          { menuItemId: fx.items.egg.id, quantity: 1, optionIds: [fx.opt.原味] },
          { menuItemId: fx.items.egg.id, quantity: 1, optionIds: [fx.opt.起司] },
        ],
      }),
    )
    expect(json(response).order.total).toBe(70) // 30 + 40
  })

  it('明細的順序和顧客點的順序一致', async () => {
    const response = await postOrder(
      ctx.app,
      order({
        items: [
          { menuItemId: fx.items.friedEgg.id, quantity: 1 },
          { menuItemId: fx.items.soy.id, quantity: 1, optionIds: [fx.opt.冷, fx.opt.小] },
          { menuItemId: fx.items.egg.id, quantity: 1, optionIds: [fx.opt.原味] },
        ],
      }),
    )
    expect(json(response).order.items.map((item: { name: string }) => item.name)).toEqual(['荷包蛋', '豆漿', '蛋餅'])
  })
})

describe('下單:建立出來的訂單', () => {
  it('外帶、待接單、現金待收款、不需要發票', async () => {
    const response = await postOrder(ctx.app, order({ note: '不要塑膠袋' }))
    expect(response.statusCode).toBe(201)
    const created = json(response).order
    expect(created).toMatchObject({
      status: 'PENDING',
      fulfillmentType: 'TAKEOUT',
      paymentMethod: 'CASH',
      paymentStatus: 'PENDING',
      note: '不要塑膠袋',
      cancelReason: null,
    })
    const dbOrder = await prisma.order.findFirstOrThrow({ include: { payments: true, invoice: true } })
    expect(dbOrder.storeId).toBe(fx.store.id)
    expect(dbOrder.customerId).toBeNull() // 訪客下單
    expect(dbOrder.payments).toHaveLength(1)
    expect(dbOrder.payments[0]).toMatchObject({ provider: 'cash', method: 'CASH', status: 'PENDING', amount: 15 })
    expect(dbOrder.invoice).toMatchObject({ status: 'NOT_REQUIRED', provider: 'none' })
  })

  it('用餐方式一律是外帶:就算前端硬傳內用/外送也沒用', async () => {
    const response = await postOrder(ctx.app, order({ fulfillmentType: 'DELIVERY', tableNumber: '5', deliveryAddress: '某某路 1 號' }))
    expect(response.statusCode).toBe(201)
    const dbOrder = await prisma.order.findFirstOrThrow()
    expect(dbOrder.fulfillmentType).toBe('TAKEOUT')
    expect(dbOrder.tableNumber).toBeNull()
    expect(dbOrder.deliveryAddress).toBeNull()
  })

  it('追蹤碼是 32 字元的隨機字串,每張都不一樣', async () => {
    const a = json(await postOrder(ctx.app, order({ customerPhone: phone(1) }))).order.trackingToken as string
    const b = json(await postOrder(ctx.app, order({ customerPhone: phone(2) }))).order.trackingToken as string
    expect(a).toMatch(/^[A-Za-z0-9_-]{32}$/)
    expect(b).toMatch(/^[A-Za-z0-9_-]{32}$/)
    expect(a).not.toBe(b)
  })

  it('訂單編號當天從 A001 開始遞增', async () => {
    const numbers: string[] = []
    for (let i = 1; i <= 3; i += 1) {
      numbers.push(json(await postOrder(ctx.app, order({ customerPhone: phone(i) }))).order.orderNumber)
    }
    expect(numbers).toEqual(['A001', 'A002', 'A003'])
  })

  it('隔天的訂單編號重新從 A001 開始', async () => {
    await postOrder(ctx.app, order())
    ctx.clock.current = new Date(ctx.clock.current.getTime() + 24 * 60 * 60_000)
    const next = await postOrder(ctx.app, order())
    expect(json(next).order.orderNumber).toBe('A001')
  })

  it('同時下很多單,訂單編號也不會重複', async () => {
    const responses = await Promise.all(
      Array.from({ length: 6 }, (_, i) => postOrder(ctx.app, order({ customerPhone: phone(100 + i) }))),
    )
    expect(responses.every((r) => r.statusCode === 201)).toBe(true)
    const numbers = responses.map((r) => json(r).order.orderNumber)
    expect(new Set(numbers).size).toBe(6)
  })

  it('預計取餐時間:沒填 = 現在 + 備餐 10 分鐘', async () => {
    const created = json(await postOrder(ctx.app, order())).order
    expect(new Date(created.pickupAt).toISOString()).toBe(at('09:10').toISOString())
  })

  it('回應裡的電話是遮罩過的', async () => {
    const created = json(await postOrder(ctx.app, order({ customerPhone: '0912345678' }))).order
    expect(created.customerPhone).toBe('0912***678')
    // 但資料庫存完整電話,店員看得到
    expect((await prisma.order.findFirstOrThrow()).customerPhone).toBe('0912345678')
  })
})

describe('下單:防重複(Idempotency-Key)', () => {
  const key = 'abcdefghijklmnop-12345'

  it('同一把鍵送兩次,只會建立一張訂單,第二次回傳同一張', async () => {
    const first = await postOrder(ctx.app, order(), { 'idempotency-key': key })
    const second = await postOrder(ctx.app, order(), { 'idempotency-key': key })
    expect(first.statusCode).toBe(201)
    expect(second.statusCode).toBe(200)
    expect(json(second).duplicate).toBe(true)
    expect(json(second).order.trackingToken).toBe(json(first).order.trackingToken)
    expect(await prisma.order.count()).toBe(1)
  })

  it('同時送出同一把鍵,也只會有一張訂單', async () => {
    const responses = await Promise.all([1, 2, 3].map(() => postOrder(ctx.app, order(), { 'idempotency-key': key })))
    expect(responses.every((r) => [200, 201].includes(r.statusCode))).toBe(true)
    expect(await prisma.order.count()).toBe(1)
    expect(new Set(responses.map((r) => json(r).order.trackingToken)).size).toBe(1)
  })

  it('不同的鍵會建立不同的訂單;鍵太短會被拒絕', async () => {
    await postOrder(ctx.app, order(), { 'idempotency-key': key })
    await postOrder(ctx.app, order(), { 'idempotency-key': `${key}-2` })
    expect(await prisma.order.count()).toBe(2)
    expectError(await postOrder(ctx.app, order(), { 'idempotency-key': 'short' }), 400, 'VALIDATION_ERROR')
  })
})

describe('下單:餐點與選項的檢查', () => {
  it('今日售完的餐點:409 ITEM_SOLD_OUT,訊息有品名', async () => {
    const response = await postOrder(ctx.app, order({ items: [{ menuItemId: fx.items.soldOut.id, quantity: 1 }] }))
    expectError(response, 409, 'ITEM_SOLD_OUT')
    expect(json(response).error.message).toContain('燒餅油條')
  })

  it('已下架的餐點、不存在的餐點:400 ITEM_NOT_FOUND', async () => {
    expectError(await postOrder(ctx.app, order({ items: [{ menuItemId: fx.items.inactive.id, quantity: 1 }] })), 400, 'ITEM_NOT_FOUND')
    expectError(
      await postOrder(ctx.app, order({ items: [{ menuItemId: '019a0000-0000-7000-8000-000000000000', quantity: 1 }] })),
      400,
      'ITEM_NOT_FOUND',
    )
  })

  it('必選的選項沒選:400 OPTION_SELECTION_INVALID', async () => {
    const response = await postOrder(ctx.app, order({ items: [{ menuItemId: fx.items.egg.id, quantity: 1 }] }))
    expectError(response, 400, 'OPTION_SELECTION_INVALID')
    expect(json(response).error.message).toContain('蛋餅口味')
  })

  it('單選的群組選了兩個:400;加料最多 2 個,選 3 個:400', async () => {
    expectError(
      await postOrder(ctx.app, order({ items: [{ menuItemId: fx.items.egg.id, quantity: 1, optionIds: [fx.opt.原味, fx.opt.起司] }] })),
      400,
      'OPTION_SELECTION_INVALID',
    )
    expectError(
      await postOrder(ctx.app, order({ items: [{ menuItemId: fx.items.egg.id, quantity: 1, optionIds: [fx.opt.原味, fx.opt.加蛋, fx.opt.加起司, fx.opt.加肉鬆] }] })),
      400,
      'OPTION_SELECTION_INVALID',
    )
  })

  it('選了「不屬於這道餐點」的選項:400 OPTION_INVALID', async () => {
    const response = await postOrder(ctx.app, order({ items: [{ menuItemId: fx.items.friedEgg.id, quantity: 1, optionIds: [fx.opt.大] }] }))
    expectError(response, 400, 'OPTION_INVALID')
  })

  it('同一個選項重複選:400 OPTION_INVALID', async () => {
    const response = await postOrder(ctx.app, order({ items: [{ menuItemId: fx.items.egg.id, quantity: 1, optionIds: [fx.opt.原味, fx.opt.原味] }] }))
    expectError(response, 400, 'OPTION_INVALID')
  })

  it('今日不供應的選項:409 OPTION_SOLD_OUT', async () => {
    const response = await postOrder(ctx.app, order({ items: [{ menuItemId: fx.items.egg.id, quantity: 1, optionIds: [fx.opt.原味, fx.opt.加培根] }] }))
    expectError(response, 409, 'OPTION_SOLD_OUT')
  })

  it('不能用別家店的餐點下單', async () => {
    const other = await prisma.store.create({ data: { slug: 'other', name: '別家店' } })
    const category = await prisma.menuCategory.create({ data: { storeId: other.id, name: '別家分類' } })
    const foreign = await prisma.menuItem.create({ data: { storeId: other.id, categoryId: category.id, name: '別家餐點', price: 1 } })
    expectError(await postOrder(ctx.app, order({ items: [{ menuItemId: foreign.id, quantity: 1 }] })), 400, 'ITEM_NOT_FOUND')
  })
})

describe('下單:輸入驗證與上限', () => {
  it('姓名、電話格式不對:400 VALIDATION_ERROR', async () => {
    expectError(await postOrder(ctx.app, order({ customerName: '   ' })), 400, 'VALIDATION_ERROR')
    for (const bad of ['12345', '0212345678', '09123456789', '0912-345-678', 'abcdefghij']) {
      const response = await postOrder(ctx.app, order({ customerPhone: bad }))
      expectError(response, 400, 'VALIDATION_ERROR')
    }
    expect(json(await postOrder(ctx.app, order({ customerPhone: 'x' }))).error.message).toContain('手機號碼')
  })

  it('沒有任何餐點、數量不合理:400', async () => {
    expectError(await postOrder(ctx.app, order({ items: [] })), 400, 'VALIDATION_ERROR')
    for (const quantity of [0, -1, 1.5, MAX_LINE_QUANTITY + 1]) {
      expectError(await postOrder(ctx.app, order({ items: [{ menuItemId: fx.items.friedEgg.id, quantity }] })), 400, 'VALIDATION_ERROR')
    }
  })

  it(`品項太多(超過 ${MAX_ORDER_LINES} 列):400`, async () => {
    const items = Array.from({ length: MAX_ORDER_LINES + 1 }, () => ({ menuItemId: fx.items.friedEgg.id, quantity: 1 }))
    expectError(await postOrder(ctx.app, order({ items })), 400, 'VALIDATION_ERROR')
  })

  it('金額超過單筆上限:400 ORDER_TOO_LARGE', async () => {
    await prisma.menuItem.update({ where: { id: fx.items.friedEgg.id }, data: { price: 5000 } })
    const response = await postOrder(ctx.app, order({ items: [{ menuItemId: fx.items.friedEgg.id, quantity: 5 }] }))
    expectError(response, 400, 'ORDER_TOO_LARGE')
  })

  it('備註太長:400', async () => {
    expectError(await postOrder(ctx.app, order({ note: 'x'.repeat(201) })), 400, 'VALIDATION_ERROR')
  })

  it('同一支電話同時有 3 張「待接單」,第 4 張被擋(防灌單),換支電話就可以', async () => {
    for (let i = 0; i < 3; i += 1) expect((await postOrder(ctx.app, order())).statusCode).toBe(201)
    expectError(await postOrder(ctx.app, order()), 429, 'TOO_MANY_PENDING_ORDERS')
    expect((await postOrder(ctx.app, order({ customerPhone: phone(2) }))).statusCode).toBe(201)
  })
})

describe('下單:營業時間與取餐時間', () => {
  it('店家暫停接單:409 ORDERS_PAUSED', async () => {
    await prisma.store.update({ where: { id: fx.store.id }, data: { acceptingOrders: false } })
    expectError(await postOrder(ctx.app, order()), 409, 'ORDERS_PAUSED')
  })

  it('不在營業時間內:409 STORE_CLOSED(05:59 與 13:00 都不行)', async () => {
    ctx.clock.current = at('05:59')
    expectError(await postOrder(ctx.app, order()), 409, 'STORE_CLOSED')
    ctx.clock.current = at('13:00')
    expectError(await postOrder(ctx.app, order()), 409, 'STORE_CLOSED')
    ctx.clock.current = at('06:00')
    expect((await postOrder(ctx.app, order())).statusCode).toBe(201)
  })

  it('太接近打烊:最後下單時間 = 打烊 − 備餐時間(12:50 之後不能下單)', async () => {
    ctx.clock.current = at('12:50')
    expect((await postOrder(ctx.app, order())).statusCode).toBe(201)
    ctx.clock.current = at('12:55')
    expectError(await postOrder(ctx.app, order({ customerPhone: phone(2) })), 409, 'TOO_LATE_TO_ORDER')
  })

  it('指定取餐時間:太早(早於 現在+備餐)400;太晚(晚於打烊)400;合理的可以', async () => {
    const iso = (hhmm: string) => at(hhmm).toISOString()
    expectError(await postOrder(ctx.app, order({ pickupAt: iso('09:05') })), 400, 'PICKUP_TIME_INVALID')
    expectError(await postOrder(ctx.app, order({ pickupAt: iso('13:01') })), 400, 'PICKUP_TIME_INVALID')
    expectError(await postOrder(ctx.app, order({ pickupAt: '2026-10-19T00:00:00Z' })), 400, 'PICKUP_TIME_INVALID')

    const ok = await postOrder(ctx.app, order({ pickupAt: iso('10:30') }))
    expect(ok.statusCode).toBe(201)
    expect(new Date(json(ok).order.pickupAt).toISOString()).toBe(at('10:30').toISOString())

    const exact = await postOrder(ctx.app, order({ customerPhone: phone(2), pickupAt: iso('09:10') }))
    expect(exact.statusCode).toBe(201)
  })

  it('取餐時間格式不對:400', async () => {
    expectError(await postOrder(ctx.app, order({ pickupAt: 'tomorrow' })), 400, 'VALIDATION_ERROR')
  })
})
