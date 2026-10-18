import { prisma } from '../db.js'
import type { Prisma } from '../generated/prisma/client.js'
import type { OrderStatus as DbOrderStatus } from '../generated/prisma/enums.js'
import { AppError, badRequest, conflict, notFound, tooMany } from '../lib/errors.js'
import {
  MAX_ORDER_TOTAL,
  MAX_PENDING_ORDERS_PER_PHONE,
  PICKUP_TOLERANCE_MS,
} from '../lib/limits.js'
import { calcLineTotal, sumMoney } from '../lib/money.js'
import { formatOrderNumber } from '../lib/orderNumber.js'
import {
  checkTransition,
  ORDER_STATUS_LABELS,
  ORDER_STATUSES,
  type Actor,
  type OrderStatus,
  type TransitionCheck,
} from '../lib/orderStatus.js'
import { generateToken, maskPhone, TRACKING_TOKEN_PATTERN } from '../lib/security.js'
import { businessDateOf, formatTaipeiDate, formatTaipeiHHmm, taipeiTimeOnSameDay } from '../lib/time.js'
import { invoiceProvider } from '../modules/invoices/index.js'
import { DEFAULT_PAYMENT_PROVIDER, getPaymentProvider } from '../modules/payments/index.js'
import type { StaffPrincipal } from '../plugins/auth.js'
import { iso } from '../schemas/common.js'
import type { AdminOrder, CreateOrderInput, PublicOrder } from '../schemas/order.js'
import { writeAudit } from './audit.js'
import { getStore, storeAvailability } from './storeService.js'

// ───────────────────────── 查詢與轉換 ─────────────────────────

/** 讀訂單時一併帶出的關聯資料(明細依顧客點的順序排列) */
export const orderInclude = {
  items: {
    orderBy: [{ position: 'asc' }, { id: 'asc' }],
    include: { options: { orderBy: [{ position: 'asc' }, { id: 'asc' }] } },
  },
  payments: { orderBy: { createdAt: 'asc' } },
  invoice: true,
} satisfies Prisma.OrderInclude

export type OrderRecord = Prisma.OrderGetPayload<{ include: typeof orderInclude }>

function paymentSummary(order: OrderRecord) {
  const latest = order.payments.at(-1)
  return { paymentMethod: (latest?.method ?? 'CASH') as 'CASH', paymentStatus: latest?.status ?? 'PENDING' }
}

function toItems(order: OrderRecord): PublicOrder['items'] {
  return order.items.map((item) => ({
    name: item.nameSnapshot,
    unitPrice: item.unitPriceSnapshot,
    quantity: item.quantity,
    note: item.note,
    lineTotal: item.lineTotal,
    options: item.options.map((option) => ({
      group: option.groupNameSnapshot,
      name: option.nameSnapshot,
      priceDelta: option.priceDeltaSnapshot,
    })),
  }))
}

function toBase(order: OrderRecord) {
  return {
    orderNumber: order.orderNumber,
    status: order.status,
    fulfillmentType: order.fulfillmentType,
    customerName: order.customerName,
    note: order.note,
    pickupAt: iso(order.pickupAt),
    subtotal: order.subtotal,
    discount: order.discount,
    total: order.total,
    ...paymentSummary(order),
    cancelReason: order.cancelReason,
    createdAt: iso(order.createdAt),
    acceptedAt: iso(order.acceptedAt),
    readyAt: iso(order.readyAt),
    completedAt: iso(order.completedAt),
    cancelledAt: iso(order.cancelledAt),
    items: toItems(order),
  }
}

/** 顧客看到的版本:電話遮罩 */
export function toPublicOrder(order: OrderRecord): PublicOrder {
  return { ...toBase(order), trackingToken: order.trackingToken, customerPhone: maskPhone(order.customerPhone) }
}

/** 店員看到的版本:完整電話、付款與發票資訊 */
export function toAdminOrder(order: OrderRecord): AdminOrder {
  return {
    ...toBase(order),
    id: order.id,
    businessDate: order.businessDate.toISOString().slice(0, 10),
    customerPhone: order.customerPhone,
    customerId: order.customerId,
    payments: order.payments.map((payment) => ({
      id: payment.id,
      provider: payment.provider,
      method: payment.method,
      status: payment.status,
      amount: payment.amount,
      paidAt: iso(payment.paidAt),
      confirmedById: payment.confirmedById,
    })),
    invoice: order.invoice ? { status: order.invoice.status, invoiceNumber: order.invoice.invoiceNumber } : null,
  }
}

// ───────────────────────── 顧客下單 ─────────────────────────

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002'
}

/**
 * 建立訂單(外帶、現金到店付款)。
 *
 * 重點:前端只送「餐點 ID、選項 ID、數量」,**所有價格都由這裡依資料庫重新計算**。
 * 檢查順序:店家是否接單 → 取餐時間 → 餐點與選項是否存在/可供應/符合群組規則 → 金額上限 → 防灌單。
 */
export async function createOrder(
  input: CreateOrderInput,
  opts: { now: Date; idempotencyKey?: string },
): Promise<{ order: OrderRecord; duplicate: boolean }> {
  const { now, idempotencyKey } = opts

  // 同一把 Idempotency-Key 重複送出(例如網路不穩按了兩次):直接回傳先前建立的訂單
  if (idempotencyKey) {
    const replay = await findByIdempotencyKey(idempotencyKey)
    if (replay) return { order: replay, duplicate: true }
  }

  const store = await getStore()

  // 1. 店家狀態
  if (!store.acceptingOrders) throw conflict('ORDERS_PAUSED', '店家目前暫停接單,請稍後再試')
  if (!storeAvailability(store, now).isOpenNow) {
    throw conflict('STORE_CLOSED', `目前不在營業時間內(營業時間 ${store.openTime}–${store.closeTime})`)
  }

  // 2. 取餐時間:不能早於「現在 + 備餐時間」,不能晚於今天打烊
  const earliest = new Date(now.getTime() + store.prepMinutes * 60_000)
  const latest = taipeiTimeOnSameDay(now, store.closeTime)
  if (earliest > latest) {
    throw conflict('TOO_LATE_TO_ORDER', `已超過今日最後下單時間(打烊 ${store.closeTime},需要 ${store.prepMinutes} 分鐘備餐)`)
  }
  let pickupAt = earliest
  if (input.pickupAt) {
    const requested = new Date(input.pickupAt)
    if (requested.getTime() < earliest.getTime() - PICKUP_TOLERANCE_MS) {
      throw badRequest('PICKUP_TIME_INVALID', `取餐時間最早是 ${formatTaipeiHHmm(earliest)}(需要 ${store.prepMinutes} 分鐘備餐)`)
    }
    if (requested > latest) {
      throw badRequest('PICKUP_TIME_INVALID', `取餐時間不能晚於打烊時間 ${store.closeTime}`)
    }
    pickupAt = requested < earliest ? earliest : requested
  }

  // 3. 餐點與選項:全部以資料庫為準
  const menuItems = await prisma.menuItem.findMany({
    where: { id: { in: [...new Set(input.items.map((line) => line.menuItemId))] }, storeId: store.id, isActive: true },
    include: { optionGroups: { include: { optionGroup: { include: { options: true } } } } },
  })
  const itemById = new Map(menuItems.map((item) => [item.id, item]))

  const lines = input.items.map((line, index) => {
    const item = itemById.get(line.menuItemId)
    if (!item) throw badRequest('ITEM_NOT_FOUND', '有餐點不存在或已下架,請重新整理菜單')
    if (!item.isAvailable) throw conflict('ITEM_SOLD_OUT', `「${item.name}」今日已售完`)

    const groups = item.optionGroups.map((link) => link.optionGroup)
    const optionIndex = new Map(groups.flatMap((group) => group.options.map((option) => [option.id, { group, option }] as const)))

    if (new Set(line.optionIds).size !== line.optionIds.length) {
      throw badRequest('OPTION_INVALID', `「${item.name}」的選項重複了`)
    }
    const picked = line.optionIds.map((optionId) => {
      const found = optionIndex.get(optionId)
      if (!found) throw badRequest('OPTION_INVALID', `「${item.name}」沒有這個選項`)
      if (!found.option.isAvailable) throw conflict('OPTION_SOLD_OUT', `「${item.name}」的「${found.option.name}」今日不供應`)
      return found
    })

    // 每個群組選的數量必須符合 最少~最多
    for (const group of groups) {
      const count = picked.filter((entry) => entry.group.id === group.id).length
      if (count < group.minSelect || count > group.maxSelect) {
        const range = group.minSelect === group.maxSelect ? `${group.minSelect}` : `${group.minSelect}~${group.maxSelect}`
        throw badRequest('OPTION_SELECTION_INVALID', `「${item.name}」的「${group.name}」需要選 ${range} 項`)
      }
    }

    return {
      position: index,
      menuItemId: item.id,
      nameSnapshot: item.name,
      unitPriceSnapshot: item.price,
      quantity: line.quantity,
      note: line.note?.trim() || null,
      lineTotal: calcLineTotal(item.price, picked.map((entry) => entry.option.priceDelta), line.quantity),
      options: picked.map((entry, optionPosition) => ({
        position: optionPosition,
        groupNameSnapshot: entry.group.name,
        nameSnapshot: entry.option.name,
        priceDeltaSnapshot: entry.option.priceDelta,
      })),
    }
  })

  // 4. 金額(後端計算)與上限
  const subtotal = sumMoney(lines.map((line) => line.lineTotal))
  if (subtotal > MAX_ORDER_TOTAL) {
    throw badRequest('ORDER_TOO_LARGE', `單筆訂單金額上限 NT$ ${MAX_ORDER_TOTAL.toLocaleString()},大量訂購請直接聯絡店家`)
  }

  // 5. 防灌單:同一支電話同時間「待接單」的訂單數有上限
  const pending = await prisma.order.count({
    where: { storeId: store.id, customerPhone: input.customerPhone, status: 'PENDING' },
  })
  if (pending >= MAX_PENDING_ORDERS_PER_PHONE) {
    throw tooMany('TOO_MANY_PENDING_ORDERS', '您已經有多張訂單正在等待店家接單,請等店家處理後再下單')
  }

  // 6. 寫入資料庫(同一個交易:訂單、明細、付款、發票要嘛全成功,要嘛全不成功)
  const businessDate = businessDateOf(now)
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const orderId = await prisma.$transaction(async (tx) => {
        // 訂單編號 = 當天最大流水號 + 1;兩個人剛好同時下單撞號時,資料庫的唯一限制會擋下,下面會重試
        const last = await tx.order.aggregate({ where: { storeId: store.id, businessDate }, _max: { sequence: true } })
        const sequence = (last._max.sequence ?? 0) + 1

        const order = await tx.order.create({
          data: {
            storeId: store.id,
            businessDate,
            sequence,
            orderNumber: formatOrderNumber(sequence),
            trackingToken: generateToken(24),
            fulfillmentType: 'TAKEOUT', // 目前只開放外帶
            status: 'PENDING',
            customerName: input.customerName,
            customerPhone: input.customerPhone,
            note: input.note || null,
            pickupAt,
            subtotal,
            discount: 0,
            total: subtotal,
            items: {
              create: lines.map(({ options, ...line }) => ({ ...line, options: { create: options } })),
            },
          },
          select: { id: true },
        })

        // 付款與發票都透過「提供者介面」,日後換成線上金流/電子發票不必改這裡
        const payment = await getPaymentProvider(DEFAULT_PAYMENT_PROVIDER).createPayment({
          orderId: order.id,
          amount: subtotal,
          idempotencyKey,
        })
        await tx.payment.create({
          data: {
            orderId: order.id,
            provider: payment.provider,
            method: payment.method,
            status: payment.status,
            amount: payment.amount,
            providerRef: payment.providerRef,
            idempotencyKey: idempotencyKey ?? null,
          },
        })
        const invoice = await invoiceProvider.issue({ orderId: order.id, total: subtotal })
        await tx.invoice.create({
          data: { orderId: order.id, status: invoice.status, provider: invoice.provider, invoiceNumber: invoice.invoiceNumber },
        })
        return order.id
      })

      const created = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: orderInclude })
      return { order: created, duplicate: false }
    } catch (error) {
      if (!isUniqueViolation(error)) throw error
      // 撞號,或同一把 Idempotency-Key 同時送了兩次
      if (idempotencyKey) {
        const replay = await findByIdempotencyKey(idempotencyKey)
        if (replay) return { order: replay, duplicate: true }
      }
    }
  }
  throw new AppError(503, 'ORDER_BUSY', '目前下單的人很多,請稍後再試一次')
}

async function findByIdempotencyKey(key: string): Promise<OrderRecord | null> {
  const payment = await prisma.payment.findUnique({ where: { idempotencyKey: key }, select: { orderId: true } })
  if (!payment) return null
  return prisma.order.findUnique({ where: { id: payment.orderId }, include: orderInclude })
}

// ───────────────────────── 顧客:追蹤與取消 ─────────────────────────

/** 用追蹤碼查訂單。格式不對、查不到,都回一樣的「找不到」,不透露任何資訊 */
export async function getOrderByToken(token: string): Promise<OrderRecord> {
  if (!TRACKING_TOKEN_PATTERN.test(token)) throw notFound('ORDER_NOT_FOUND', '找不到這張訂單')
  const order = await prisma.order.findUnique({ where: { trackingToken: token }, include: orderInclude })
  if (!order) throw notFound('ORDER_NOT_FOUND', '找不到這張訂單')
  return order
}

/** 顧客自行取消:只有「待接單」階段可以 */
export async function cancelOrderByCustomer(token: string, reason: string | undefined, now: Date): Promise<OrderRecord> {
  const order = await getOrderByToken(token)
  const status = order.status as OrderStatus
  if (status !== 'PENDING') {
    throw conflict('CANNOT_CANCEL', `訂單目前是「${ORDER_STATUS_LABELS[status]}」,無法自行取消,如需取消請直接聯絡店家`)
  }
  return applyTransition(order, 'CANCELLED', { actor: 'CUSTOMER', reason: reason?.trim() || '顧客自行取消', now })
}

// ───────────────────────── 店員:狀態流轉 ─────────────────────────

function toTransitionError(check: Extract<TransitionCheck, { ok: false }>): AppError {
  switch (check.code) {
    case 'REASON_REQUIRED':
      return badRequest('REASON_REQUIRED', check.message)
    case 'PAYMENT_REQUIRED':
      return conflict('PAYMENT_REQUIRED', '尚未收款,請先按「已收現金」,才能完成訂單')
    case 'NOT_ALLOWED':
      return new AppError(403, 'NOT_ALLOWED', check.message)
    default:
      return conflict('INVALID_TRANSITION', check.message)
  }
}

interface TransitionOptions {
  actor: Actor
  reason?: string
  now: Date
  staff?: StaffPrincipal
}

/** 檢查規則並更新訂單狀態。用「狀態沒變」當條件更新,避免兩個人同時操作互相覆蓋 */
async function applyTransition(order: OrderRecord, to: OrderStatus, options: TransitionOptions): Promise<OrderRecord> {
  const { actor, now, staff } = options
  const reason = options.reason?.trim() || undefined
  const paid = order.payments.some((payment) => payment.status === 'SUCCEEDED')

  const check = checkTransition(order.status as OrderStatus, to, { actor, reason, paid })
  if (!check.ok) throw toTransitionError(check)

  const data: Prisma.OrderUpdateManyMutationInput = { status: to as DbOrderStatus }
  if (to === 'ACCEPTED') data.acceptedAt = now
  if (to === 'READY') data.readyAt = now
  if (to === 'COMPLETED') data.completedAt = now
  if (to === 'CANCELLED' || to === 'REJECTED') {
    data.cancelledAt = now
    data.cancelReason = reason ?? null
  }

  return prisma.$transaction(async (tx) => {
    const result = await tx.order.updateMany({ where: { id: order.id, status: order.status }, data })
    if (result.count !== 1) throw conflict('ORDER_CHANGED', '訂單剛剛已被更新,請重新整理後再試一次')

    // 已收了現金的訂單被取消:把付款標成「已退款」(店家要把錢退給顧客)
    if (to === 'CANCELLED' && paid) {
      for (const payment of order.payments.filter((p) => p.status === 'SUCCEEDED')) {
        const refunded = await getPaymentProvider(payment.provider).refund({
          paymentId: payment.id,
          amount: payment.amount,
          reason: reason ?? '訂單取消',
        })
        await tx.payment.update({ where: { id: payment.id }, data: { status: refunded.status } })
      }
    }

    if (staff) {
      await writeAudit(tx, {
        storeId: order.storeId,
        actorId: staff.id,
        action: `order.${to.toLowerCase()}`,
        entity: 'Order',
        entityId: order.id,
        meta: { from: order.status, to, reason: reason ?? null, orderNumber: order.orderNumber },
      })
    }
    return tx.order.findUniqueOrThrow({ where: { id: order.id }, include: orderInclude })
  })
}

async function findStaffOrder(storeId: string, orderId: string): Promise<OrderRecord> {
  // 一定要帶 storeId:員工只能看到自己店的訂單(避免用別家的訂單 ID 亂猜)
  const order = await prisma.order.findFirst({ where: { id: orderId, storeId }, include: orderInclude })
  if (!order) throw notFound('ORDER_NOT_FOUND', '找不到這張訂單')
  return order
}

export async function changeOrderStatus(
  staff: StaffPrincipal,
  orderId: string,
  to: OrderStatus,
  reason: string | undefined,
  now: Date,
): Promise<OrderRecord> {
  const order = await findStaffOrder(staff.storeId, orderId)
  return applyTransition(order, to, { actor: 'STAFF', reason, now, staff })
}

/** 確認已收現金。只有「已接單 / 製作中 / 可取餐」的訂單可以收款 */
export async function confirmCashPayment(staff: StaffPrincipal, orderId: string, now: Date): Promise<OrderRecord> {
  const order = await findStaffOrder(staff.storeId, orderId)

  const collectable: OrderStatus[] = ['ACCEPTED', 'PREPARING', 'READY']
  if (!collectable.includes(order.status as OrderStatus)) {
    throw conflict('PAYMENT_NOT_ALLOWED', `訂單目前是「${ORDER_STATUS_LABELS[order.status as OrderStatus]}」,不能收款`)
  }
  const payment = order.payments.find((p) => p.method === 'CASH')
  if (!payment) throw conflict('PAYMENT_NOT_ALLOWED', '這張訂單沒有現金付款紀錄')
  if (payment.status === 'SUCCEEDED') throw conflict('ALREADY_PAID', '這張訂單已經收過款了')
  if (payment.status !== 'PENDING') throw conflict('PAYMENT_NOT_ALLOWED', '這筆付款的狀態無法收款')

  const result = await getPaymentProvider(payment.provider).confirmPayment({
    paymentId: payment.id,
    amount: payment.amount,
    confirmedBy: staff.id,
  })

  return prisma.$transaction(async (tx) => {
    const updated = await tx.payment.updateMany({
      where: { id: payment.id, status: 'PENDING' },
      data: { status: result.status, paidAt: now, confirmedById: staff.id },
    })
    if (updated.count !== 1) throw conflict('ALREADY_PAID', '這張訂單已經收過款了')
    await writeAudit(tx, {
      storeId: order.storeId,
      actorId: staff.id,
      action: 'payment.cash_confirm',
      entity: 'Order',
      entityId: order.id,
      meta: { orderNumber: order.orderNumber, amount: payment.amount },
    })
    return tx.order.findUniqueOrThrow({ where: { id: order.id }, include: orderInclude })
  })
}

// ───────────────────────── 店員:查詢 ─────────────────────────

export async function getOrderForStaff(staff: StaffPrincipal, orderId: string): Promise<OrderRecord> {
  return findStaffOrder(staff.storeId, orderId)
}

export interface ListOrdersFilter {
  date?: string
  status?: string
  sort: 'asc' | 'desc'
  page: number
  pageSize: number
}

export async function listOrdersForStaff(staff: StaffPrincipal, filter: ListOrdersFilter, now: Date) {
  const date = filter.date ?? formatTaipeiDate(now)
  const businessDate = new Date(`${date}T00:00:00.000Z`)
  if (Number.isNaN(businessDate.getTime()) || businessDate.toISOString().slice(0, 10) !== date) {
    throw badRequest('INVALID_DATE', '日期不正確,格式必須是 YYYY-MM-DD')
  }

  let statuses: DbOrderStatus[] = []
  if (filter.status) {
    const requested = filter.status.split(',').map((value) => value.trim().toUpperCase()).filter(Boolean)
    const invalid = requested.filter((value) => !(ORDER_STATUSES as readonly string[]).includes(value))
    if (invalid.length > 0) {
      throw badRequest('INVALID_STATUS_FILTER', `不認識的狀態:${invalid.join('、')}`)
    }
    statuses = requested as DbOrderStatus[]
  }

  const baseWhere = { storeId: staff.storeId, businessDate }
  const where: Prisma.OrderWhereInput = statuses.length > 0 ? { ...baseWhere, status: { in: statuses } } : baseWhere

  const [total, orders, grouped] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      include: orderInclude,
      orderBy: [{ createdAt: filter.sort }, { sequence: filter.sort }],
      skip: (filter.page - 1) * filter.pageSize,
      take: filter.pageSize,
    }),
    prisma.order.groupBy({ by: ['status'], where: baseWhere, _count: true }),
  ])

  const counts = Object.fromEntries(ORDER_STATUSES.map((status) => [status, 0])) as Record<string, number>
  for (const row of grouped) counts[row.status] = row._count

  return { date, counts, page: filter.page, pageSize: filter.pageSize, total, orders }
}
