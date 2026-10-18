import type { Prisma } from '../generated/prisma/client.js'

interface AuditEntry {
  storeId: string
  /** 誰做的(員工 ID);系統自動或顧客操作可以不填 */
  actorId?: string | null
  /** 動作代碼,例如 order.accept、payment.cash_confirm、menu.item_update */
  action: string
  /** 對象種類,例如 Order、MenuItem */
  entity: string
  entityId: string
  /** 補充資訊(改了什麼、原因…) */
  meta?: Prisma.InputJsonValue
}

/** 寫一筆稽核日誌。傳入交易(tx)時,會跟著那個交易一起成功或一起失敗 */
export async function writeAudit(db: Prisma.TransactionClient, entry: AuditEntry): Promise<void> {
  await db.auditLog.create({
    data: {
      storeId: entry.storeId,
      actorId: entry.actorId ?? null,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      meta: entry.meta ?? undefined,
    },
  })
}
