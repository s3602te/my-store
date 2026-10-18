/**
 * 訂單狀態機:規定訂單「只能」依下面的規則改變狀態。
 * 詳細說明見 docs/02-order-flow.md。
 *
 * 待接單 PENDING → 已接單 ACCEPTED → 製作中 PREPARING → 可取餐 READY → 已完成 COMPLETED
 * 另外可以:已取消 CANCELLED、店家拒絕 REJECTED(都是終點,必須填原因)
 */

export const ORDER_STATUSES = [
  'PENDING',
  'ACCEPTED',
  'PREPARING',
  'READY',
  'COMPLETED',
  'CANCELLED',
  'REJECTED',
] as const

export type OrderStatus = (typeof ORDER_STATUSES)[number]

/** 誰在操作:顧客(用追蹤連結)或店員(後台登入者) */
export type Actor = 'CUSTOMER' | 'STAFF'

interface Rule {
  to: OrderStatus
  /** 哪些人可以做這個轉換 */
  actors: readonly Actor[]
  /** 是否必須填原因 */
  requiresReason?: boolean
  /** 是否必須已收款(現金已收) */
  requiresPaid?: boolean
}

const RULES: Record<OrderStatus, readonly Rule[]> = {
  PENDING: [
    { to: 'ACCEPTED', actors: ['STAFF'] },
    { to: 'REJECTED', actors: ['STAFF'], requiresReason: true },
    // 顧客只能在「待接單」階段自己取消
    { to: 'CANCELLED', actors: ['CUSTOMER', 'STAFF'], requiresReason: true },
  ],
  ACCEPTED: [
    { to: 'PREPARING', actors: ['STAFF'] },
    { to: 'CANCELLED', actors: ['STAFF'], requiresReason: true },
  ],
  PREPARING: [
    { to: 'READY', actors: ['STAFF'] },
    { to: 'CANCELLED', actors: ['STAFF'], requiresReason: true },
  ],
  READY: [
    { to: 'COMPLETED', actors: ['STAFF'], requiresPaid: true },
    { to: 'CANCELLED', actors: ['STAFF'], requiresReason: true },
  ],
  COMPLETED: [],
  CANCELLED: [],
  REJECTED: [],
}

export type TransitionCheck =
  | { ok: true }
  | { ok: false; code: 'INVALID_TRANSITION' | 'NOT_ALLOWED' | 'REASON_REQUIRED' | 'PAYMENT_REQUIRED'; message: string }

export interface TransitionContext {
  actor: Actor
  reason?: string | null
  /** 這筆訂單的現金是否已經收了 */
  paid?: boolean
}

export function isTerminal(status: OrderStatus): boolean {
  return RULES[status].length === 0
}

/** 從這個狀態「理論上」可以去哪些狀態 */
export function nextStatuses(from: OrderStatus): OrderStatus[] {
  return RULES[from].map((rule) => rule.to)
}

/** 檢查某個狀態轉換是否合法;不合法會回傳明確的錯誤代碼與訊息 */
export function checkTransition(from: OrderStatus, to: OrderStatus, ctx: TransitionContext): TransitionCheck {
  const rule = RULES[from].find((r) => r.to === to)

  if (!rule) {
    return { ok: false, code: 'INVALID_TRANSITION', message: `訂單不能從 ${from} 變成 ${to}` }
  }
  if (!rule.actors.includes(ctx.actor)) {
    return { ok: false, code: 'NOT_ALLOWED', message: `${ctx.actor === 'CUSTOMER' ? '顧客' : '店員'}無法執行這個操作` }
  }
  if (rule.requiresReason && !ctx.reason?.trim()) {
    return { ok: false, code: 'REASON_REQUIRED', message: '請填寫原因' }
  }
  if (rule.requiresPaid && !ctx.paid) {
    return { ok: false, code: 'PAYMENT_REQUIRED', message: '尚未收款,不能完成訂單' }
  }
  return { ok: true }
}
