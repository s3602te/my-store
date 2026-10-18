import { hash, verify } from '@node-rs/argon2'
import type { z } from 'zod'
import { prisma } from '../db.js'
import type { StaffUser } from '../generated/prisma/client.js'
import { badRequest, conflict, notFound } from '../lib/errors.js'
import { generateToken } from '../lib/security.js'
import type { StaffPrincipal } from '../plugins/auth.js'
import { iso } from '../schemas/common.js'
import type { changePasswordBody, createStaffBody, staffOut, updateStaffBody } from '../schemas/staff.js'
import { writeAudit } from './audit.js'

type StaffOut = z.infer<typeof staffOut>

const toStaffOut = (staff: StaffUser): StaffOut => ({
  id: staff.id,
  email: staff.email,
  name: staff.name,
  role: staff.role,
  isActive: staff.isActive,
  lastLoginAt: iso(staff.lastLoginAt),
  createdAt: iso(staff.createdAt),
})

/** 產生臨時密碼(14 個隨機字元)。只回傳給操作的老闆一次,資料庫只存雜湊 */
const makeTemporaryPassword = () => generateToken(10)

// ───────────────────────── 自己改密碼 ─────────────────────────

/** 修改自己的密碼。成功後,這位員工「其他地方」的登入都會登出(目前這個保留) */
export async function changeOwnPassword(staff: StaffPrincipal, body: z.infer<typeof changePasswordBody>): Promise<void> {
  const row = await prisma.staffUser.findUniqueOrThrow({ where: { id: staff.id } })

  if (!(await verify(row.passwordHash, body.currentPassword).catch(() => false))) {
    throw badRequest('INVALID_CURRENT_PASSWORD', '目前的密碼不正確')
  }
  if (body.currentPassword === body.newPassword) {
    throw badRequest('PASSWORD_UNCHANGED', '新密碼不能和目前的密碼一樣')
  }

  const passwordHash = await hash(body.newPassword)
  await prisma.$transaction(async (tx) => {
    await tx.staffUser.update({ where: { id: staff.id }, data: { passwordHash, failedLoginCount: 0, lockedUntil: null } })
    await tx.staffSession.deleteMany({ where: { staffUserId: staff.id, id: { not: staff.sessionId } } })
    await writeAudit(tx, { storeId: staff.storeId, actorId: staff.id, action: 'auth.password_change', entity: 'StaffUser', entityId: staff.id })
  })
}

// ───────────────────────── 老闆管理員工 ─────────────────────────

export async function listStaff(storeId: string): Promise<StaffOut[]> {
  const rows = await prisma.staffUser.findMany({ where: { storeId }, orderBy: [{ role: 'asc' }, { createdAt: 'asc' }] })
  return rows.map(toStaffOut)
}

async function findTarget(actor: StaffPrincipal, id: string): Promise<StaffUser> {
  const target = await prisma.staffUser.findFirst({ where: { id, storeId: actor.storeId } })
  if (!target) throw notFound('STAFF_NOT_FOUND', '找不到這位員工')
  return target
}

/** 老闆帳號(包含自己)不能透過 API 修改,避免誤操作把自己鎖在外面 */
function assertManageable(actor: StaffPrincipal, target: StaffUser) {
  if (target.id === actor.id) throw conflict('CANNOT_MODIFY_SELF', '不能修改自己的帳號(要改密碼請用「修改密碼」)')
  if (target.role === 'OWNER') throw conflict('CANNOT_MODIFY_OWNER', '老闆帳號不能透過這裡修改')
}

export async function createStaff(actor: StaffPrincipal, body: z.infer<typeof createStaffBody>) {
  const temporaryPassword = makeTemporaryPassword()
  const passwordHash = await hash(temporaryPassword)

  const existing = await prisma.staffUser.findUnique({ where: { email: body.email }, select: { id: true } })
  if (existing) throw conflict('EMAIL_EXISTS', '這個 Email 已經有帳號了')

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.staffUser.create({
      data: { storeId: actor.storeId, email: body.email, name: body.name, role: body.role, passwordHash },
    })
    await writeAudit(tx, {
      storeId: actor.storeId,
      actorId: actor.id,
      action: 'staff.create',
      entity: 'StaffUser',
      entityId: row.id,
      meta: { email: body.email, role: body.role },
    })
    return row
  })
  return { staff: toStaffOut(created), temporaryPassword }
}

/** 修改員工的姓名、角色、啟用狀態。停用員工會立刻把他所有的登入踢掉 */
export async function updateStaff(actor: StaffPrincipal, id: string, body: z.infer<typeof updateStaffBody>) {
  const target = await findTarget(actor, id)
  assertManageable(actor, target)

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.staffUser.update({ where: { id }, data: body })
    if (body.isActive === false) await tx.staffSession.deleteMany({ where: { staffUserId: id } })
    if (body.role && body.role !== target.role) await tx.staffSession.deleteMany({ where: { staffUserId: id } }) // 角色變了,請重新登入
    await writeAudit(tx, {
      storeId: actor.storeId,
      actorId: actor.id,
      action: 'staff.update',
      entity: 'StaffUser',
      entityId: id,
      meta: { email: target.email, changes: body },
    })
    return row
  })
  return toStaffOut(updated)
}

/** 重設員工密碼:產生新的臨時密碼(只顯示一次),並踢掉他所有的登入、解除鎖定 */
export async function resetStaffPassword(actor: StaffPrincipal, id: string) {
  const target = await findTarget(actor, id)
  assertManageable(actor, target)

  const temporaryPassword = makeTemporaryPassword()
  const passwordHash = await hash(temporaryPassword)

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.staffUser.update({ where: { id }, data: { passwordHash, failedLoginCount: 0, lockedUntil: null } })
    await tx.staffSession.deleteMany({ where: { staffUserId: id } })
    await writeAudit(tx, { storeId: actor.storeId, actorId: actor.id, action: 'staff.reset_password', entity: 'StaffUser', entityId: id, meta: { email: target.email } })
    return row
  })
  return { staff: toStaffOut(updated), temporaryPassword }
}
