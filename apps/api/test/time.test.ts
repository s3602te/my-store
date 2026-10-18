import { describe, expect, it } from 'vitest'
import { formatOrderNumber } from '../src/lib/orderNumber.js'
import { businessDateOf, formatTaipeiDate, hhmmToMinutes, isWithinHours, minutesOfDay, taipeiTimeOnSameDay } from '../src/lib/time.js'

describe('時間工具(台北時間 UTC+8)', () => {
  it('營業日以台北時間計算:UTC 的晚上 8 點之後,在台北已經是隔天', () => {
    // UTC 2026-10-20 15:59 = 台北 23:59(還是 20 日)
    expect(formatTaipeiDate(new Date('2026-10-20T15:59:00Z'))).toBe('2026-10-20')
    // UTC 2026-10-20 16:00 = 台北 00:00(已經是 21 日)
    expect(formatTaipeiDate(new Date('2026-10-20T16:00:00Z'))).toBe('2026-10-21')
    expect(businessDateOf(new Date('2026-10-20T16:30:00Z')).toISOString()).toBe('2026-10-21T00:00:00.000Z')
  })

  it('HH:mm 與分鐘數互相換算', () => {
    expect(hhmmToMinutes('06:30')).toBe(390)
    expect(minutesOfDay(new Date('2026-10-20T01:05:00Z'))).toBe(9 * 60 + 5) // 台北 09:05
  })

  it('把「當天的 HH:mm」換成絕對時間', () => {
    const now = new Date('2026-10-20T01:00:00Z') // 台北 09:00
    expect(taipeiTimeOnSameDay(now, '13:00').toISOString()).toBe('2026-10-20T05:00:00.000Z')
    expect(taipeiTimeOnSameDay(now, '06:00').toISOString()).toBe('2026-10-19T22:00:00.000Z')
  })

  it('營業時間:含開始、不含結束', () => {
    const at = (hhmm: string) => taipeiTimeOnSameDay(new Date('2026-10-20T01:00:00Z'), hhmm)
    expect(isWithinHours(at('06:00'), '06:00', '13:00')).toBe(true)
    expect(isWithinHours(at('12:59'), '06:00', '13:00')).toBe(true)
    expect(isWithinHours(at('13:00'), '06:00', '13:00')).toBe(false)
    expect(isWithinHours(at('05:59'), '06:00', '13:00')).toBe(false)
  })
})

describe('訂單編號', () => {
  it('A001、A002…,超過 999 也不會壞', () => {
    expect(formatOrderNumber(1)).toBe('A001')
    expect(formatOrderNumber(42)).toBe('A042')
    expect(formatOrderNumber(1000)).toBe('A1000')
  })
})
