import { createHash, randomBytes } from 'node:crypto'
import { hash } from '@node-rs/argon2'

/** 產生不可猜測的隨機字串(192 位元,編成 32 個英數字元),用在訂單追蹤碼與登入通行證 */
export function generateToken(bytes = 24): string {
  return randomBytes(bytes).toString('base64url')
}

/** 把通行證雜湊後再存進資料庫(SHA-256)。資料庫外洩時,不能直接拿雜湊值去登入 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** 訂單追蹤碼的格式:英數字、底線、減號,長度 20~64。格式不對就不用去查資料庫 */
export const TRACKING_TOKEN_PATTERN = /^[A-Za-z0-9_-]{20,64}$/

let dummyHashPromise: Promise<string> | undefined

/**
 * 一個「假的」密碼雜湊。帳號不存在時,也拿它做一次密碼驗證,
 * 讓「帳號不存在」和「密碼錯誤」花的時間差不多,別人無法靠回應時間猜出哪些帳號存在。
 */
export function getDummyPasswordHash(): Promise<string> {
  dummyHashPromise ??= hash(generateToken())
  return dummyHashPromise
}

/** 電話遮罩:0912345678 → 0912***678(追蹤頁不顯示完整電話) */
export function maskPhone(phone: string): string {
  if (phone.length < 8) return '***'
  return `${phone.slice(0, 4)}***${phone.slice(-3)}`
}
