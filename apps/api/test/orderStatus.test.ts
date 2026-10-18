import { describe, expect, it } from 'vitest'
import { checkTransition, isTerminal, nextStatuses, ORDER_STATUSES, type OrderStatus } from '../src/lib/orderStatus.js'

const staff = { actor: 'STAFF' as const }

describe('訂單狀態機', () => {
  it('正常流程:待接單 → 已接單 → 製作中 → 可取餐 → 已完成', () => {
    expect(checkTransition('PENDING', 'ACCEPTED', staff).ok).toBe(true)
    expect(checkTransition('ACCEPTED', 'PREPARING', staff).ok).toBe(true)
    expect(checkTransition('PREPARING', 'READY', staff).ok).toBe(true)
    expect(checkTransition('READY', 'COMPLETED', { ...staff, paid: true }).ok).toBe(true)
  })

  it('不能跳級:待接單不能直接變已完成', () => {
    const result = checkTransition('PENDING', 'COMPLETED', { ...staff, paid: true })
    expect(result).toMatchObject({ ok: false, code: 'INVALID_TRANSITION' })
  })

  it('不能倒退:製作中不能回到已接單', () => {
    expect(checkTransition('PREPARING', 'ACCEPTED', staff)).toMatchObject({ ok: false, code: 'INVALID_TRANSITION' })
  })

  it('終點狀態不能再改變', () => {
    for (const status of ['COMPLETED', 'CANCELLED', 'REJECTED'] as OrderStatus[]) {
      expect(isTerminal(status)).toBe(true)
      expect(nextStatuses(status)).toEqual([])
    }
  })

  it('還沒收現金,不能完成訂單', () => {
    expect(checkTransition('READY', 'COMPLETED', { ...staff, paid: false })).toMatchObject({
      ok: false,
      code: 'PAYMENT_REQUIRED',
    })
  })

  it('拒單與取消必須填原因', () => {
    expect(checkTransition('PENDING', 'REJECTED', staff)).toMatchObject({ ok: false, code: 'REASON_REQUIRED' })
    expect(checkTransition('PENDING', 'REJECTED', { ...staff, reason: '   ' })).toMatchObject({ ok: false, code: 'REASON_REQUIRED' })
    expect(checkTransition('PENDING', 'REJECTED', { ...staff, reason: '今日售完' }).ok).toBe(true)
  })

  it('顧客只能在「待接單」階段取消,且不能接單或推進狀態', () => {
    const customer = { actor: 'CUSTOMER' as const, reason: '不想要了' }
    expect(checkTransition('PENDING', 'CANCELLED', customer).ok).toBe(true)
    expect(checkTransition('ACCEPTED', 'CANCELLED', customer)).toMatchObject({ ok: false, code: 'NOT_ALLOWED' })
    expect(checkTransition('PENDING', 'ACCEPTED', customer)).toMatchObject({ ok: false, code: 'NOT_ALLOWED' })
  })

  it('每個狀態都有定義規則', () => {
    for (const status of ORDER_STATUSES) {
      expect(() => nextStatuses(status)).not.toThrow()
    }
  })
})
