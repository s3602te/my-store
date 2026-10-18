/**
 * 範例資料(seed):中式早餐店「我的早餐店」。
 *   - 1 家店、6 個分類、約 25 道餐點、11 組選項(飯糰客製、豆漿溫度/大小、蛋餅口味…)
 *   - 3 個員工帳號(老闆 / 店長 / 店員),密碼隨機產生,只在第一次建立時顯示一次
 *   - 3 位假顧客 + 7 筆假訂單(每種訂單狀態至少一筆),方便在後台與 Prisma Studio 查看
 * 可以重複執行,不會變成兩份:已存在的資料不會被覆蓋(店家改過的價格不會被洗掉)。
 *   執行:npm run db:seed
 * 想重來:npx prisma migrate reset --force 之後再執行 npm run db:seed(只會清空本機資料庫)
 */
import { randomBytes } from 'node:crypto'
import { hash } from '@node-rs/argon2'
import { config } from '../src/config.js'
import { prisma } from '../src/db.js'
import type { OrderStatus, StaffRole } from '../src/generated/prisma/enums.js'
import { calcLineTotal, sumMoney } from '../src/lib/money.js'
import { formatOrderNumber } from '../src/lib/orderNumber.js'
import { businessDateOf } from '../src/lib/time.js'

if (config.isProduction) {
  console.error('❌ 為了安全,seed 不能在正式環境(NODE_ENV=production)執行。')
  process.exit(1)
}

// ─────────────────────────── 選項群組 ───────────────────────────

type OptionDef = [name: string, priceDelta: number]
interface GroupDef {
  name: string
  min: number
  max: number
  options: OptionDef[]
}

const GROUPS: GroupDef[] = [
  { name: '飯糰客製', min: 0, max: 4, options: [['不要油條', 0], ['不要菜脯', 0], ['不要肉鬆', 0], ['加蛋', 10]] },
  { name: '米種', min: 1, max: 1, options: [['白米', 0], ['紫米', 5], ['混米', 5]] },
  {
    name: '蛋餅口味',
    min: 1,
    max: 1,
    options: [['原味', 0], ['玉米', 10], ['起司', 10], ['火腿', 10], ['肉鬆', 10], ['培根', 15], ['鮪魚', 15]],
  },
  { name: '溫度', min: 1, max: 1, options: [['熱', 0], ['冷', 0]] },
  { name: '大小', min: 1, max: 1, options: [['小', 0], ['大', 10]] },
  { name: '甜度', min: 1, max: 1, options: [['無糖', 0], ['微糖', 0], ['半糖', 0], ['全糖', 0]] },
  { name: '熟度', min: 1, max: 1, options: [['全熟', 0], ['半熟', 0]] },
  { name: '醬料', min: 0, max: 1, options: [['醬油膏', 0], ['甜辣醬', 0], ['辣椒醬', 0]] },
  { name: '加料', min: 0, max: 3, options: [['加蛋', 10], ['加起司', 10], ['加培根', 15]] },
  { name: '鐵板麵醬汁', min: 1, max: 1, options: [['黑胡椒', 0], ['蘑菇', 0]] },
  { name: '厚片口味', min: 1, max: 1, options: [['奶酥', 0], ['花生', 0], ['巧克力', 0], ['草莓', 0]] },
]

// ─────────────────────────── 餐點 ───────────────────────────

interface ItemDef {
  name: string
  category: string
  price: number
  description: string
  groups: string[]
  /** false = 今日售完 */
  isAvailable?: boolean
  /** false = 下架(顧客看不到) */
  isActive?: boolean
}

const CATEGORIES = ['飯糰', '蛋餅', '吐司漢堡', '鐵板麵', '點心', '飲料']

const DRINK = ['溫度', '大小', '甜度']

const ITEMS: ItemDef[] = [
  { name: '傳統飯糰', category: '飯糰', price: 40, description: '糯米包油條、菜脯、肉鬆', groups: ['米種', '飯糰客製'] },
  { name: '燒肉蛋飯糰', category: '飯糰', price: 70, description: '燒肉片加荷包蛋,份量十足', groups: ['米種', '飯糰客製'] },

  { name: '蛋餅', category: '蛋餅', price: 30, description: '現煎蛋餅皮,口味可選', groups: ['蛋餅口味', '醬料'] },

  { name: '火腿蛋吐司', category: '吐司漢堡', price: 40, description: '烤吐司夾火腿與煎蛋', groups: ['加料'] },
  { name: '培根蛋吐司', category: '吐司漢堡', price: 45, description: '烤吐司夾培根與煎蛋', groups: ['加料'] },
  { name: '鮪魚蛋吐司', category: '吐司漢堡', price: 45, description: '烤吐司夾鮪魚與煎蛋', groups: ['加料'] },
  { name: '豬排蛋漢堡', category: '吐司漢堡', price: 55, description: '酥炸豬排加蛋的漢堡', groups: ['加料'] },
  { name: '厚片吐司', category: '吐司漢堡', price: 30, description: '厚切烤吐司,抹醬可選', groups: ['厚片口味'] },

  { name: '鐵板麵', category: '鐵板麵', price: 55, description: '鐵板炒麵加煎蛋', groups: ['鐵板麵醬汁', '加料'] },

  { name: '荷包蛋', category: '點心', price: 15, description: '現煎荷包蛋', groups: ['熟度'] },
  { name: '油條', category: '點心', price: 30, description: '現炸酥脆油條', groups: [] },
  { name: '蘿蔔糕', category: '點心', price: 30, description: '煎得金黃的蘿蔔糕', groups: ['醬料'] },
  { name: '薯餅', category: '點心', price: 25, description: '酥脆薯餅', groups: [] },
  { name: '燒餅油條', category: '點心', price: 45, description: '【今日售完】燒餅夾油條', groups: [], isAvailable: false },
  { name: '季節限定地瓜粥', category: '點心', price: 40, description: '【已下架】冬季限定', groups: [], isActive: false },

  { name: '豆漿', category: '飲料', price: 20, description: '現磨豆漿', groups: DRINK },
  { name: '米漿', category: '飲料', price: 25, description: '傳統米漿', groups: DRINK },
  { name: '奶茶', category: '飲料', price: 25, description: '古早味奶茶', groups: DRINK },
  { name: '紅茶', category: '飲料', price: 20, description: '古早味紅茶', groups: DRINK },
  { name: '鮮奶茶', category: '飲料', price: 40, description: '紅茶加鮮奶', groups: DRINK },
]

// ─────────────────────────── 假顧客與假訂單 ───────────────────────────

interface FakeCustomer {
  key: 'A' | 'B' | 'C'
  name: string
  phone: string
  email: string
}

// 姓名與電話一看就知道是假的(電話 0900000xxx 不是真實門號)
const CUSTOMERS: FakeCustomer[] = [
  { key: 'A', name: '測試顧客甲', phone: '0900000001', email: 'test-a@example.com' },
  { key: 'B', name: '測試顧客乙', phone: '0900000002', email: 'test-b@example.com' },
  { key: 'C', name: '測試顧客丙', phone: '0900000003', email: 'test-c@example.com' },
]

interface DemoLine {
  item: string
  quantity: number
  /** [群組名稱, 選項名稱] */
  options?: Array<[string, string]>
  note?: string
}

interface DemoOrder {
  /** 假的追蹤碼(明顯是假的,真實訂單的追蹤碼是 32 字元的隨機字串) */
  token: string
  status: OrderStatus
  customer: FakeCustomer['key'] | null
  guestName?: string
  guestPhone?: string
  note?: string
  /** 幾分鐘前下的單 */
  minutesAgo: number
  lines: DemoLine[]
  reason?: string
}

const DEMO_ORDERS: DemoOrder[] = [
  {
    token: 'demo-pending-0000000000000000',
    status: 'PENDING',
    customer: 'A',
    note: '不要塑膠袋,謝謝',
    minutesAgo: 3,
    lines: [
      { item: '傳統飯糰', quantity: 1, options: [['米種', '紫米'], ['飯糰客製', '不要油條'], ['飯糰客製', '加蛋']] },
      { item: '豆漿', quantity: 1, options: [['溫度', '熱'], ['大小', '大'], ['甜度', '無糖']] },
    ],
  },
  {
    token: 'demo-accepted-000000000000000',
    status: 'ACCEPTED',
    customer: 'B',
    minutesAgo: 8,
    lines: [
      { item: '蛋餅', quantity: 2, options: [['蛋餅口味', '起司'], ['醬料', '甜辣醬']] },
      { item: '奶茶', quantity: 1, options: [['溫度', '冷'], ['大小', '小'], ['甜度', '微糖']] },
    ],
  },
  {
    token: 'demo-preparing-00000000000000',
    status: 'PREPARING',
    customer: null,
    guestName: '訪客測試一號',
    guestPhone: '0900000011',
    minutesAgo: 14,
    lines: [
      { item: '鐵板麵', quantity: 1, options: [['鐵板麵醬汁', '黑胡椒'], ['加料', '加蛋']] },
      { item: '荷包蛋', quantity: 1, options: [['熟度', '半熟']] },
    ],
  },
  {
    token: 'demo-ready-000000000000000000',
    status: 'READY',
    customer: 'C',
    minutesAgo: 22,
    lines: [
      { item: '火腿蛋吐司', quantity: 1, options: [['加料', '加起司']] },
      { item: '紅茶', quantity: 1, options: [['溫度', '冷'], ['大小', '大'], ['甜度', '微糖']] },
      { item: '薯餅', quantity: 2 },
    ],
  },
  {
    token: 'demo-completed-00000000000000',
    status: 'COMPLETED',
    customer: 'A',
    minutesAgo: 45,
    lines: [
      { item: '蘿蔔糕', quantity: 1, options: [['醬料', '甜辣醬']] },
      { item: '油條', quantity: 1 },
      { item: '米漿', quantity: 1, options: [['溫度', '熱'], ['大小', '小'], ['甜度', '無糖']] },
    ],
  },
  {
    token: 'demo-cancelled-00000000000000',
    status: 'CANCELLED',
    customer: 'B',
    minutesAgo: 30,
    reason: '顧客臨時有事,自行取消',
    lines: [{ item: '燒肉蛋飯糰', quantity: 1, options: [['米種', '白米']] }],
  },
  {
    token: 'demo-rejected-000000000000000',
    status: 'REJECTED',
    customer: null,
    guestName: '訪客測試二號',
    guestPhone: '0900000012',
    minutesAgo: 60,
    reason: '今日厚片吐司的麵團用完了,抱歉',
    lines: [{ item: '厚片吐司', quantity: 3, options: [['厚片口味', '奶酥']] }],
  },
]

// ─────────────────────────── 執行 ───────────────────────────

async function main() {
  const store = await prisma.store.upsert({
    where: { slug: config.storeSlug },
    create: { slug: config.storeSlug, name: '我的早餐店', acceptingOrders: true },
    update: {},
  })

  // 分類
  const categoryIds = new Map<string, string>()
  for (const [index, name] of CATEGORIES.entries()) {
    const category = await prisma.menuCategory.upsert({
      where: { storeId_name: { storeId: store.id, name } },
      create: { storeId: store.id, name, sortOrder: index },
      update: {},
    })
    categoryIds.set(name, category.id)
  }

  // 選項群組(記下每個選項的 id 與加價,建立假訂單時要用)
  const groups = new Map<string, { id: string; options: Map<string, { id: string; priceDelta: number }> }>()
  for (const [groupIndex, def] of GROUPS.entries()) {
    const group = await prisma.optionGroup.upsert({
      where: { storeId_name: { storeId: store.id, name: def.name } },
      create: { storeId: store.id, name: def.name, minSelect: def.min, maxSelect: def.max, sortOrder: groupIndex },
      update: {},
    })
    const options = new Map<string, { id: string; priceDelta: number }>()
    for (const [index, [name, priceDelta]] of def.options.entries()) {
      const option = await prisma.option.upsert({
        where: { groupId_name: { groupId: group.id, name } },
        create: { groupId: group.id, name, priceDelta, sortOrder: index },
        update: {},
      })
      options.set(name, { id: option.id, priceDelta: option.priceDelta })
    }
    groups.set(def.name, { id: group.id, options })
  }

  // 餐點
  const items = new Map<string, { id: string; price: number }>()
  for (const [index, def] of ITEMS.entries()) {
    const item = await prisma.menuItem.upsert({
      where: { storeId_name: { storeId: store.id, name: def.name } },
      create: {
        storeId: store.id,
        categoryId: categoryIds.get(def.category)!,
        name: def.name,
        price: def.price,
        description: def.description,
        sortOrder: index,
        isAvailable: def.isAvailable ?? true,
        isActive: def.isActive ?? true,
      },
      update: {},
    })
    items.set(def.name, { id: item.id, price: item.price })
    for (const [order, groupName] of def.groups.entries()) {
      const optionGroupId = groups.get(groupName)!.id
      await prisma.menuItemOptionGroup.upsert({
        where: { menuItemId_optionGroupId: { menuItemId: item.id, optionGroupId } },
        create: { menuItemId: item.id, optionGroupId, sortOrder: order },
        update: {},
      })
    }
  }

  // 員工帳號
  const staffIds = await seedStaff(store.id)

  // 假顧客與假訂單
  const customerIds = new Map<string, string>()
  for (const customer of CUSTOMERS) {
    const existing = await prisma.customer.findFirst({ where: { storeId: store.id, phone: customer.phone } })
    const row =
      existing ??
      (await prisma.customer.create({
        data: { storeId: store.id, name: customer.name, phone: customer.phone, email: customer.email },
      }))
    customerIds.set(customer.key, row.id)
  }
  const created = await seedDemoOrders(store.id, items, groups, customerIds, staffIds.owner)

  // 摘要
  const byStatus = await prisma.order.groupBy({ by: ['status'], _count: true, where: { storeId: store.id } })
  console.log('📦 目前資料筆數:', {
    店家: await prisma.store.count(),
    分類: await prisma.menuCategory.count(),
    餐點: await prisma.menuItem.count(),
    選項群組: await prisma.optionGroup.count(),
    選項: await prisma.option.count(),
    員工: await prisma.staffUser.count(),
    顧客: await prisma.customer.count(),
    訂單: await prisma.order.count(),
  })
  console.log(`🧾 本次新建假訂單 ${created} 筆;各狀態筆數:`, Object.fromEntries(byStatus.map((row) => [row.status, row._count])))
}

async function seedStaff(storeId: string): Promise<{ owner: string }> {
  const accounts: Array<{ email: string; name: string; role: StaffRole }> = [
    { email: 'owner@example.com', name: '老闆(測試)', role: 'OWNER' },
    { email: 'manager@example.com', name: '店長(測試)', role: 'MANAGER' },
    { email: 'staff@example.com', name: '店員(測試)', role: 'STAFF' },
  ]
  const created: Array<{ email: string; role: string; password: string }> = []
  const ids: Record<string, string> = {}

  for (const account of accounts) {
    const existing = await prisma.staffUser.findUnique({ where: { email: account.email } })
    if (existing) {
      ids[account.role] = existing.id
      continue
    }
    const password = randomBytes(12).toString('base64url')
    const row = await prisma.staffUser.create({
      data: { storeId, email: account.email, name: account.name, role: account.role, passwordHash: await hash(password) },
    })
    ids[account.role] = row.id
    created.push({ email: account.email, role: account.role, password })
  }

  if (created.length === 0) {
    console.log('✅ 員工帳號都已存在,密碼不變。')
  } else {
    console.log('')
    console.log('🔑 已建立員工帳號(請現在就記下來,這些密碼之後不會再顯示):')
    for (const row of created) console.log(`   ${row.role.padEnd(8)} ${row.email.padEnd(22)} 密碼:${row.password}`)
    console.log('')
  }
  return { owner: ids.OWNER }
}

async function seedDemoOrders(
  storeId: string,
  items: Map<string, { id: string; price: number }>,
  groups: Map<string, { id: string; options: Map<string, { id: string; priceDelta: number }> }>,
  customerIds: Map<string, string>,
  ownerId: string,
): Promise<number> {
  let created = 0
  for (const demo of DEMO_ORDERS) {
    if (await prisma.order.findUnique({ where: { trackingToken: demo.token } })) continue

    const customer = demo.customer ? CUSTOMERS.find((c) => c.key === demo.customer)! : null
    const createdAt = new Date(Date.now() - demo.minutesAgo * 60_000)
    const at = (minutes: number) => new Date(createdAt.getTime() + minutes * 60_000)
    const businessDate = businessDateOf(createdAt)

    // 組出每個品項:名稱與價格都存「快照」
    const lineData = demo.lines.map((line) => {
      const item = items.get(line.item)
      if (!item) throw new Error(`假訂單用到不存在的餐點:${line.item}`)
      const picked = (line.options ?? []).map(([groupName, optionName]) => {
        const option = groups.get(groupName)?.options.get(optionName)
        if (!option) throw new Error(`假訂單用到不存在的選項:${groupName}/${optionName}`)
        return { groupName, optionName, priceDelta: option.priceDelta }
      })
      return {
        menuItemId: item.id,
        nameSnapshot: line.item,
        unitPriceSnapshot: item.price,
        quantity: line.quantity,
        note: line.note ?? null,
        lineTotal: calcLineTotal(item.price, picked.map((p) => p.priceDelta), line.quantity),
        options: {
          create: picked.map((p) => ({
            groupNameSnapshot: p.groupName,
            nameSnapshot: p.optionName,
            priceDeltaSnapshot: p.priceDelta,
          })),
        },
      }
    })
    const subtotal = sumMoney(lineData.map((line) => line.lineTotal))

    const progressed: OrderStatus[] = ['ACCEPTED', 'PREPARING', 'READY', 'COMPLETED']
    const isClosed = demo.status === 'CANCELLED' || demo.status === 'REJECTED'
    const paid = demo.status === 'COMPLETED'

    // 訂單編號接在「當天最大流水號」後面,不會和真實訂單撞號
    const last = await prisma.order.aggregate({ where: { storeId, businessDate }, _max: { sequence: true } })
    const sequence = (last._max.sequence ?? 0) + 1

    await prisma.order.create({
      data: {
        storeId,
        businessDate,
        sequence,
        orderNumber: formatOrderNumber(sequence),
        trackingToken: demo.token,
        fulfillmentType: 'TAKEOUT',
        status: demo.status,
        customerId: customer ? customerIds.get(customer.key) : null,
        customerName: customer?.name ?? demo.guestName!,
        customerPhone: customer?.phone ?? demo.guestPhone!,
        note: demo.note ?? null,
        pickupAt: at(15),
        subtotal,
        discount: 0,
        total: subtotal,
        cancelReason: demo.reason ?? null,
        acceptedAt: progressed.includes(demo.status) ? at(2) : null,
        readyAt: demo.status === 'READY' || demo.status === 'COMPLETED' ? at(12) : null,
        completedAt: demo.status === 'COMPLETED' ? at(16) : null,
        cancelledAt: isClosed ? at(5) : null,
        createdAt,
        items: { create: lineData },
        payments: {
          create: {
            provider: 'cash',
            method: 'CASH',
            status: paid ? 'SUCCEEDED' : 'PENDING',
            amount: subtotal,
            paidAt: paid ? at(16) : null,
            confirmedById: paid ? ownerId : null,
          },
        },
        invoice: { create: { status: 'NOT_REQUIRED', provider: 'none' } },
      },
    })
    created += 1
  }
  return created
}

main()
  .catch((error) => {
    console.error('❌ seed 失敗:', error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
