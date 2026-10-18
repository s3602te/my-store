import type { FastifyReply, FastifyRequest, onRequestAsyncHookHandler } from 'fastify'
import { config } from '../config.js'
import { prisma } from '../db.js'
import type { StaffRole } from '../generated/prisma/enums.js'
import { forbidden, unauthorized } from '../lib/errors.js'
import { hashToken } from '../lib/security.js'

/** 瀏覽器 Cookie 的名稱(登入通行證) */
export const SESSION_COOKIE = 'mystore_sid'

/** 通行證的「最後使用時間」最多每幾分鐘更新一次(避免每個請求都寫資料庫) */
const TOUCH_INTERVAL_MS = 5 * 60 * 1000

/** 目前登入的員工(由登入檢查塞進 request.staff) */
export interface StaffPrincipal {
  id: string
  storeId: string
  email: string
  name: string
  role: StaffRole
  sessionId: string
}

declare module 'fastify' {
  interface FastifyRequest {
    staff?: StaffPrincipal
  }
  interface FastifyInstance {
    /** 取得「現在時間」;測試時可以換成固定的時間 */
    clock: () => Date
  }
}

const ROLE_RANK: Record<StaffRole, number> = { STAFF: 1, MANAGER: 2, OWNER: 3 }

export function hasRole(role: StaffRole, minRole: StaffRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minRole]
}

/** 瀏覽器設定通行證 Cookie 的選項(httpOnly:網頁裡的 JavaScript 讀不到,擋掉 XSS 偷 Cookie) */
export function sessionCookieOptions(expires: Date) {
  return {
    path: '/',
    httpOnly: true,
    sameSite: config.cookieSameSite,
    // SameSite=None 的 Cookie 瀏覽器規定一定要 Secure(HTTPS)
    secure: config.isProduction || config.cookieSameSite === 'none',
    expires,
  }
}

/**
 * 登入檢查。放在路由的 onRequest(在解析內容、驗證格式之前就檢查,沒登入的人一律先得到 401):
 *   onRequest: requireRole('MANAGER')   → 店長以上才能執行
 */
export function requireRole(minRole: StaffRole): onRequestAsyncHookHandler {
  return async function authenticate(this, request: FastifyRequest, _reply: FastifyReply) {
    const token = request.cookies[SESSION_COOKIE]
    if (!token) throw unauthorized()

    const now = this.clock()
    const session = await prisma.staffSession.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { staffUser: true },
    })

    if (!session || session.expiresAt <= now || !session.staffUser.isActive) {
      if (session && session.expiresAt <= now) {
        await prisma.staffSession.delete({ where: { id: session.id } }).catch(() => undefined)
      }
      throw unauthorized('登入已過期,請重新登入')
    }

    if (now.getTime() - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
      await prisma.staffSession.update({ where: { id: session.id }, data: { lastSeenAt: now } }).catch(() => undefined)
    }

    const staff = session.staffUser
    request.staff = {
      id: staff.id,
      storeId: staff.storeId,
      email: staff.email,
      name: staff.name,
      role: staff.role,
      sessionId: session.id,
    }

    if (!hasRole(staff.role, minRole)) throw forbidden()
  }
}

/** 取出已登入的員工(requireRole 通過後一定有值) */
export function currentStaff(request: FastifyRequest): StaffPrincipal {
  if (!request.staff) throw unauthorized()
  return request.staff
}

/**
 * 防止「跨網站偽造請求」(CSRF)的第二道防線:
 * 會改變資料的請求(POST/PATCH/DELETE),如果帶有 Origin,必須是我們允許的網址。
 * 瀏覽器在跨網站請求時一定會帶 Origin,所以別的網站沒辦法偷偷借用你的登入狀態。
 * (沒有 Origin 的請求,例如 curl、Postman,不受影響。)
 */
export function allowedOrigins(): string[] {
  return [...config.corsOrigins, `http://127.0.0.1:${config.port}`, `http://localhost:${config.port}`]
}

export async function checkOrigin(request: FastifyRequest) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return
  const origin = request.headers.origin
  if (origin && !allowedOrigins().includes(origin)) {
    throw forbidden('不允許的來源網站')
  }
}
