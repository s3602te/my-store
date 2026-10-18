import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '../src/db.js'
import { hashToken } from '../src/lib/security.js'
import { SESSION_COOKIE } from '../src/plugins/auth.js'
import { createFixture, createTestApp, json, loginCookie, PASSWORD, resetDatabase, type Fixture } from './helpers.js'

let fx: Fixture
let ctx: Awaited<ReturnType<typeof createTestApp>>

beforeEach(async () => {
  await resetDatabase()
  fx = await createFixture()
  ctx = await createTestApp()
})
afterAll(async () => {
  await ctx?.app.close()
  await prisma.$disconnect()
})

const login = (email: string, password: string, headers: Record<string, string> = {}) =>
  ctx.app.inject({ method: 'POST', url: '/api/admin/auth/login', payload: { email, password }, headers })

describe('員工登入', () => {
  it('登入成功:回傳員工資料,並設定 httpOnly 的 Cookie', async () => {
    const response = await login('manager@test.local', PASSWORD)
    expect(response.statusCode).toBe(200)
    expect(json(response).staff).toMatchObject({ email: 'manager@test.local', role: 'MANAGER', name: '店長' })

    const cookie = [response.headers['set-cookie']].flat().find((c) => c?.startsWith(SESSION_COOKIE))!
    expect(cookie).toMatch(/HttpOnly/i)
    expect(cookie).toMatch(/SameSite=Lax/i)
    expect(cookie).toMatch(/Path=\//)
  })

  it('回應裡絕對不會出現密碼或雜湊', async () => {
    const response = await login('owner@test.local', PASSWORD)
    expect(response.body).not.toMatch(/passwordHash|argon2|password/i)
  })

  it('email 不分大小寫、前後空白會被忽略', async () => {
    expect((await login('  OWNER@Test.Local ', PASSWORD)).statusCode).toBe(200)
  })

  it('資料庫只存通行證的雜湊,不存原始值', async () => {
    const cookie = await loginCookie(ctx.app, 'staff@test.local')
    const token = cookie.split('=')[1]
    const sessions = await prisma.staffSession.findMany()
    expect(sessions).toHaveLength(1)
    expect(sessions[0].tokenHash).toBe(hashToken(token))
    expect(sessions[0].tokenHash).not.toBe(token)
  })

  it('密碼錯誤與帳號不存在,回應完全一樣(不透露帳號是否存在)', async () => {
    const wrongPassword = await login('owner@test.local', 'wrong-password')
    const unknownUser = await login('nobody@test.local', 'wrong-password')
    expect(wrongPassword.statusCode).toBe(401)
    expect(unknownUser.statusCode).toBe(401)
    expect(wrongPassword.body).toBe(unknownUser.body)
    expect(json(wrongPassword).error.code).toBe('INVALID_CREDENTIALS')
  })

  it('已停用的帳號不能登入,訊息和密碼錯誤一樣', async () => {
    await prisma.staffUser.update({ where: { id: fx.staff.staff.id }, data: { isActive: false } })
    const response = await login('staff@test.local', PASSWORD)
    expect(response.statusCode).toBe(401)
    expect(json(response).error.code).toBe('INVALID_CREDENTIALS')
  })

  it('連續輸錯 5 次就鎖定帳號,鎖定期間連正確密碼也不能登入;時間到了可以再登入', async () => {
    for (let i = 0; i < 5; i += 1) {
      expect((await login('staff@test.local', 'wrong')).statusCode).toBe(401)
    }
    const locked = await login('staff@test.local', PASSWORD)
    expect(locked.statusCode).toBe(429)
    expect(json(locked).error.code).toBe('ACCOUNT_LOCKED')
    expect(json(locked).error.message).toMatch(/分鐘/)

    // 15 分鐘後解鎖
    ctx.clock.current = new Date(ctx.clock.current.getTime() + 16 * 60_000)
    expect((await login('staff@test.local', PASSWORD)).statusCode).toBe(200)
  })

  it('輸錯幾次之後輸入正確密碼,失敗次數會歸零', async () => {
    for (let i = 0; i < 3; i += 1) await login('staff@test.local', 'wrong')
    expect((await login('staff@test.local', PASSWORD)).statusCode).toBe(200)
    const staff = await prisma.staffUser.findUniqueOrThrow({ where: { id: fx.staff.staff.id } })
    expect(staff.failedLoginCount).toBe(0)
  })

  it('登入與失敗都會寫稽核日誌', async () => {
    await login('staff@test.local', 'wrong')
    await login('staff@test.local', PASSWORD)
    const actions = (await prisma.auditLog.findMany({ orderBy: { createdAt: 'asc' } })).map((row) => row.action)
    expect(actions).toEqual(['auth.login_failed', 'auth.login'])
  })

  it('輸入格式不對:400', async () => {
    const response = await ctx.app.inject({ method: 'POST', url: '/api/admin/auth/login', payload: { email: '' } })
    expect(response.statusCode).toBe(400)
    expect(json(response).error.code).toBe('VALIDATION_ERROR')
  })
})

describe('登入狀態', () => {
  it('沒登入:401;登入後 /me 回傳自己的資料', async () => {
    expect((await ctx.app.inject({ method: 'GET', url: '/api/admin/me' })).statusCode).toBe(401)
    const cookie = await loginCookie(ctx.app, 'owner@test.local')
    const me = await ctx.app.inject({ method: 'GET', url: '/api/admin/me', headers: { cookie } })
    expect(me.statusCode).toBe(200)
    expect(json(me)).toMatchObject({ email: 'owner@test.local', role: 'OWNER', storeId: fx.store.id })
  })

  it('亂填的通行證:401', async () => {
    const response = await ctx.app.inject({ method: 'GET', url: '/api/admin/me', headers: { cookie: `${SESSION_COOKIE}=not-a-real-token` } })
    expect(response.statusCode).toBe(401)
  })

  it('登出之後,同一張通行證立刻失效', async () => {
    const cookie = await loginCookie(ctx.app, 'owner@test.local')
    const logout = await ctx.app.inject({ method: 'POST', url: '/api/admin/auth/logout', headers: { cookie } })
    expect(logout.statusCode).toBe(200)
    expect(await prisma.staffSession.count()).toBe(0)
    expect((await ctx.app.inject({ method: 'GET', url: '/api/admin/me', headers: { cookie } })).statusCode).toBe(401)
  })

  it('通行證過期(預設 12 小時)後失效,並從資料庫清掉', async () => {
    const cookie = await loginCookie(ctx.app, 'owner@test.local')
    ctx.clock.current = new Date(ctx.clock.current.getTime() + 13 * 60 * 60_000)
    const response = await ctx.app.inject({ method: 'GET', url: '/api/admin/me', headers: { cookie } })
    expect(response.statusCode).toBe(401)
    expect(await prisma.staffSession.count()).toBe(0)
  })

  it('員工被停用後,已登入的通行證立刻失效', async () => {
    const cookie = await loginCookie(ctx.app, 'staff@test.local')
    await prisma.staffUser.update({ where: { id: fx.staff.staff.id }, data: { isActive: false } })
    expect((await ctx.app.inject({ method: 'GET', url: '/api/admin/me', headers: { cookie } })).statusCode).toBe(401)
  })
})

describe('權限與跨網站防護', () => {
  it('店員不能修改店家設定(403),店長可以', async () => {
    const staffCookie = await loginCookie(ctx.app, 'staff@test.local')
    const managerCookie = await loginCookie(ctx.app, 'manager@test.local')
    const patch = (cookie: string) =>
      ctx.app.inject({ method: 'PATCH', url: '/api/admin/store', headers: { cookie }, payload: { prepMinutes: 20 } })

    const denied = await patch(staffCookie)
    expect(denied.statusCode).toBe(403)
    expect(json(denied).error.code).toBe('FORBIDDEN')
    expect((await patch(managerCookie)).statusCode).toBe(200)
  })

  it('會改變資料的請求,如果來自不被允許的網站(Origin),會被擋下', async () => {
    const bad = await login('owner@test.local', PASSWORD, { origin: 'https://evil.example' })
    expect(bad.statusCode).toBe(403)
    expect(json(bad).error.message).toMatch(/來源/)

    const good = await login('owner@test.local', PASSWORD, { origin: 'http://localhost:5173' })
    expect(good.statusCode).toBe(200)
  })

  it('不帶 Origin 的請求(例如 curl、Postman)不受影響', async () => {
    expect((await login('owner@test.local', PASSWORD)).statusCode).toBe(200)
  })
})
