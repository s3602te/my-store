/**
 * 驗收小工具:印出一份「可以直接貼進 /docs 頁面的 POST /api/orders 內容」,
 * 餐點與選項的 ID 都是從你的資料庫讀出來的真實 ID,不用自己去找。
 *   執行:npm run demo:order
 */
import { config } from '../src/config.js'
import { prisma } from '../src/db.js'

async function main() {
  const store = await prisma.store.findUnique({ where: { slug: config.storeSlug } })
  if (!store) throw new Error('找不到店家,請先執行 npm run db:seed')

  const items = await prisma.menuItem.findMany({
    where: { storeId: store.id, isActive: true, isAvailable: true },
    include: { optionGroups: { include: { optionGroup: { include: { options: true } } } } },
  })
  const find = (name: string) => {
    const item = items.find((i) => i.name === name)
    if (!item) throw new Error(`菜單裡找不到「${name}」(可能被改名或下架了)`)
    return item
  }
  const option = (itemName: string, groupName: string, optionName: string) => {
    const group = find(itemName).optionGroups.map((link) => link.optionGroup).find((g) => g.name === groupName)
    const found = group?.options.find((o) => o.name === optionName)
    if (!found) throw new Error(`「${itemName}」找不到選項 ${groupName}/${optionName}`)
    return found.id
  }

  const body = {
    customerName: '測試顧客(驗收用)',
    customerPhone: '0900000123',
    note: '不要塑膠袋',
    items: [
      // 蛋餅 30 + 起司 10 = 40,2 份 = 80
      { menuItemId: find('蛋餅').id, quantity: 2, optionIds: [option('蛋餅', '蛋餅口味', '起司')] },
      // 豆漿 20 + 大杯 10 = 30,1 份 = 30
      {
        menuItemId: find('豆漿').id,
        quantity: 1,
        optionIds: [option('豆漿', '溫度', '熱'), option('豆漿', '大小', '大'), option('豆漿', '甜度', '無糖')],
      },
    ],
  }

  console.log('\n把下面這段貼到 /docs 頁面的「POST /api/orders」→ Try it out → Request body:\n')
  console.log(JSON.stringify(body, null, 2))
  console.log('\n預期總額:NT$ 110(蛋餅 80 + 豆漿 30)')
  console.log('想測「價格由後端算」:在最外層多加一行  "price": 1  再送出,總額一樣是 110。\n')
}

main()
  .catch((error) => {
    console.error('❌', error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
