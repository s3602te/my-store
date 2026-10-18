/** 下單的上限(防止惡意灌單、打錯字造成離譜的訂單) */

/** 一張訂單最多幾個品項(不同的列) */
export const MAX_ORDER_LINES = 30
/** 單一品項的數量上限 */
export const MAX_LINE_QUANTITY = 20
/** 一張訂單的總額上限(新台幣元) */
export const MAX_ORDER_TOTAL = 20_000
/** 同一支電話同時最多幾張「待接單」的訂單 */
export const MAX_PENDING_ORDERS_PER_PHONE = 3
/** 允許取餐時間比「現在 + 備餐時間」早多少毫秒(容許網路延遲造成的誤差) */
export const PICKUP_TOLERANCE_MS = 60_000
