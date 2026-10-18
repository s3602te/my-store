import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '../src/db.js'
import { createFixture, createTestApp, json, loginCookie, PASSWORD, resetDatabase, type Fixture } from './helpers.js'

let fx: Fixture
let ctx: Awaited<ReturnType<typeof createTestApp>>
let ownerCookie: string

beforeEach(async () => {
  await resetDatabase()
  fx = await createFixture()
  ctx = await createTestApp()
  ownerCookie = await loginCookie(ctx.app, 'owner@test.local')
})
afterAll(async () => {
  await ctx?.app.close()
  await prisma.$disconnect()
})

type Method = 'GET' | 'POST' | 'PATCH'
const call = (method: Method, url: string, cookie: string | undefined, payload?: object) =>
  ctx.app.inject({ method, url: `/api/admin${url}`, payload, headers: cookie ? { cookie } : {} })
const asOwner = (method: Method, url: string, payload?: object) => call(method, url, ownerCookie, payload)

const expectError = (response: { statusCode: number; body: string }, status: number, code: string) => {
  expect(response.statusCode, response.body).toBe(status)
  expect(json(response).error.code).toBe(code)
}
const tryLogin = (email: string, password: string) =>
  ctx.app.inject({ method: 'POST', url: '/api/admin/auth/login', payload: { email, password } })

describe('修改自己的密碼', () => {
  const NEW_PASSWORD = 'a-brand-new-password-2026'

  it('成功後,舊密碼不能再登入、新密碼可以', async () => {
    const cookie = await loginCookie(ctx.app, 'staff@test.local')
    const response = await call('POST', '/me/password', cookie, { currentPassword: PASSWORD, newPassword: NEW_PASSWORD })
    expect(response.statusCode, response.body).toBe(200)

    expect((await tryLogin('staff@test.local', PASSWORD)).statusCode).toBe(401)
    expect((await tryLogin('staff@test.local', NEW_PASSWORD)).statusCode).toBe(200)
  })

  it('目前的登入保留,但其他地方的登入全部登出', async () => {
    const phoneCookie = await loginCookie(ctx.app, 'staff@test.local')
    const laptopCookie = await loginCookie(ctx.app, 'staff@test.local')
    await call('POST', '/me/password', laptopCookie, { currentPassword: PASSWORD, newPassword: NEW_PASSWORD })

    expect((await call('GET', '/me', laptopCookie)).statusCode).toBe(200)
    expect((await call('GET', '/me', phoneCookie)).statusCode).toBe(401)
  })

  it('目前的密碼錯誤:400 INVALID_CURRENT_PASSWORD,密碼不變', async () => {
    const cookie = await loginCookie(ctx.app, 'staff@test.local')
    expectError(await call('POST', '/me/password', cookie, { currentPassword: 'wrong', newPassword: NEW_PASSWORD }), 400, 'INVALID_CURRENT_PASSWORD')
    expect((await tryLogin('staff@test.local', PASSWORD)).statusCode).toBe(200)
  })

  it('新密碼太短(少於 10 字元)、和舊的一樣:400', async () => {
    const cookie = await loginCookie(ctx.app, 'staff@test.local')
    expectError(await call('POST', '/me/password', cookie, { currentPassword: PASSWORD, newPassword: 'short' }), 400, 'VALIDATION_ERROR')
    expectError(await call('POST', '/me/password', cookie, { currentPassword: PASSWORD, newPassword: PASSWORD }), 400, 'PASSWORD_UNCHANGED')
  })

  it('沒登入:401;會寫稽核日誌,日誌裡沒有任何密碼', async () => {
    expectError(await call('POST', '/me/password', undefined, { currentPassword: PASSWORD, newPassword: NEW_PASSWORD }), 401, 'UNAUTHENTICATED')
    const cookie = await loginCookie(ctx.app, 'staff@test.local')
    await call('POST', '/me/password', cookie, { currentPassword: PASSWORD, newPassword: NEW_PASSWORD })
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: 'auth.password_change' } })
    expect(JSON.stringify(log)).not.toContain(NEW_PASSWORD)
    expect(JSON.stringify(log)).not.toContain(PASSWORD)
  })
})

describe('老闆管理員工:權限', () => {
  it('店長、店員、沒登入都不能碰員工管理', async () => {
    const managerCookie = await loginCookie(ctx.app, 'manager@test.local')
    const staffCookie = await loginCookie(ctx.app, 'staff@test.local')
    for (const cookie of [managerCookie, staffCookie]) {
      expectError(await call('GET', '/staff', cookie), 403, 'FORBIDDEN')
      expectError(await call('POST', '/staff', cookie, { email: 'x@test.local', name: 'x', role: 'STAFF' }), 403, 'FORBIDDEN')
      expectError(await call('PATCH', `/staff/${fx.staff.staff.id}`, cookie, { isActive: false }), 403, 'FORBIDDEN')
      expectError(await call('POST', `/staff/${fx.staff.staff.id}/reset-password`, cookie), 403, 'FORBIDDEN')
    }
    expectError(await call('GET', '/staff', undefined), 401, 'UNAUTHENTICATED')
  })
})

describe('老闆管理員工:功能', () => {
  it('列出員工:不含密碼或雜湊', async () => {
    const response = await asOwner('GET', '/staff')
    const list = json(response)
    expect(list.map((s: { email: string }) => s.email).sort()).toEqual(['manager@test.local', 'owner@test.local', 'staff@test.local'])
    expect(response.body).not.toMatch(/passwordHash|argon2/i)
  })

  it('新增員工:產生臨時密碼(只顯示一次),新員工用它可以登入', async () => {
    const response = await asOwner('POST', '/staff', { email: '  New.Staff@Test.Local ', name: '小新', role: 'STAFF' })
    expect(response.statusCode, response.body).toBe(201)
    const { staff, temporaryPassword } = json(response)
    expect(staff).toMatchObject({ email: 'new.staff@test.local', name: '小新', role: 'STAFF', isActive: true })
    expect(temporaryPassword).toHaveLength(14)

    expect((await tryLogin('new.staff@test.local', temporaryPassword)).statusCode).toBe(200)
    // 資料庫只存雜湊
    const row = await prisma.staffUser.findUniqueOrThrow({ where: { email: 'new.staff@test.local' } })
    expect(row.passwordHash).not.toContain(temporaryPassword)
    expect(row.storeId).toBe(fx.store.id)
    // 之後再列出員工,不會再看到臨時密碼
    expect((await asOwner('GET', '/staff')).body).not.toContain(temporaryPassword)
  })

  it('不能新增老闆帳號;Email 格式錯誤、已存在都不行', async () => {
    expectError(await asOwner('POST', '/staff', { email: 'boss@test.local', name: 'x', role: 'OWNER' }), 400, 'VALIDATION_ERROR')
    expectError(await asOwner('POST', '/staff', { email: 'not-an-email', name: 'x', role: 'STAFF' }), 400, 'VALIDATION_ERROR')
    expectError(await asOwner('POST', '/staff', { email: 'staff@test.local', name: 'x', role: 'STAFF' }), 409, 'EMAIL_EXISTS')
  })

  it('停用員工:立刻登出、不能再登入;重新啟用後可以登入', async () => {
    const staffCookie = await loginCookie(ctx.app, 'staff@test.local')
    const response = await asOwner('PATCH', `/staff/${fx.staff.staff.id}`, { isActive: false })
    expect(json(response).isActive).toBe(false)

    expect((await call('GET', '/me', staffCookie)).statusCode).toBe(401)
    expect((await tryLogin('staff@test.local', PASSWORD)).statusCode).toBe(401)

    await asOwner('PATCH', `/staff/${fx.staff.staff.id}`, { isActive: true })
    expect((await tryLogin('staff@test.local', PASSWORD)).statusCode).toBe(200)
  })

  it('修改角色:店員升為店長,權限立刻不同(要重新登入)', async () => {
    const oldCookie = await loginCookie(ctx.app, 'staff@test.local')
    await asOwner('PATCH', `/staff/${fx.staff.staff.id}`, { role: 'MANAGER', name: '升官了' })
    expect((await call('GET', '/me', oldCookie)).statusCode).toBe(401) // 舊的登入被踢掉

    const newCookie = await loginCookie(ctx.app, 'staff@test.local')
    expect(json(await call('GET', '/me', newCookie))).toMatchObject({ role: 'MANAGER', name: '升官了' })
    expect((await call('PATCH', '/store', newCookie, { prepMinutes: 15 })).statusCode).toBe(200)
  })

  it('重設密碼:舊密碼失效、所有登入被踢掉、帳號被鎖定時也會解除', async () => {
    const staffCookie = await loginCookie(ctx.app, 'staff@test.local')
    await prisma.staffUser.update({ where: { id: fx.staff.staff.id }, data: { failedLoginCount: 3, lockedUntil: new Date('2099-01-01') } })

    const response = await asOwner('POST', `/staff/${fx.staff.staff.id}/reset-password`)
    expect(response.statusCode, response.body).toBe(200)
    const { temporaryPassword } = json(response)

    expect((await call('GET', '/me', staffCookie)).statusCode).toBe(401)
    expect((await tryLogin('staff@test.local', PASSWORD)).statusCode).toBe(401)
    expect((await tryLogin('staff@test.local', temporaryPassword)).statusCode).toBe(200)
  })

  it('保護:不能修改自己、不能修改老闆帳號、找不到的員工 404', async () => {
    expectError(await asOwner('PATCH', `/staff/${fx.staff.owner.id}`, { isActive: false }), 409, 'CANNOT_MODIFY_SELF')
    expectError(await asOwner('POST', `/staff/${fx.staff.owner.id}/reset-password`), 409, 'CANNOT_MODIFY_SELF')
    expectError(await asOwner('PATCH', `/staff/019a0000-0000-7000-8000-000000000000`, { isActive: false }), 404, 'STAFF_NOT_FOUND')

    // 另一個老闆帳號(直接寫進資料庫模擬):也不能被修改
    const otherOwner = await prisma.staffUser.create({
      data: { storeId: fx.store.id, email: 'owner2@test.local', name: '老闆二', role: 'OWNER', passwordHash: fx.staff.owner.passwordHash },
    })
    expectError(await asOwner('PATCH', `/staff/${otherOwner.id}`, { isActive: false }), 409, 'CANNOT_MODIFY_OWNER')
  })

  it('只能管理自己店的員工(別家店的員工 ID:404)', async () => {
    const other = await prisma.store.create({ data: { slug: 'other', name: '別家店' } })
    const foreign = await prisma.staffUser.create({
      data: { storeId: other.id, email: 'foreign@test.local', name: '別家員工', role: 'STAFF', passwordHash: fx.staff.owner.passwordHash },
    })
    expectError(await asOwner('PATCH', `/staff/${foreign.id}`, { isActive: false }), 404, 'STAFF_NOT_FOUND')
    expectError(await asOwner('POST', `/staff/${foreign.id}/reset-password`), 404, 'STAFF_NOT_FOUND')
    const list = json(await asOwner('GET', '/staff'))
    expect(list.every((s: { email: string }) => s.email !== 'foreign@test.local')).toBe(true)
  })

  it('全部都寫稽核日誌(新增、修改、重設密碼),日誌裡沒有臨時密碼', async () => {
    const created = json(await asOwner('POST', '/staff', { email: 'log@test.local', name: '日誌', role: 'STAFF' }))
    await asOwner('PATCH', `/staff/${created.staff.id}`, { isActive: false })
    const reset = json(await asOwner('POST', `/staff/${created.staff.id}/reset-password`))

    const logs = await prisma.auditLog.findMany({ where: { entityId: created.staff.id }, orderBy: { createdAt: 'asc' } })
    expect(logs.map((l) => l.action)).toEqual(['staff.create', 'staff.update', 'staff.reset_password'])
    const all = JSON.stringify(logs)
    expect(all).not.toContain(created.temporaryPassword)
    expect(all).not.toContain(reset.temporaryPassword)
  })
})
