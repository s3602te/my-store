import { z } from 'zod'

/**
 * 菜單管理的輸入規則。
 * 「新增」與「修改」刻意分開寫:新增有預設值;修改(PATCH)只更新有送的欄位,
 * 沒送的欄位維持原值,絕對不能被預設值蓋掉。
 */

const name = (label: string, max = 40) => z.string().trim().min(1, `請填寫${label}`).max(max, `${label}太長了(最多 ${max} 字)`)
const sortOrder = z.number().int().min(0).max(9999)
const money = (label: string, max: number) => z.number().int(`${label}必須是整數`).min(0, `${label}不能是負數`).max(max, `${label}太大了`)
const atLeastOne = (body: object) => Object.keys(body).length > 0

// ───────────── 分類 ─────────────

const categoryFields = {
  name: name('分類名稱', 30),
  sortOrder,
  isActive: z.boolean(),
}
export const categoryBody = z.object({
  name: categoryFields.name,
  sortOrder: sortOrder.default(0),
  isActive: z.boolean().default(true),
})
export const categoryUpdateBody = z.object(categoryFields).partial().refine(atLeastOne, '請至少修改一個欄位')

export const categoryOut = z.object({
  id: z.uuid(),
  name: z.string(),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
  itemCount: z.number().int(),
})

// ───────────── 餐點 ─────────────

const imageUrl = z
  .url({ protocol: /^https?$/, error: '圖片網址必須是 http 或 https 開頭' })
  .max(500)
  .nullable()

const itemFields = {
  categoryId: z.uuid('分類代碼格式不正確'),
  name: name('品名'),
  description: z.string().trim().max(200, '說明太長了(最多 200 字)'),
  price: money('價格', 100_000),
  imageUrl,
  isAvailable: z.boolean(),
  isActive: z.boolean(),
  sortOrder,
  /** 這道餐點有哪些選項群組(依顧客看到的順序) */
  optionGroupIds: z.array(z.uuid()).max(20),
}
export const itemBody = z.object({
  categoryId: itemFields.categoryId,
  name: itemFields.name,
  description: itemFields.description.default(''),
  price: itemFields.price,
  imageUrl: imageUrl.default(null),
  isAvailable: z.boolean().default(true),
  isActive: z.boolean().default(true),
  sortOrder: sortOrder.default(0),
  optionGroupIds: itemFields.optionGroupIds.default([]),
})
export const itemUpdateBody = z.object(itemFields).partial().refine(atLeastOne, '請至少修改一個欄位')

export const availabilityBody = z.object({ isAvailable: z.boolean() })

export const itemOut = z.object({
  id: z.uuid(),
  categoryId: z.uuid(),
  categoryName: z.string(),
  name: z.string(),
  description: z.string(),
  price: z.number().int(),
  imageUrl: z.string().nullable(),
  isAvailable: z.boolean(),
  isActive: z.boolean(),
  sortOrder: z.number().int(),
  optionGroupIds: z.array(z.uuid()),
})

// ───────────── 選項 ─────────────

const optionFields = {
  name: name('選項名稱', 30),
  priceDelta: money('加價', 1000),
  isAvailable: z.boolean(),
  sortOrder,
}
export const optionCreateBody = z.object({
  name: optionFields.name,
  priceDelta: optionFields.priceDelta.default(0),
  isAvailable: z.boolean().default(true),
  sortOrder: sortOrder.default(0),
})
export const optionUpdateBody = z.object(optionFields).partial().refine(atLeastOne, '請至少修改一個欄位')

export const optionOut = z.object({
  id: z.uuid(),
  groupId: z.uuid(),
  name: z.string(),
  priceDelta: z.number().int(),
  isAvailable: z.boolean(),
  sortOrder: z.number().int(),
})

// ───────────── 選項群組 ─────────────

const groupFields = {
  name: name('群組名稱', 30),
  minSelect: z.number().int().min(0).max(20).describe('最少選幾個(1 = 必選)'),
  maxSelect: z.number().int().min(1).max(20).describe('最多選幾個'),
  sortOrder,
}
const minMax = (b: { minSelect?: number; maxSelect?: number }) =>
  b.minSelect === undefined || b.maxSelect === undefined || b.maxSelect >= b.minSelect
const minMaxMessage = { message: '「最多選幾個」不能小於「最少選幾個」', path: ['maxSelect'] }

export const groupBody = z
  .object({
    name: groupFields.name,
    minSelect: groupFields.minSelect.default(0),
    maxSelect: groupFields.maxSelect.default(1),
    sortOrder: sortOrder.default(0),
    options: z.array(optionCreateBody).max(50).default([]),
  })
  .refine(minMax, minMaxMessage)
export const groupUpdateBody = z
  .object(groupFields)
  .partial()
  .refine(atLeastOne, '請至少修改一個欄位')
  .refine(minMax, minMaxMessage)

export const groupOut = z.object({
  id: z.uuid(),
  name: z.string(),
  minSelect: z.number().int(),
  maxSelect: z.number().int(),
  sortOrder: z.number().int(),
  options: z.array(optionOut),
})

// ───────────── 顧客端菜單(輸出)─────────────

export const publicMenuResponse = z.object({
  store: z.object({ name: z.string(), acceptingOrders: z.boolean() }),
  categories: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      items: z.array(
        z.object({
          id: z.uuid(),
          name: z.string(),
          description: z.string(),
          price: z.number().int().describe('單價(新台幣元)'),
          imageUrl: z.string().nullable(),
          isAvailable: z.boolean().describe('false = 今日售完,顧客看得到但不能點'),
          optionGroups: z.array(
            z.object({
              id: z.uuid(),
              name: z.string(),
              minSelect: z.number().int().describe('最少選幾個,1 = 必選'),
              maxSelect: z.number().int(),
              options: z.array(
                z.object({
                  id: z.uuid(),
                  name: z.string(),
                  priceDelta: z.number().int().describe('加價(新台幣元)'),
                  isAvailable: z.boolean(),
                }),
              ),
            }),
          ),
        }),
      ),
    }),
  ),
})
