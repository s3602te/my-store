import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '../src/db.js'
import { createFixture, createTestApp, json, loginCookie, postOrder, resetDatabase, simpleOrder, type Fixture } from './helpers.js'

let fx: Fixture
let ctx: Awaited<ReturnType<typeof createTestApp>>
let staffCookie: string
let managerCookie: string

beforeEach(async () => {
  await resetDatabase()
  fx = await createFixture()
  ctx = await createTestApp()
  staffCookie = await loginCookie(ctx.app, 'staff@test.local')
  managerCookie = await loginCookie(ctx.app, 'manager@test.local')
})
afterAll(async () => {
  await ctx?.app.close()
  await prisma.$disconnect()
})

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE'
const call = (method: Method, url: string, cookie: string | undefined, payload?: object) =>
  ctx.app.inject({ method, url: `/api/admin/menu${url}`, payload, headers: cookie ? { cookie } : {} })
const asStaff = (method: Method, url: string, payload?: object) => call(method, url, staffCookie, payload)
const asManager = (method: Method, url: string, payload?: object) => call(method, url, managerCookie, payload)

const expectError = (response: { statusCode: number; body: string }, status: number, code: string) => {
  expect(response.statusCode, response.body).toBe(status)
  expect(json(response).error.code).toBe(code)
}

describe('權限:店員能看、能設定售完;新增修改刪除要店長以上', () => {
  it('沒登入:全部 401', async () => {
    for (const [method, url] of [['GET', '/items'], ['GET', '/categories'], ['GET', '/option-groups'], ['POST', '/items']] as const) {
      expect((await call(method, url, undefined, {})).statusCode).toBe(401)
    }
  })

  it('店員可以看分類、餐點(含下架與售完的)、選項群組', async () => {
    const items = json(await asStaff('GET', '/items'))
    expect(items.map((i: { name: string }) => i.name)).toEqual(['蛋餅', '豆漿', '荷包蛋', '燒餅油條', '地瓜粥'])
    expect(items.find((i: { name: string }) => i.name === '地瓜粥').isActive).toBe(false)
    expect((await asStaff('GET', '/categories')).statusCode).toBe(200)
    const groups = json(await asStaff('GET', '/option-groups'))
    expect(groups.find((g: { name: string }) => g.name === '蛋餅口味').options).toHaveLength(3)
  })

  it('店員不能新增、修改、刪除:403', async () => {
    const category = { name: '新分類' }
    expectError(await asStaff('POST', '/categories', category), 403, 'FORBIDDEN')
    expectError(await asStaff('PATCH', `/items/${fx.items.egg.id}`, { price: 1 }), 403, 'FORBIDDEN')
    expectError(await asStaff('DELETE', `/items/${fx.items.egg.id}`), 403, 'FORBIDDEN')
    expectError(await asStaff('POST', '/option-groups', { name: 'x' }), 403, 'FORBIDDEN')
    expectError(await asStaff('PATCH', `/options/${fx.opt.起司}`, { priceDelta: 1 }), 403, 'FORBIDDEN')
    expect((await prisma.menuItem.findUniqueOrThrow({ where: { id: fx.items.egg.id } })).price).toBe(30)
  })

  it('店員可以設定「今日售完 / 恢復供應」(餐點與選項)', async () => {
    const soldOut = json(await asStaff('POST', `/items/${fx.items.egg.id}/availability`, { isAvailable: false }))
    expect(soldOut.isAvailable).toBe(false)
    const option = json(await asStaff('POST', `/options/${fx.opt.起司}/availability`, { isAvailable: false }))
    expect(option.isAvailable).toBe(false)
    expect(json(await asStaff('POST', `/items/${fx.items.egg.id}/availability`, { isAvailable: true })).isAvailable).toBe(true)
  })
})

describe('售完與下架會立刻影響顧客端', () => {
  it('店員按「售完」後,顧客再點這道餐點下單會被擋下', async () => {
    const before = await postOrder(ctx.app, simpleOrder(fx, { items: [{ menuItemId: fx.items.friedEgg.id, quantity: 1 }] }))
    expect(before.statusCode).toBe(201)

    await asStaff('POST', `/items/${fx.items.friedEgg.id}/availability`, { isAvailable: false })
    const after = await postOrder(ctx.app, simpleOrder(fx, { customerPhone: '0900000002' }))
    expectError(after, 409, 'ITEM_SOLD_OUT')

    const menu = json(await ctx.app.inject({ method: 'GET', url: '/api/menu' }))
    const item = menu.categories.flatMap((c: { items: unknown[] }) => c.items).find((i: { name: string }) => i.name === '荷包蛋')
    expect(item.isAvailable).toBe(false) // 菜單仍會顯示,但標示售完
  })

  it('下架的餐點、分類不會出現在顧客菜單', async () => {
    const menu = json(await ctx.app.inject({ method: 'GET', url: '/api/menu' }))
    const names = menu.categories.flatMap((c: { items: Array<{ name: string }> }) => c.items.map((i) => i.name))
    expect(names).not.toContain('地瓜粥')
    expect(names).toContain('燒餅油條') // 售完的仍顯示

    await asManager('PATCH', `/categories/${fx.categories.drinks.id}`, { isActive: false })
    const after = json(await ctx.app.inject({ method: 'GET', url: '/api/menu' }))
    expect(after.categories.map((c: { name: string }) => c.name)).toEqual(['主餐'])
  })
})

describe('分類', () => {
  it('新增(有預設值)、修改、列出(含餐點數量)', async () => {
    const created = await asManager('POST', '/categories', { name: '點心' })
    expect(created.statusCode).toBe(201)
    expect(json(created)).toMatchObject({ name: '點心', sortOrder: 0, isActive: true, itemCount: 0 })

    const id = json(created).id
    const updated = json(await asManager('PATCH', `/categories/${id}`, { sortOrder: 5 }))
    expect(updated).toMatchObject({ name: '點心', sortOrder: 5, isActive: true })

    const list = json(await asManager('GET', '/categories'))
    expect(list.find((c: { name: string }) => c.name === '主餐').itemCount).toBe(4)
  })

  it('名稱重複:409 DUPLICATE_NAME', async () => {
    expectError(await asManager('POST', '/categories', { name: '主餐' }), 409, 'DUPLICATE_NAME')
  })

  it('分類底下還有餐點不能刪(409);空的可以刪', async () => {
    expectError(await asManager('DELETE', `/categories/${fx.categories.main.id}`), 409, 'CATEGORY_NOT_EMPTY')
    const empty = json(await asManager('POST', '/categories', { name: '空的' }))
    expect((await asManager('DELETE', `/categories/${empty.id}`)).statusCode).toBe(200)
  })

  it('輸入驗證:名稱不能空白、排序必須是整數', async () => {
    expectError(await asManager('POST', '/categories', { name: '   ' }), 400, 'VALIDATION_ERROR')
    expectError(await asManager('POST', '/categories', { name: 'x', sortOrder: 1.5 }), 400, 'VALIDATION_ERROR')
    expectError(await asManager('PATCH', `/categories/${fx.categories.main.id}`, {}), 400, 'VALIDATION_ERROR')
  })
})

describe('餐點', () => {
  const newItem = (overrides: Record<string, unknown> = {}) => ({ categoryId: fx.categories.main.id, name: '鐵板麵', price: 55, ...overrides })

  it('新增餐點(含選項群組順序),新餐點立刻出現在顧客菜單', async () => {
    const response = await asManager('POST', '/items', newItem({ optionGroupIds: [fx.groups.extras.id, fx.groups.size.id], description: '好吃' }))
    expect(response.statusCode, response.body).toBe(201)
    expect(json(response)).toMatchObject({
      name: '鐵板麵', price: 55, description: '好吃', isAvailable: true, isActive: true, categoryName: '主餐',
      optionGroupIds: [fx.groups.extras.id, fx.groups.size.id],
    })
    const menu = json(await ctx.app.inject({ method: 'GET', url: '/api/menu' }))
    const item = menu.categories.flatMap((c: { items: unknown[] }) => c.items).find((i: { name: string }) => i.name === '鐵板麵')
    expect(item.optionGroups.map((g: { name: string }) => g.name)).toEqual(['加料', '大小'])
  })

  it('PATCH 只更新有傳的欄位,沒傳的欄位絕對不會被預設值蓋掉', async () => {
    await asManager('PATCH', `/items/${fx.items.egg.id}`, { description: '招牌蛋餅', sortOrder: 7, isActive: true })
    const updated = json(await asManager('PATCH', `/items/${fx.items.egg.id}`, { price: 35 }))
    expect(updated).toMatchObject({ name: '蛋餅', price: 35, description: '招牌蛋餅', sortOrder: 7, isActive: true, isAvailable: true })
    expect(updated.optionGroupIds).toHaveLength(2) // 選項群組也沒被動到
  })

  it('改價格:新訂單用新價格,但歷史訂單不變', async () => {
    const old = json(await postOrder(ctx.app, simpleOrder(fx, { items: [{ menuItemId: fx.items.egg.id, quantity: 1, optionIds: [fx.opt.原味] }] })))
    await asManager('PATCH', `/items/${fx.items.egg.id}`, { price: 50 })
    const next = json(await postOrder(ctx.app, simpleOrder(fx, { customerPhone: '0900000002', items: [{ menuItemId: fx.items.egg.id, quantity: 1, optionIds: [fx.opt.原味] }] })))
    expect(next.order.total).toBe(50)
    const tracked = json(await ctx.app.inject({ method: 'GET', url: `/api/orders/${old.order.trackingToken}` }))
    expect(tracked.total).toBe(30)
  })

  it('用 optionGroupIds 整組取代選項群組', async () => {
    const updated = json(await asManager('PATCH', `/items/${fx.items.egg.id}`, { optionGroupIds: [fx.groups.size.id] }))
    expect(updated.optionGroupIds).toEqual([fx.groups.size.id])
    expect(await prisma.menuItemOptionGroup.count({ where: { menuItemId: fx.items.egg.id } })).toBe(1)
  })

  it('輸入驗證:價格不能是負數或小數、圖片網址要 http(s)、分類必須存在', async () => {
    expectError(await asManager('POST', '/items', newItem({ price: -1 })), 400, 'VALIDATION_ERROR')
    expectError(await asManager('POST', '/items', newItem({ price: 10.5 })), 400, 'VALIDATION_ERROR')
    expectError(await asManager('POST', '/items', newItem({ imageUrl: 'javascript:alert(1)' })), 400, 'VALIDATION_ERROR')
    expectError(await asManager('POST', '/items', newItem({ imageUrl: 'not a url' })), 400, 'VALIDATION_ERROR')
    expect((await asManager('POST', '/items', newItem({ imageUrl: 'https://example.com/a.jpg' }))).statusCode).toBe(201)
    expectError(await asManager('POST', '/items', newItem({ name: '別的', categoryId: '019a0000-0000-7000-8000-000000000000' })), 404, 'CATEGORY_NOT_FOUND')
  })

  it('名稱重複:409;選項群組不存在:404', async () => {
    expectError(await asManager('POST', '/items', newItem({ name: '蛋餅' })), 409, 'DUPLICATE_NAME')
    expectError(await asManager('POST', '/items', newItem({ optionGroupIds: ['019a0000-0000-7000-8000-000000000000'] })), 404, 'OPTION_GROUP_NOT_FOUND')
  })

  it('刪除餐點之後,歷史訂單仍然完整(靠快照)', async () => {
    const placed = json(await postOrder(ctx.app, simpleOrder(fx, { items: [{ menuItemId: fx.items.friedEgg.id, quantity: 2 }] })))
    expect((await asManager('DELETE', `/items/${fx.items.friedEgg.id}`)).statusCode).toBe(200)
    expectError(await asManager('GET', `/items`).then(() => asManager('PATCH', `/items/${fx.items.friedEgg.id}`, { price: 1 })), 404, 'ITEM_NOT_FOUND')

    const tracked = json(await ctx.app.inject({ method: 'GET', url: `/api/orders/${placed.order.trackingToken}` }))
    expect(tracked.items[0]).toMatchObject({ name: '荷包蛋', unitPrice: 15, quantity: 2, lineTotal: 30 })
  })

  it('不能動別家店的餐點、分類、群組、選項:一律 404(防止用別人的 ID 亂改)', async () => {
    const other = await prisma.store.create({ data: { slug: 'other', name: '別家' } })
    const category = await prisma.menuCategory.create({ data: { storeId: other.id, name: '別家分類' } })
    const item = await prisma.menuItem.create({ data: { storeId: other.id, categoryId: category.id, name: '別家餐點', price: 10 } })
    const group = await prisma.optionGroup.create({ data: { storeId: other.id, name: '別家群組', options: { create: [{ name: '別家選項' }] } }, include: { options: true } })

    expectError(await asManager('PATCH', `/items/${item.id}`, { price: 1 }), 404, 'ITEM_NOT_FOUND')
    expectError(await asManager('DELETE', `/items/${item.id}`), 404, 'ITEM_NOT_FOUND')
    expectError(await asManager('POST', `/items/${item.id}/availability`, { isAvailable: false }), 404, 'ITEM_NOT_FOUND')
    expectError(await asManager('PATCH', `/categories/${category.id}`, { name: 'x' }), 404, 'CATEGORY_NOT_FOUND')
    expectError(await asManager('DELETE', `/option-groups/${group.id}`), 404, 'OPTION_GROUP_NOT_FOUND')
    expectError(await asManager('PATCH', `/options/${group.options[0].id}`, { priceDelta: 5 }), 404, 'OPTION_NOT_FOUND')
    // 把別家的分類/群組掛到自己的餐點上也不行
    expectError(await asManager('POST', '/items', newItem({ name: '偷掛', categoryId: category.id })), 404, 'CATEGORY_NOT_FOUND')
    expectError(await asManager('POST', '/items', newItem({ name: '偷掛2', optionGroupIds: [group.id] })), 404, 'OPTION_GROUP_NOT_FOUND')
    expect((await prisma.menuItem.findUniqueOrThrow({ where: { id: item.id } })).price).toBe(10)
  })
})

describe('選項群組與選項', () => {
  it('新增群組時可以一併建立選項', async () => {
    const response = await asManager('POST', '/option-groups', {
      name: '辣度', minSelect: 0, maxSelect: 1,
      options: [{ name: '小辣' }, { name: '大辣', priceDelta: 5 }],
    })
    expect(response.statusCode, response.body).toBe(201)
    expect(json(response).options.map((o: { name: string; priceDelta: number }) => [o.name, o.priceDelta])).toEqual([['小辣', 0], ['大辣', 5]])
  })

  it('「最多選幾個」不能小於「最少選幾個」', async () => {
    expectError(await asManager('POST', '/option-groups', { name: 'x', minSelect: 3, maxSelect: 1 }), 400, 'VALIDATION_ERROR')
    expectError(await asManager('PATCH', `/option-groups/${fx.groups.extras.id}`, { minSelect: 5 }), 409, 'INVALID_SELECT_RANGE')
  })

  it('改群組、新增/修改/刪除選項;改了之後新訂單立刻生效', async () => {
    const added = await asManager('POST', `/option-groups/${fx.groups.size.id}/options`, { name: '特大', priceDelta: 20 })
    expect(added.statusCode).toBe(201)
    const optionId = json(added).id

    const response = await postOrder(ctx.app, simpleOrder(fx, { items: [{ menuItemId: fx.items.soy.id, quantity: 1, optionIds: [fx.opt.熱, optionId] }] }))
    expect(json(response).order.total).toBe(40) // 20 + 特大 20

    expect(json(await asManager('PATCH', `/options/${optionId}`, { priceDelta: 25 })).priceDelta).toBe(25)
    expect((await asManager('DELETE', `/options/${optionId}`)).statusCode).toBe(200)
    expectError(await asManager('POST', `/option-groups/${fx.groups.size.id}/options`, { name: '大' }), 409, 'DUPLICATE_NAME')
  })

  it('加價不能是負數', async () => {
    expectError(await asManager('POST', `/option-groups/${fx.groups.size.id}/options`, { name: '折扣', priceDelta: -5 }), 400, 'VALIDATION_ERROR')
  })

  it('刪除群組:餐點與群組的關聯一併移除,餐點本身還在', async () => {
    expect((await asManager('DELETE', `/option-groups/${fx.groups.size.id}`)).statusCode).toBe(200)
    expect(await prisma.menuItem.count({ where: { id: fx.items.soy.id } })).toBe(1)
    expect(await prisma.menuItemOptionGroup.count({ where: { menuItemId: fx.items.soy.id } })).toBe(1) // 只剩「溫度」
  })
})

describe('稽核日誌', () => {
  it('新增、修改價格、售完、刪除都有紀錄,修改價格會記下舊價格', async () => {
    await asManager('PATCH', `/items/${fx.items.egg.id}`, { price: 40 })
    await asStaff('POST', `/items/${fx.items.egg.id}/availability`, { isAvailable: false })
    await asManager('DELETE', `/items/${fx.items.friedEgg.id}`)

    const logs = await prisma.auditLog.findMany({ where: { entity: 'MenuItem' }, orderBy: { createdAt: 'asc' } })
    expect(logs.map((l) => l.action)).toEqual(['menu.item_update', 'menu.item_sold_out', 'menu.item_delete'])
    expect(logs[0].meta).toMatchObject({ previousPrice: 30, changes: { price: 40 } })
    expect(logs[0].actorId).toBe(fx.staff.manager.id)
    expect(logs[1].actorId).toBe(fx.staff.staff.id)
  })
})
