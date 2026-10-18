import { z } from 'zod'
import { config } from '../config.js'
import { prisma } from '../db.js'
import type { Store } from '../generated/prisma/client.js'
import { AppError, badRequest } from '../lib/errors.js'
import { hhmmToMinutes, isWithinHours, minutesOfDay } from '../lib/time.js'
import type { adminStore, publicStore, updateStoreBody } from '../schemas/store.js'
import { writeAudit } from './audit.js'

type PublicStore = z.infer<typeof publicStore>
type AdminStore = z.infer<typeof adminStore>

/** 取得這個後端負責的店家;找不到代表還沒執行 seed */
export async function getStore(): Promise<Store> {
  const store = await prisma.store.findUnique({ where: { slug: config.storeSlug } })
  if (!store) throw new AppError(503, 'STORE_NOT_CONFIGURED', '找不到店家資料,請先執行資料庫 seed')
  return store
}

/** 現在是否在營業時間內、是否還能下單 */
export function storeAvailability(store: Store, now: Date) {
  const isOpenNow = isWithinHours(now, store.openTime, store.closeTime)
  // 最後下單時間 = 打烊時間 − 備餐時間(因為取餐時間不能晚於打烊)
  const lastOrderMinute = hhmmToMinutes(store.closeTime) - store.prepMinutes
  const canOrderNow = store.acceptingOrders && isOpenNow && minutesOfDay(now) <= lastOrderMinute
  return { isOpenNow, canOrderNow }
}

export function toPublicStore(store: Store, now: Date): PublicStore {
  return {
    name: store.name,
    acceptingOrders: store.acceptingOrders,
    openTime: store.openTime,
    closeTime: store.closeTime,
    prepMinutes: store.prepMinutes,
    ...storeAvailability(store, now),
  }
}

export function toAdminStore(store: Store, now: Date): AdminStore {
  return { id: store.id, slug: store.slug, ...toPublicStore(store, now) }
}

export async function updateStore(
  storeId: string,
  actorId: string,
  changes: z.infer<typeof updateStoreBody>,
): Promise<Store> {
  const current = await prisma.store.findUniqueOrThrow({ where: { id: storeId } })

  const openTime = changes.openTime ?? current.openTime
  const closeTime = changes.closeTime ?? current.closeTime
  if (hhmmToMinutes(openTime) >= hhmmToMinutes(closeTime)) {
    throw badRequest('INVALID_HOURS', '開始營業時間必須早於結束營業時間')
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.store.update({ where: { id: storeId }, data: changes })
    await writeAudit(tx, {
      storeId,
      actorId,
      action: 'store.update',
      entity: 'Store',
      entityId: storeId,
      meta: { changes },
    })
    return updated
  })
}
