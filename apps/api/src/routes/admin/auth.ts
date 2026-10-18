import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { currentStaff, requireRole, SESSION_COOKIE, sessionCookieOptions } from '../../plugins/auth.js'
import { loginBody, loginResponse, staffProfile } from '../../schemas/auth.js'
import { changePasswordBody } from '../../schemas/staff.js'
import { changeOwnPassword } from '../../services/staffService.js'
import { errorResponse, okResponse } from '../../schemas/common.js'
import { loginStaff, logoutStaff } from '../../services/authService.js'

export const adminAuthRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    '/auth/login',
    {
      schema: {
        tags: ['後台-登入'],
        summary: '員工登入',
        description:
          '成功後,伺服器會設定一個 httpOnly 的 Cookie(`mystore_sid`)當作登入通行證,之後的後台請求瀏覽器會自動帶上。\n\n' +
          '連續輸錯密碼會暫時鎖定帳號。',
        body: loginBody,
        response: { 200: loginResponse, 401: errorResponse, 429: errorResponse },
      },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const result = await loginStaff(request.body, app.clock(), {
        ip: request.ip,
        userAgent: request.headers['user-agent'],
      })
      reply.setCookie(SESSION_COOKIE, result.token, sessionCookieOptions(result.expiresAt))
      return { staff: result.staff }
    },
  )

  app.post(
    '/auth/logout',
    {
      schema: {
        tags: ['後台-登入'],
        summary: '員工登出(通行證立刻失效)',
        response: { 200: okResponse },
      },
    },
    async (request, reply) => {
      await logoutStaff(request.cookies[SESSION_COOKIE])
      reply.clearCookie(SESSION_COOKIE, { ...sessionCookieOptions(new Date(0)), expires: undefined })
      return { ok: true as const }
    },
  )

  app.get(
    '/me',
    {
      schema: {
        tags: ['後台-登入'],
        summary: '目前登入的員工與角色',
        security: [{ cookieAuth: [] }],
        response: { 200: staffProfile, 401: errorResponse },
      },
      onRequest: [requireRole('STAFF')],
    },
    async (request) => {
      const { id, email, name, role, storeId } = currentStaff(request)
      return { id, email, name, role, storeId }
    },
  )

  app.post(
    '/me/password',
    {
      schema: {
        tags: ['後台-登入'],
        summary: '修改自己的密碼',
        description: '新密碼至少 10 個字元。成功後,這個帳號在其他地方的登入都會登出(目前這個保留)。',
        security: [{ cookieAuth: [] }],
        body: changePasswordBody,
        response: { 200: okResponse, 400: errorResponse, 401: errorResponse },
      },
      onRequest: [requireRole('STAFF')],
      config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    },
    async (request) => {
      await changeOwnPassword(currentStaff(request), request.body)
      return { ok: true as const }
    },
  )
}
