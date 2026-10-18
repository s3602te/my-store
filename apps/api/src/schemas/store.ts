import { z } from 'zod'
import { HHMM_PATTERN } from '../lib/time.js'

const hhmm = z.string().regex(HHMM_PATTERN, '時間格式必須是 HH:mm,例如 06:30')

/** 顧客端看到的店家資訊 */
export const publicStore = z.object({
  name: z.string(),
  acceptingOrders: z.boolean().describe('false = 店家暫停接單'),
  openTime: z.string(),
  closeTime: z.string(),
  prepMinutes: z.number().int(),
  isOpenNow: z.boolean().describe('現在是否在營業時間內(台北時間)'),
  canOrderNow: z.boolean().describe('現在是否可以下單(接單中、在營業時間內、尚未過最後下單時間)'),
})

export const adminStore = publicStore.extend({ id: z.uuid(), slug: z.string() })

export const updateStoreBody = z
  .object({
    name: z.string().trim().min(1).max(50),
    acceptingOrders: z.boolean(),
    openTime: hhmm,
    closeTime: hhmm,
    prepMinutes: z.number().int().min(0, '備餐時間不能是負數').max(240, '備餐時間最多 240 分鐘'),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, '請至少修改一個欄位')
