/**
 * 金額工具。
 * 規則:所有金額都是「新台幣元」的**整數**(TWD 沒有分,不使用小數,避免浮點誤差)。
 */

/** 確認是安全的整數,否則丟出錯誤(避免 0.1 + 0.2 這類問題混進資料庫) */
export function assertInteger(value: number, label = '金額'): number {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${label}必須是整數,收到:${value}`)
  }
  return value
}

/** 加總多筆金額 */
export function sumMoney(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + assertInteger(value), 0)
}

/**
 * 計算一個品項的小計:(單價 + 所有選項加價) × 數量
 * 例如:牛肉麵 180 + 加蛋 20 + 加肉 50,數量 2 → (180 + 20 + 50) × 2 = 500
 */
export function calcLineTotal(
  unitPrice: number,
  optionPriceDeltas: readonly number[],
  quantity: number,
): number {
  assertInteger(unitPrice, '單價')
  assertInteger(quantity, '數量')
  if (unitPrice < 0) throw new RangeError('單價不可為負數')
  if (quantity <= 0) throw new RangeError('數量必須大於 0')
  return (unitPrice + sumMoney(optionPriceDeltas)) * quantity
}

/** 格式化成 NT$ 1,000 */
export function formatTWD(value: number): string {
  return `NT$ ${assertInteger(value).toLocaleString('en-US')}`
}
