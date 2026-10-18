import { verify } from '@node-rs/argon2'
import { config } from '../config.js'
import { prisma } from '../db.js'
import { AppError, tooMany } from '../lib/errors.js'
import { generateToken, getDummyPasswordHash, hashToken } from '../lib/security.js'
import type { StaffProfile } from '../schemas/auth.js'
import { writeAudit } from './audit.js'

const INVALID_CREDENTIALS = () => new AppError(401, 'INVALID_CREDENTIALS', '帳號或密碼錯誤')

interface LoginMeta {
  ip?: string
  userAgent?: string
}

/**
 * 員工登入。
 * 安全做法:
 *  - 帳號不存在、密碼錯誤、帳號停用,都回傳同樣的訊息(不透露帳號是否存在)
 *  - 帳號不存在時也做一次密碼驗證,讓回應時間相近
 *  - 連續輸錯達上限,暫時鎖定帳號
 *  - 通行證是隨機字串,資料庫只存雜湊
 */
export async function loginStaff(
  input: { email: string; password: string },
  now: Date,
  meta: LoginMeta,
): Promise<{ staff: StaffProfile; token: string; expiresAt: Date }> {
  const staff = await prisma.staffUser.findUnique({ where: { email: input.email } })

  if (!staff) {
    await verify(await getDummyPasswordHash(), input.password).catch(() => false)
    throw INVALID_CREDENTIALS()
  }

  if (staff.lockedUntil && staff.lockedUntil > now) {
    const minutes = Math.ceil((staff.lockedUntil.getTime() - now.getTime()) / 60_000)
    throw tooMany('ACCOUNT_LOCKED', `登入失敗次數過多,帳號暫時鎖定,請 ${minutes} 分鐘後再試`)
  }

  const passwordOk = await verify(staff.passwordHash, input.password).catch(() => false)

  if (!passwordOk || !staff.isActive) {
    if (!passwordOk) {
      const failures = staff.failedLoginCount + 1
      const shouldLock = failures >= config.loginMaxFailures
      await prisma.$transaction(async (tx) => {
        await tx.staffUser.update({
          where: { id: staff.id },
          data: {
            failedLoginCount: shouldLock ? 0 : failures,
            lockedUntil: shouldLock ? new Date(now.getTime() + config.loginLockMs) : null,
          },
        })
        await writeAudit(tx, {
          storeId: staff.storeId,
          actorId: staff.id,
          action: shouldLock ? 'auth.account_locked' : 'auth.login_failed',
          entity: 'StaffUser',
          entityId: staff.id,
          meta: { ip: meta.ip ?? null, failures },
        })
      })
    }
    throw INVALID_CREDENTIALS()
  }

  const token = generateToken(32)
  const expiresAt = new Date(now.getTime() + config.sessionTtlMs)

  await prisma.$transaction(async (tx) => {
    await tx.staffUser.update({
      where: { id: staff.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: now },
    })
    await tx.staffSession.create({
      data: {
        staffUserId: staff.id,
        tokenHash: hashToken(token),
        expiresAt,
        lastSeenAt: now,
        userAgent: meta.userAgent?.slice(0, 300) ?? null,
        ip: meta.ip ?? null,
      },
    })
    await writeAudit(tx, {
      storeId: staff.storeId,
      actorId: staff.id,
      action: 'auth.login',
      entity: 'StaffUser',
      entityId: staff.id,
      meta: { ip: meta.ip ?? null },
    })
    // 順便清掉這位員工已經過期的通行證,避免資料表越來越大
    await tx.staffSession.deleteMany({ where: { staffUserId: staff.id, expiresAt: { lte: now } } })
  })

  return {
    staff: { id: staff.id, email: staff.email, name: staff.name, role: staff.role, storeId: staff.storeId },
    token,
    expiresAt,
  }
}

/** 登出:讓這張通行證立刻失效 */
export async function logoutStaff(token: string | undefined): Promise<void> {
  if (!token) return
  await prisma.staffSession.deleteMany({ where: { tokenHash: hashToken(token) } })
}
