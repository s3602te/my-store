import { describe, expect, it } from 'vitest'
import { NoopInvoiceProvider } from '../src/modules/invoices/NoopInvoiceProvider.js'
import { CashPaymentProvider } from '../src/modules/payments/CashPaymentProvider.js'
import { getPaymentProvider } from '../src/modules/payments/index.js'

describe('現金付款提供者', () => {
  const cash = new CashPaymentProvider()

  it('建立付款 = 待收款,沒有金流編號', async () => {
    const result = await cash.createPayment({ orderId: 'o1', amount: 250 })
    expect(result).toMatchObject({ provider: 'cash', method: 'CASH', status: 'PENDING', amount: 250, providerRef: null })
  })

  it('店員確認收款 = 成功', async () => {
    const result = await cash.confirmPayment({ paymentId: 'p1', amount: 250, confirmedBy: 'staff1' })
    expect(result.status).toBe('SUCCEEDED')
  })

  it('退款 = 已退款', async () => {
    const result = await cash.refund({ paymentId: 'p1', amount: 250, reason: '顧客取消' })
    expect(result.status).toBe('REFUNDED')
  })

  it('金額必須是非負整數', async () => {
    await expect(cash.createPayment({ orderId: 'o1', amount: 10.5 })).rejects.toThrow()
    await expect(cash.createPayment({ orderId: 'o1', amount: -1 })).rejects.toThrow()
  })

  it('可以用名稱取得提供者;不存在的名稱會報錯', () => {
    expect(getPaymentProvider('cash').name).toBe('cash')
    expect(() => getPaymentProvider('not-exist')).toThrow()
  })
})

describe('發票提供者(目前不串接)', () => {
  const noop = new NoopInvoiceProvider()

  it('開立與作廢都回報「不需要」,不產生發票號碼', async () => {
    expect(await noop.issue({ orderId: 'o1', total: 100 })).toEqual({ provider: 'none', status: 'NOT_REQUIRED', invoiceNumber: null })
    expect(await noop.void('AB12345678', '測試')).toMatchObject({ status: 'NOT_REQUIRED' })
  })
})
