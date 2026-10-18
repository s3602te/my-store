import { assertInteger } from '../../lib/money.js'
import type {
  ConfirmPaymentInput,
  CreatePaymentInput,
  PaymentProvider,
  PaymentResult,
  RefundPaymentInput,
} from './PaymentProvider.js'

/**
 * 現金付款(到店付款)。
 * 不會連到任何外部服務:建立 = 待收款;店員確認收到現金 = 成功。
 * 資料庫的讀寫由訂單服務負責(Phase 2),這裡只決定「付款狀態該變成什麼」。
 */
export class CashPaymentProvider implements PaymentProvider {
  readonly name = 'cash'
  readonly method = 'CASH' as const

  async createPayment(input: CreatePaymentInput): Promise<PaymentResult> {
    return this.result('PENDING', input.amount)
  }

  async confirmPayment(input: ConfirmPaymentInput): Promise<PaymentResult> {
    return this.result('SUCCEEDED', input.amount)
  }

  async refund(input: RefundPaymentInput): Promise<PaymentResult> {
    // 現金退款是店家親手把錢還給顧客,系統只記錄
    return this.result('REFUNDED', input.amount)
  }

  private result(status: PaymentResult['status'], amount: number): PaymentResult {
    assertInteger(amount)
    if (amount < 0) throw new RangeError('金額不可為負數')
    return {
      provider: this.name,
      method: this.method,
      status,
      amount,
      providerRef: null,
      redirectUrl: null,
    }
  }
}
