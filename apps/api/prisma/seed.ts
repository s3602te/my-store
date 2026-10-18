/**
 * 範例資料(seed):1 家店、3 個分類、6 道餐點、2 組選項、1 個老闆帳號。
 * 可以重複執行,不會變成兩份:已存在的資料不會被覆蓋(店家改過的價格不會被洗掉)。
 *   執行:npm run db:seed
 */
import { randomBytes } from 'node:crypto'
import { hash } from '@node-rs/argon2'
import { config } from '../src/config.js'
import { prisma } from '../src/db.js'

const OWNER_EMAIL = process.env.SEED_OWNER_EMAIL ?? 'owner@example.com'

async function main() {
  const store = await prisma.store.upsert({
    where: { slug: config.storeSlug },
    create: { slug: config.storeSlug, name: '我的小吃店', acceptingOrders: true },
    update: {},
  })

  // ── 分類 ──
  const categoryNames = ['主餐', '小菜', '飲料']
  const categories: Record<string, string> = {}
  for (const [index, name] of categoryNames.entries()) {
    const category = await prisma.menuCategory.upsert({
      where: { storeId_name: { storeId: store.id, name } },
      create: { storeId: store.id, name, sortOrder: index },
      update: {},
    })
    categories[name] = category.id
  }

  // ── 選項群組 ──
  const spicy = await upsertGroup(store.id, '辣度', 0, 1, [
    ['不辣', 0],
    ['小辣', 0],
    ['中辣', 0],
    ['大辣', 0],
  ])
  const toppings = await upsertGroup(store.id, '加料', 0, 3, [
    ['加蛋', 10],
    ['加滷肉', 20],
    ['加青菜', 15],
  ])

  // ── 餐點 [名稱, 分類, 價格, 說明, 選項群組] ──
  const items: Array<[string, string, number, string, string[]]> = [
    ['牛肉麵', '主餐', 180, '慢火燉煮的牛腱與手工麵條', [spicy, toppings]],
    ['雞腿飯', '主餐', 130, '酥脆炸雞腿配三樣配菜', [spicy]],
    ['滷肉飯', '主餐', 60, '古早味滷肉飯', [toppings]],
    ['燙青菜', '小菜', 40, '當季青菜,淋上滷汁', []],
    ['紅茶', '飲料', 30, '古早味紅茶', []],
    ['豆漿', '飲料', 25, '無糖豆漿', []],
  ]
  for (const [index, [name, category, price, description, groupIds]] of items.entries()) {
    const item = await prisma.menuItem.upsert({
      where: { storeId_name: { storeId: store.id, name } },
      create: { storeId: store.id, categoryId: categories[category], name, price, description, sortOrder: index },
      update: {},
    })
    for (const [order, optionGroupId] of groupIds.entries()) {
      await prisma.menuItemOptionGroup.upsert({
        where: { menuItemId_optionGroupId: { menuItemId: item.id, optionGroupId } },
        create: { menuItemId: item.id, optionGroupId, sortOrder: order },
        update: {},
      })
    }
  }

  // ── 老闆帳號:密碼隨機產生,只在第一次建立時顯示一次,資料庫只存雜湊 ──
  const existing = await prisma.staffUser.findUnique({ where: { email: OWNER_EMAIL } })
  if (existing) {
    console.log(`✅ 老闆帳號 ${OWNER_EMAIL} 已存在,密碼不變。`)
  } else {
    const password = randomBytes(12).toString('base64url')
    await prisma.staffUser.create({
      data: {
        storeId: store.id,
        email: OWNER_EMAIL,
        name: '老闆',
        role: 'OWNER',
        passwordHash: await hash(password),
      },
    })
    console.log('')
    console.log('🔑 已建立老闆帳號(請現在就記下來,這個密碼之後不會再顯示):')
    console.log(`   Email:    ${OWNER_EMAIL}`)
    console.log(`   密碼:     ${password}`)
    console.log('')
  }

  const counts = {
    店家: await prisma.store.count(),
    分類: await prisma.menuCategory.count(),
    餐點: await prisma.menuItem.count(),
    選項群組: await prisma.optionGroup.count(),
    員工: await prisma.staffUser.count(),
  }
  console.log('📦 目前資料筆數:', counts)
}

/** 建立(或取得)一個選項群組與它的選項,回傳群組 ID */
async function upsertGroup(
  storeId: string,
  name: string,
  minSelect: number,
  maxSelect: number,
  options: Array<[string, number]>,
): Promise<string> {
  const group = await prisma.optionGroup.upsert({
    where: { storeId_name: { storeId, name } },
    create: { storeId, name, minSelect, maxSelect },
    update: {},
  })
  for (const [index, [optionName, priceDelta]] of options.entries()) {
    await prisma.option.upsert({
      where: { groupId_name: { groupId: group.id, name: optionName } },
      create: { groupId: group.id, name: optionName, priceDelta, sortOrder: index },
      update: {},
    })
  }
  return group.id
}

main()
  .catch((error) => {
    console.error('❌ seed 失敗:', error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
