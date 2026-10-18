import { z } from 'zod'

/** 統一的錯誤回應格式 */
export const errorResponse = z.object({
  error: z.object({
    code: z.string().describe('錯誤代碼,給程式判斷用,例如 ITEM_SOLD_OUT'),
    message: z.string().describe('錯誤說明(繁體中文),可以直接顯示給使用者看'),
  }),
})

/** 網址裡的 :id */
export const idParams = z.object({ id: z.uuid() })

/** 可以空的時間(ISO 8601 字串) */
export const nullableDateTime = z.iso.datetime({ offset: true }).nullable()
export const dateTime = z.iso.datetime({ offset: true })

/** 把 Date 轉成 ISO 字串(空值維持空) */
export function iso(date: Date): string
export function iso(date: Date | null): string | null
export function iso(date: Date | null): string | null {
  return date ? date.toISOString() : null
}

export const okResponse = z.object({ ok: z.literal(true) })
