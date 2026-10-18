import { describe, expect, it } from 'vitest'
import { assertInteger, calcLineTotal, formatTWD, sumMoney } from '../src/lib/money.js'

describe('金額工具(整數新台幣)', () => {
  it('加總正確', () => {
    expect(sumMoney([100, 20, 5])).toBe(125)
    expect(sumMoney([])).toBe(0)
  })

  it('小數會被拒絕,避免浮點誤差', () => {
    expect(() => assertInteger(0.1 + 0.2)).toThrow(RangeError)
    expect(() => sumMoney([10, 2.5])).toThrow(RangeError)
  })

  it('品項小計 = (單價 + 選項加價) × 數量', () => {
    // 牛肉麵 180 + 加蛋 20 + 加肉 50,數量 2
    expect(calcLineTotal(180, [20, 50], 2)).toBe(500)
    expect(calcLineTotal(100, [], 1)).toBe(100)
  })

  it('數量必須大於 0、單價不可為負', () => {
    expect(() => calcLineTotal(100, [], 0)).toThrow()
    expect(() => calcLineTotal(100, [], -1)).toThrow()
    expect(() => calcLineTotal(-1, [], 1)).toThrow()
  })

  it('格式化成 NT$ 1,000', () => {
    expect(formatTWD(1000)).toBe('NT$ 1,000')
    expect(formatTWD(0)).toBe('NT$ 0')
  })
})
