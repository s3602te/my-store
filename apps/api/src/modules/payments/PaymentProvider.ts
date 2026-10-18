/**
 * 付款「提供者」介面。
 *
 * 訂單程式只依賴這個介面,不知道背後是現金、還是綠界、藍新、LINE Pay。
 * 日後要串接線上金流:新增一個實作這個介面的檔案,再到 index.ts 登記即可,不必改訂單程式。
 */

export type PaymentStatus = 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'REFUNDED'

export type PaymentMethod = 'CASH' // 之後會加:'CARD' | 'LINE_PAY' ...

export interface CreatePaymentInput {
  orderId: string
  /** 金額(新台幣元,整數) */
  amount: number
  /** 冪等鍵:同一把鍵重複呼叫,不能造成重複扣款 */
  idempotencyKey?: string
}

export interface PaymentResult {
  provider: string
  method: PaymentMethod
  status: PaymentStatus
  amount: number
  /** 金流那邊的交易編號(現金沒有) */
  providerRef: string | null
  /** 線上金流需要把顧客導到付款頁時使用(現金沒有) */
  redirectUrl: string | null
}

export interface ConfirmPaymentInput {
  paymentId: string
  amount: number
  /** 誰確認收款(現金:店員 ID;線上金流:通常是 'webhook') */
  confirmedBy: string
}

export interface RefundPaymentInput {
  paymentId: string
  amount: number
  reason: string
}

export interface PaymentProvider {
  /** 識別名稱,會存進 Payment.provider,例如 'cash' */
  readonly name: string
  readonly method: PaymentMethod

  /** 建立一筆付款(現金:建立「待收款」) */
  createPayment(input: CreatePaymentInput): Promise<PaymentResult>
  /** 確認收款成功(現金:店員按「已收現金」;線上金流:驗證 webhook 之後) */
  confirmPayment(input: ConfirmPaymentInput): Promise<PaymentResult>
  /** 退款 */
  refund(input: RefundPaymentInput): Promise<PaymentResult>
}
