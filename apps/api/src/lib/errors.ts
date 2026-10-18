/**
 * 「預期中的錯誤」:例如餐點售完、密碼錯誤、狀態不能這樣改。
 * 丟出 AppError,錯誤處理器會把它轉成統一格式回給前端:
 *   { "error": { "code": "ITEM_SOLD_OUT", "message": "「蛋餅」今日已售完" } }
 * 前端用 code 判斷是哪種錯誤,用 message 顯示給使用者看(繁體中文)。
 */
export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export const badRequest = (code: string, message: string) => new AppError(400, code, message)
export const unauthorized = (message = '請先登入') => new AppError(401, 'UNAUTHENTICATED', message)
export const forbidden = (message = '權限不足,無法執行這個操作') => new AppError(403, 'FORBIDDEN', message)
export const notFound = (code: string, message: string) => new AppError(404, code, message)
export const conflict = (code: string, message: string) => new AppError(409, code, message)
export const tooMany = (code: string, message: string) => new AppError(429, code, message)
