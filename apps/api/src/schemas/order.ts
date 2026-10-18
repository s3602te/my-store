import { z } from 'zod'
import { MAX_LINE_QUANTITY, MAX_ORDER_LINES } from '../lib/limits.js'
import { ORDER_STATUSES } from '../lib/orderStatus.js'
import { dateTime, nullableDateTime } from './common.js'

const orderStatus = z.enum(ORDER_STATUSES)
const paymentStatus = z.enum(['PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED'])

// ───────────── 顧客下單(輸入)─────────────
// 注意:這裡「沒有任何價格欄位」。價格全部由後端依資料庫重新計算。

export const createOrderBody = z.object({
  customerName: z.string().trim().min(1, '請填寫姓名').max(50, '姓名太長了'),
  customerPhone: z.string().regex(/^09\d{8}$/, '請輸入正確的手機號碼(09 開頭,共 10 碼數字)'),
  /** 預計取餐時間;不填 = 盡快(現在 + 備餐時間) */
  pickupAt: z.iso.datetime({ offset: true, error: '取餐時間格式不正確' }).optional(),
  note: z.string().trim().max(200, '備註太長了(最多 200 字)').optional(),
  items: z
    .array(
      z.object({
        menuItemId: z.uuid('餐點代碼格式不正確'),
        quantity: z.number().int('數量必須是整數').min(1, '數量至少 1').max(MAX_LINE_QUANTITY, `單一品項最多 ${MAX_LINE_QUANTITY} 份`),
        optionIds: z.array(z.uuid('選項代碼格式不正確')).max(20).default([]),
        note: z.string().trim().max(100, '品項備註太長了(最多 100 字)').optional(),
      }),
    )
    .min(1, '請至少選一個餐點')
    .max(MAX_ORDER_LINES, `一張訂單最多 ${MAX_ORDER_LINES} 個品項`),
})
export type CreateOrderInput = z.infer<typeof createOrderBody>

/** 防止「重複送出」的鍵(選填):同一把鍵重複送,只會建立一張訂單 */
export const idempotencyHeaders = z.object({
  'idempotency-key': z.string().min(16, 'Idempotency-Key 至少 16 字元').max(100).optional(),
})

export const trackingParams = z.object({
  token: z.string().describe('訂單追蹤碼(下單成功時回傳的 32 字元隨機字串)'),
})

// ───────────── 訂單(輸出)─────────────

const orderItemOut = z.object({
  name: z.string().describe('品名(下單當下的快照)'),
  unitPrice: z.number().int().describe('單價(下單當下的快照)'),
  quantity: z.number().int(),
  note: z.string().nullable(),
  lineTotal: z.number().int().describe('此品項小計 = (單價 + 選項加價) × 數量'),
  options: z.array(
    z.object({
      group: z.string().describe('選項群組,例如「大小」'),
      name: z.string().describe('選項,例如「大」'),
      priceDelta: z.number().int(),
    }),
  ),
})

const orderBase = z.object({
  orderNumber: z.string().describe('訂單編號,例如 A001(每天從 1 開始)'),
  status: orderStatus,
  fulfillmentType: z.enum(['TAKEOUT', 'DINE_IN', 'DELIVERY']),
  customerName: z.string(),
  note: z.string().nullable(),
  pickupAt: nullableDateTime,
  subtotal: z.number().int(),
  discount: z.number().int(),
  total: z.number().int(),
  paymentMethod: z.enum(['CASH']),
  paymentStatus: paymentStatus,
  cancelReason: z.string().nullable(),
  createdAt: dateTime,
  acceptedAt: nullableDateTime,
  readyAt: nullableDateTime,
  completedAt: nullableDateTime,
  cancelledAt: nullableDateTime,
  items: z.array(orderItemOut),
})

/** 顧客看到的訂單(電話只顯示一部分) */
export const publicOrder = orderBase.extend({
  trackingToken: z.string(),
  customerPhone: z.string().describe('已遮罩的電話,例如 0912***678'),
})
export type PublicOrder = z.infer<typeof publicOrder>

export const createOrderResponse = z.object({
  order: publicOrder,
  /** true = 這是先前同一把 Idempotency-Key 已經建立過的訂單(沒有重複建立) */
  duplicate: z.boolean(),
})

/** 店員看到的訂單(完整電話、付款與發票資訊) */
export const adminOrder = orderBase.extend({
  id: z.uuid(),
  businessDate: z.string().describe('營業日 YYYY-MM-DD'),
  customerPhone: z.string(),
  customerId: z.uuid().nullable(),
  payments: z.array(
    z.object({
      id: z.uuid(),
      provider: z.string(),
      method: z.string(),
      status: paymentStatus,
      amount: z.number().int(),
      paidAt: nullableDateTime,
      confirmedById: z.uuid().nullable(),
    }),
  ),
  invoice: z
    .object({ status: z.enum(['NOT_REQUIRED', 'PENDING', 'ISSUED', 'VOIDED']), invoiceNumber: z.string().nullable() })
    .nullable(),
})
export type AdminOrder = z.infer<typeof adminOrder>

// ───────────── 後台操作 ─────────────

export const customerCancelBody = z
  .object({
    reason: z.string().trim().max(200).optional().describe('取消原因(選填,沒填會記為「顧客自行取消」)'),
  })
  .nullish() // 內容可以完全不送

export const staffReasonBody = z.object({
  reason: z.string().trim().min(1, '請填寫原因').max(200, '原因太長了(最多 200 字)'),
})

export const staffStatusBody = z.object({
  status: orderStatus.exclude(['PENDING']).describe('要變成的狀態'),
  reason: z.string().trim().max(200).optional().describe('取消/拒絕時必填'),
})

export const listOrdersQuery = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式必須是 YYYY-MM-DD').optional().describe('營業日,不填 = 今天'),
  status: z.string().optional().describe('狀態篩選,可用逗號分隔多個,例如 PENDING,ACCEPTED'),
  sort: z.enum(['asc', 'desc']).default('desc').describe('依建立時間排序'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
})

export const listOrdersResponse = z.object({
  date: z.string(),
  counts: z.record(z.string(), z.number().int()).describe('當天各狀態的訂單數(不受 status 篩選影響)'),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  orders: z.array(adminOrder),
})
