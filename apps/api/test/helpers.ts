import { hash } from '@node-rs/argon2'
import { buildApp, type BuildAppOptions } from '../src/app.js'
import { prisma } from '../src/db.js'
import { taipeiTimeOnSameDay } from '../src/lib/time.js'
import { SESSION_COOKIE } from '../src/plugins/auth.js'
import { databaseName } from './testDb.js'

export const PASSWORD = 'Test-Passw0rd!'

/** 固定的「現在」:2026-10-20(星期二)台北時間 09:00。店家營業 06:00–13:00,所以是營業中 */
export const NOW = new Date('2026-10-20T01:00:00.000Z')
export const at = (hhmm: string, base: Date = NOW) => taipeiTimeOnSameDay(base, hhmm)

type App = Awaited<ReturnType<typeof buildApp>>

// ───────────── 資料庫 ─────────────

/** 清空整個「測試」資料庫。有安全檢查:資料庫名稱必須以 _test 結尾,否則拒絕執行 */
export async function resetDatabase() {
  const name = databaseName(process.env.DATABASE_URL ?? '')
  if (!name.endsWith('_test')) throw new Error(`拒絕清空非測試資料庫:${name}`)
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "AuditLog","Invoice","Payment","OrderItemOption","OrderItem","Order","Customer","StaffSession","StaffUser",' +
      '"MenuItemOptionGroup","Option","OptionGroup","MenuItem","MenuCategory","Store" RESTART IDENTITY CASCADE',
  )
}

let cachedHash: string | undefined
async function passwordHash() {
  cachedHash ??= await hash(PASSWORD)
  return cachedHash
}

/**
 * 建立一組固定的測試資料(每個測試開始前呼叫):
 *  - 店家:營業 06:00–13:00、備餐 10 分鐘
 *  - 員工:owner / manager / staff(密碼都是 PASSWORD)
 *  - 菜單:蛋餅(口味必選)、豆漿(溫度、大小必選)、荷包蛋、燒餅油條(售完)、地瓜粥(下架)
 */
export async function createFixture() {
  const store = await prisma.store.create({
    data: { slug: 'my-store', name: '測試早餐店', openTime: '06:00', closeTime: '13:00', prepMinutes: 10 },
  })
  const hashValue = await passwordHash()
  const staff = {
    owner: await prisma.staffUser.create({ data: { storeId: store.id, email: 'owner@test.local', name: '老闆', role: 'OWNER', passwordHash: hashValue } }),
    manager: await prisma.staffUser.create({ data: { storeId: store.id, email: 'manager@test.local', name: '店長', role: 'MANAGER', passwordHash: hashValue } }),
    staff: await prisma.staffUser.create({ data: { storeId: store.id, email: 'staff@test.local', name: '店員', role: 'STAFF', passwordHash: hashValue } }),
  }

  const main = await prisma.menuCategory.create({ data: { storeId: store.id, name: '主餐', sortOrder: 0 } })
  const drinks = await prisma.menuCategory.create({ data: { storeId: store.id, name: '飲料', sortOrder: 1 } })

  const flavor = await prisma.optionGroup.create({
    data: {
      storeId: store.id,
      name: '蛋餅口味',
      minSelect: 1,
      maxSelect: 1,
      options: { create: [{ name: '原味', priceDelta: 0, sortOrder: 0 }, { name: '起司', priceDelta: 10, sortOrder: 1 }, { name: '鮪魚', priceDelta: 15, sortOrder: 2 }] },
    },
    include: { options: true },
  })
  const temperature = await prisma.optionGroup.create({
    data: { storeId: store.id, name: '溫度', minSelect: 1, maxSelect: 1, options: { create: [{ name: '熱', sortOrder: 0 }, { name: '冷', sortOrder: 1 }] } },
    include: { options: true },
  })
  const size = await prisma.optionGroup.create({
    data: { storeId: store.id, name: '大小', minSelect: 1, maxSelect: 1, options: { create: [{ name: '小', priceDelta: 0, sortOrder: 0 }, { name: '大', priceDelta: 10, sortOrder: 1 }] } },
    include: { options: true },
  })
  const extras = await prisma.optionGroup.create({
    data: {
      storeId: store.id,
      name: '加料',
      minSelect: 0,
      maxSelect: 2,
      options: { create: [{ name: '加蛋', priceDelta: 10, sortOrder: 0 }, { name: '加起司', priceDelta: 10, sortOrder: 1 }, { name: '加培根', priceDelta: 15, sortOrder: 2, isAvailable: false }, { name: '加肉鬆', priceDelta: 10, sortOrder: 3 }] },
    },
    include: { options: true },
  })

  const link = (groups: Array<{ id: string }>) => ({ create: groups.map((group, index) => ({ optionGroupId: group.id, sortOrder: index })) })
  const egg = await prisma.menuItem.create({
    data: { storeId: store.id, categoryId: main.id, name: '蛋餅', price: 30, sortOrder: 0, optionGroups: link([flavor, extras]) },
  })
  const soy = await prisma.menuItem.create({
    data: { storeId: store.id, categoryId: drinks.id, name: '豆漿', price: 20, sortOrder: 1, optionGroups: link([temperature, size]) },
  })
  const friedEgg = await prisma.menuItem.create({ data: { storeId: store.id, categoryId: main.id, name: '荷包蛋', price: 15, sortOrder: 2 } })
  const soldOut = await prisma.menuItem.create({ data: { storeId: store.id, categoryId: main.id, name: '燒餅油條', price: 45, isAvailable: false, sortOrder: 3 } })
  const inactive = await prisma.menuItem.create({ data: { storeId: store.id, categoryId: main.id, name: '地瓜粥', price: 40, isActive: false, sortOrder: 4 } })

  const option = (group: { options: Array<{ id: string; name: string }> }, optionName: string) => {
    const found = group.options.find((o) => o.name === optionName)
    if (!found) throw new Error(`測試資料沒有選項:${optionName}`)
    return found.id
  }

  return {
    store,
    staff,
    categories: { main, drinks },
    groups: { flavor, temperature, size, extras },
    items: { egg, soy, friedEgg, soldOut, inactive },
    opt: {
      原味: option(flavor, '原味'),
      起司: option(flavor, '起司'),
      鮪魚: option(flavor, '鮪魚'),
      熱: option(temperature, '熱'),
      冷: option(temperature, '冷'),
      小: option(size, '小'),
      大: option(size, '大'),
      加蛋: option(extras, '加蛋'),
      加起司: option(extras, '加起司'),
      加培根: option(extras, '加培根'),
      加肉鬆: option(extras, '加肉鬆'),
    },
  }
}
export type Fixture = Awaited<ReturnType<typeof createFixture>>

// ───────────── 應用程式 ─────────────

export async function createTestApp(options: BuildAppOptions & { now?: Date } = {}) {
  const { now = NOW, ...rest } = options
  const clock = { current: now }
  const app = await buildApp({ logger: false, clock: () => clock.current, rateLimit: false, ...rest })
  return { app, clock }
}

export const phone = (n: number) => `0900000${String(n).padStart(3, '0')}`

/** 一張最簡單的合法訂單內容:1 份荷包蛋 */
export function simpleOrder(fx: Fixture, overrides: Record<string, unknown> = {}) {
  return {
    customerName: '測試顧客',
    customerPhone: phone(1),
    items: [{ menuItemId: fx.items.friedEgg.id, quantity: 1 }],
    ...overrides,
  }
}

/** 登入並回傳之後請求要帶的 Cookie */
export async function loginCookie(app: App, email: string, password = PASSWORD): Promise<string> {
  const response = await app.inject({ method: 'POST', url: '/api/admin/auth/login', payload: { email, password } })
  if (response.statusCode !== 200) throw new Error(`測試登入失敗(${response.statusCode}):${response.body}`)
  const setCookie = [response.headers['set-cookie']].flat().find((value) => value?.startsWith(`${SESSION_COOKIE}=`))
  if (!setCookie) throw new Error('登入沒有回傳 Cookie')
  return setCookie.split(';')[0]
}

export async function postOrder(app: App, payload: unknown, headers: Record<string, string> = {}) {
  return app.inject({ method: 'POST', url: '/api/orders', payload: payload as object, headers })
}

export const json = <T = any>(response: { body: string }): T => JSON.parse(response.body) as T
