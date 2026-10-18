import { CashPaymentProvider } from './CashPaymentProvider.js'
import type { PaymentProvider } from './PaymentProvider.js'

export type { PaymentProvider } from './PaymentProvider.js'

/**
 * 付款提供者登記表。
 * 日後串接金流:在這裡加一行,例如  ecpay: new EcpayPaymentProvider(),
 */
const providers: Record<string, PaymentProvider> = {
  cash: new CashPaymentProvider(),
}

export function getPaymentProvider(name: string): PaymentProvider {
  const provider = providers[name]
  if (!provider) throw new Error(`找不到付款提供者:${name}`)
  return provider
}

/** 目前開放給顧客使用的付款方式(MVP 只有現金) */
export const DEFAULT_PAYMENT_PROVIDER = 'cash'
