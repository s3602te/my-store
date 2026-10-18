import type { z } from 'zod'
import { prisma } from '../db.js'
import type { Prisma } from '../generated/prisma/client.js'
import { conflict, notFound } from '../lib/errors.js'
import type { StaffPrincipal } from '../plugins/auth.js'
import type {
  categoryBody,
  categoryUpdateBody,
  groupBody,
  groupUpdateBody,
  itemBody,
  itemUpdateBody,
  optionCreateBody,
  optionUpdateBody,
} from '../schemas/menu.js'
import { writeAudit } from './audit.js'

/**
 * 菜單管理(後台)。
 * 所有查詢都帶 storeId,員工只能動自己店的資料;所有修改都會寫稽核日誌。
 */

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002'
}

/** 名稱重複(同一家店的分類/餐點/群組名稱不能重複)時,回傳友善的錯誤 */
async function withDuplicateCheck<T>(label: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (error) {
    if (isUniqueViolation(error)) throw conflict('DUPLICATE_NAME', `${label}名稱重複了,請換一個`)
    throw error
  }
}

// ───────────────────────── 分類 ─────────────────────────

export async function listCategories(storeId: string) {
  const rows = await prisma.menuCategory.findMany({
    where: { storeId },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: { _count: { select: { items: true } } },
  })
  return rows.map(({ _count, ...category }) => ({
    id: category.id,
    name: category.name,
    sortOrder: category.sortOrder,
    isActive: category.isActive,
    itemCount: _count.items,
  }))
}

async function findCategory(storeId: string, id: string) {
  const category = await prisma.menuCategory.findFirst({ where: { id, storeId }, include: { _count: { select: { items: true } } } })
  if (!category) throw notFound('CATEGORY_NOT_FOUND', '找不到這個分類')
  return category
}

const categoryOut = (category: Awaited<ReturnType<typeof findCategory>>) => ({
  id: category.id,
  name: category.name,
  sortOrder: category.sortOrder,
  isActive: category.isActive,
  itemCount: category._count.items,
})

export async function createCategory(staff: StaffPrincipal, body: z.infer<typeof categoryBody>) {
  const created = await withDuplicateCheck('分類', () =>
    prisma.$transaction(async (tx) => {
      const row = await tx.menuCategory.create({ data: { ...body, storeId: staff.storeId } })
      await writeAudit(tx, { storeId: staff.storeId, actorId: staff.id, action: 'menu.category_create', entity: 'MenuCategory', entityId: row.id, meta: body })
      return row
    }),
  )
  return categoryOut(await findCategory(staff.storeId, created.id))
}

export async function updateCategory(staff: StaffPrincipal, id: string, body: z.infer<typeof categoryUpdateBody>) {
  await findCategory(staff.storeId, id)
  await withDuplicateCheck('分類', () =>
    prisma.$transaction(async (tx) => {
      await tx.menuCategory.update({ where: { id }, data: body })
      await writeAudit(tx, { storeId: staff.storeId, actorId: staff.id, action: 'menu.category_update', entity: 'MenuCategory', entityId: id, meta: body })
    }),
  )
  return categoryOut(await findCategory(staff.storeId, id))
}

export async function deleteCategory(staff: StaffPrincipal, id: string) {
  const category = await findCategory(staff.storeId, id)
  if (category._count.items > 0) {
    throw conflict('CATEGORY_NOT_EMPTY', `這個分類底下還有 ${category._count.items} 道餐點,請先移走或刪除餐點(或改成「下架」)`)
  }
  await prisma.$transaction(async (tx) => {
    await tx.menuCategory.delete({ where: { id } })
    await writeAudit(tx, { storeId: staff.storeId, actorId: staff.id, action: 'menu.category_delete', entity: 'MenuCategory', entityId: id, meta: { name: category.name } })
  })
}

// ───────────────────────── 餐點 ─────────────────────────

const itemInclude = {
  category: { select: { name: true } },
  optionGroups: { orderBy: { sortOrder: 'asc' }, select: { optionGroupId: true } },
} satisfies Prisma.MenuItemInclude

async function findItem(storeId: string, id: string) {
  const item = await prisma.menuItem.findFirst({ where: { id, storeId }, include: itemInclude })
  if (!item) throw notFound('ITEM_NOT_FOUND', '找不到這道餐點')
  return item
}

const itemOut = (item: Awaited<ReturnType<typeof findItem>>) => ({
  id: item.id,
  categoryId: item.categoryId,
  categoryName: item.category.name,
  name: item.name,
  description: item.description,
  price: item.price,
  imageUrl: item.imageUrl,
  isAvailable: item.isAvailable,
  isActive: item.isActive,
  sortOrder: item.sortOrder,
  optionGroupIds: item.optionGroups.map((link) => link.optionGroupId),
})

export async function listItems(storeId: string) {
  const rows = await prisma.menuItem.findMany({
    where: { storeId },
    include: itemInclude,
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  })
  return rows.map(itemOut)
}

async function assertCategoryInStore(storeId: string, categoryId: string) {
  const category = await prisma.menuCategory.findFirst({ where: { id: categoryId, storeId }, select: { id: true } })
  if (!category) throw notFound('CATEGORY_NOT_FOUND', '找不到這個分類')
}

async function assertGroupsInStore(storeId: string, groupIds: string[]) {
  const unique = [...new Set(groupIds)]
  const count = await prisma.optionGroup.count({ where: { id: { in: unique }, storeId } })
  if (count !== unique.length) throw notFound('OPTION_GROUP_NOT_FOUND', '有選項群組不存在')
  if (unique.length !== groupIds.length) throw conflict('DUPLICATE_OPTION_GROUP', '選項群組重複了')
}

export async function createItem(staff: StaffPrincipal, body: z.infer<typeof itemBody>) {
  await assertCategoryInStore(staff.storeId, body.categoryId)
  await assertGroupsInStore(staff.storeId, body.optionGroupIds)
  const { optionGroupIds, ...data } = body

  const created = await withDuplicateCheck('餐點', () =>
    prisma.$transaction(async (tx) => {
      const row = await tx.menuItem.create({
        data: {
          ...data,
          storeId: staff.storeId,
          optionGroups: { create: optionGroupIds.map((optionGroupId, index) => ({ optionGroupId, sortOrder: index })) },
        },
      })
      await writeAudit(tx, { storeId: staff.storeId, actorId: staff.id, action: 'menu.item_create', entity: 'MenuItem', entityId: row.id, meta: body })
      return row
    }),
  )
  return itemOut(await findItem(staff.storeId, created.id))
}

export async function updateItem(staff: StaffPrincipal, id: string, body: z.infer<typeof itemUpdateBody>) {
  const before = await findItem(staff.storeId, id)
  if (body.categoryId) await assertCategoryInStore(staff.storeId, body.categoryId)
  if (body.optionGroupIds) await assertGroupsInStore(staff.storeId, body.optionGroupIds)
  const { optionGroupIds, ...data } = body

  await withDuplicateCheck('餐點', () =>
    prisma.$transaction(async (tx) => {
      await tx.menuItem.update({ where: { id }, data })
      if (optionGroupIds) {
        // 整組取代:先刪掉舊的關聯,再依新的順序建立
        await tx.menuItemOptionGroup.deleteMany({ where: { menuItemId: id } })
        await tx.menuItemOptionGroup.createMany({
          data: optionGroupIds.map((optionGroupId, index) => ({ menuItemId: id, optionGroupId, sortOrder: index })),
        })
      }
      await writeAudit(tx, {
        storeId: staff.storeId,
        actorId: staff.id,
        action: 'menu.item_update',
        entity: 'MenuItem',
        entityId: id,
        meta: { name: before.name, changes: body, previousPrice: before.price },
      })
    }),
  )
  return itemOut(await findItem(staff.storeId, id))
}

/** 設定「售完 / 恢復供應」。店員也可以做(不需要店長) */
export async function setItemAvailability(staff: StaffPrincipal, id: string, isAvailable: boolean) {
  const before = await findItem(staff.storeId, id)
  await prisma.$transaction(async (tx) => {
    await tx.menuItem.update({ where: { id }, data: { isAvailable } })
    await writeAudit(tx, {
      storeId: staff.storeId,
      actorId: staff.id,
      action: isAvailable ? 'menu.item_available' : 'menu.item_sold_out',
      entity: 'MenuItem',
      entityId: id,
      meta: { name: before.name },
    })
  })
  return itemOut(await findItem(staff.storeId, id))
}

/** 刪除餐點。歷史訂單存的是名稱與價格的快照,不受影響 */
export async function deleteItem(staff: StaffPrincipal, id: string) {
  const item = await findItem(staff.storeId, id)
  await prisma.$transaction(async (tx) => {
    await tx.menuItem.delete({ where: { id } })
    await writeAudit(tx, { storeId: staff.storeId, actorId: staff.id, action: 'menu.item_delete', entity: 'MenuItem', entityId: id, meta: { name: item.name, price: item.price } })
  })
}

// ───────────────────────── 選項群組與選項 ─────────────────────────

const groupInclude = { options: { orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] } } satisfies Prisma.OptionGroupInclude

async function findGroup(storeId: string, id: string) {
  const group = await prisma.optionGroup.findFirst({ where: { id, storeId }, include: groupInclude })
  if (!group) throw notFound('OPTION_GROUP_NOT_FOUND', '找不到這個選項群組')
  return group
}

const groupOut = (group: Awaited<ReturnType<typeof findGroup>>) => ({
  id: group.id,
  name: group.name,
  minSelect: group.minSelect,
  maxSelect: group.maxSelect,
  sortOrder: group.sortOrder,
  options: group.options.map((option) => ({
    id: option.id,
    groupId: option.groupId,
    name: option.name,
    priceDelta: option.priceDelta,
    isAvailable: option.isAvailable,
    sortOrder: option.sortOrder,
  })),
})

export async function listGroups(storeId: string) {
  const rows = await prisma.optionGroup.findMany({
    where: { storeId },
    include: groupInclude,
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  })
  return rows.map(groupOut)
}

export async function createGroup(staff: StaffPrincipal, body: z.infer<typeof groupBody>) {
  const { options, ...data } = body
  const created = await withDuplicateCheck('選項群組(或群組內的選項)', () =>
    prisma.$transaction(async (tx) => {
      const row = await tx.optionGroup.create({
        // 一併建立的選項,排序依傳入的順序
        data: { ...data, storeId: staff.storeId, options: { create: options.map((option, index) => ({ ...option, sortOrder: index })) } },
      })
      await writeAudit(tx, { storeId: staff.storeId, actorId: staff.id, action: 'menu.group_create', entity: 'OptionGroup', entityId: row.id, meta: body })
      return row
    }),
  )
  return groupOut(await findGroup(staff.storeId, created.id))
}

export async function updateGroup(staff: StaffPrincipal, id: string, body: z.infer<typeof groupUpdateBody>) {
  const before = await findGroup(staff.storeId, id)
  const minSelect = body.minSelect ?? before.minSelect
  const maxSelect = body.maxSelect ?? before.maxSelect
  if (maxSelect < minSelect) throw conflict('INVALID_SELECT_RANGE', '「最多選幾個」不能小於「最少選幾個」')

  await withDuplicateCheck('選項群組', () =>
    prisma.$transaction(async (tx) => {
      await tx.optionGroup.update({ where: { id }, data: body })
      await writeAudit(tx, { storeId: staff.storeId, actorId: staff.id, action: 'menu.group_update', entity: 'OptionGroup', entityId: id, meta: { name: before.name, changes: body } })
    }),
  )
  return groupOut(await findGroup(staff.storeId, id))
}

export async function deleteGroup(staff: StaffPrincipal, id: string) {
  const group = await findGroup(staff.storeId, id)
  await prisma.$transaction(async (tx) => {
    await tx.optionGroup.delete({ where: { id } })
    await writeAudit(tx, { storeId: staff.storeId, actorId: staff.id, action: 'menu.group_delete', entity: 'OptionGroup', entityId: id, meta: { name: group.name } })
  })
}

export async function createOption(staff: StaffPrincipal, groupId: string, body: z.infer<typeof optionCreateBody>) {
  await findGroup(staff.storeId, groupId)
  const created = await withDuplicateCheck('選項', () =>
    prisma.$transaction(async (tx) => {
      const row = await tx.option.create({ data: { ...body, groupId } })
      await writeAudit(tx, { storeId: staff.storeId, actorId: staff.id, action: 'menu.option_create', entity: 'Option', entityId: row.id, meta: { groupId, ...body } })
      return row
    }),
  )
  return optionOut(created)
}

async function findOption(storeId: string, id: string) {
  // 選項本身沒有 storeId,要透過所屬群組確認是這家店的
  const option = await prisma.option.findFirst({ where: { id, group: { storeId } } })
  if (!option) throw notFound('OPTION_NOT_FOUND', '找不到這個選項')
  return option
}

const optionOut = (option: { id: string; groupId: string; name: string; priceDelta: number; isAvailable: boolean; sortOrder: number }) => ({
  id: option.id,
  groupId: option.groupId,
  name: option.name,
  priceDelta: option.priceDelta,
  isAvailable: option.isAvailable,
  sortOrder: option.sortOrder,
})

export async function updateOption(staff: StaffPrincipal, id: string, body: z.infer<typeof optionUpdateBody>) {
  const before = await findOption(staff.storeId, id)
  const updated = await withDuplicateCheck('選項', () =>
    prisma.$transaction(async (tx) => {
      const row = await tx.option.update({ where: { id }, data: body })
      await writeAudit(tx, { storeId: staff.storeId, actorId: staff.id, action: 'menu.option_update', entity: 'Option', entityId: id, meta: { name: before.name, changes: body } })
      return row
    }),
  )
  return optionOut(updated)
}

/** 設定選項「今日不供應 / 恢復供應」。店員也可以做 */
export async function setOptionAvailability(staff: StaffPrincipal, id: string, isAvailable: boolean) {
  const before = await findOption(staff.storeId, id)
  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.option.update({ where: { id }, data: { isAvailable } })
    await writeAudit(tx, {
      storeId: staff.storeId,
      actorId: staff.id,
      action: isAvailable ? 'menu.option_available' : 'menu.option_unavailable',
      entity: 'Option',
      entityId: id,
      meta: { name: before.name },
    })
    return row
  })
  return optionOut(updated)
}

export async function deleteOption(staff: StaffPrincipal, id: string) {
  const option = await findOption(staff.storeId, id)
  await prisma.$transaction(async (tx) => {
    await tx.option.delete({ where: { id } })
    await writeAudit(tx, { storeId: staff.storeId, actorId: staff.id, action: 'menu.option_delete', entity: 'Option', entityId: id, meta: { name: option.name } })
  })
}
