/** 顯示給顧客與店員看的訂單編號:A001、A002 …(每家店每天從 1 重新計數) */
export function formatOrderNumber(sequence: number): string {
  return `A${String(sequence).padStart(3, '0')}`
}
