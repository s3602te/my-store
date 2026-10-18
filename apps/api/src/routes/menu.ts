import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { prisma } from '../db.js'
import { errorResponse } from '../schemas/common.js'
import { publicMenuResponse } from '../schemas/menu.js'
import { getStore } from '../services/storeService.js'

/**
 * GET /api/menu — 顧客看到的菜單。
 * - 只回傳「上架」的分類與餐點(isActive = true);下架的不會出現。
 * - 「售完」的餐點(isAvailable = false)仍會回傳,讓前端顯示「售完」並禁止點選。
 */
export const menuRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/menu',
    {
      schema: {
        tags: ['顧客'],
        summary: '取得菜單',
        description: '分類、餐點、選項。下架的餐點不會出現;售完的餐點會出現但 isAvailable 為 false。',
        response: { 200: publicMenuResponse, 503: errorResponse },
      },
    },
    async () => {
      const store = await getStore()

      const categories = await prisma.menuCategory.findMany({
        where: { storeId: store.id, isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: {
          id: true,
          name: true,
          items: {
            where: { isActive: true },
            orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
            select: {
              id: true,
              name: true,
              description: true,
              price: true,
              imageUrl: true,
              isAvailable: true,
              optionGroups: {
                orderBy: { sortOrder: 'asc' },
                select: {
                  optionGroup: {
                    select: {
                      id: true,
                      name: true,
                      minSelect: true,
                      maxSelect: true,
                      options: {
                        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
                        select: { id: true, name: true, priceDelta: true, isAvailable: true },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      })

      return {
        store: { name: store.name, acceptingOrders: store.acceptingOrders },
        categories: categories.map((category) => ({
          id: category.id,
          name: category.name,
          items: category.items.map(({ optionGroups, ...item }) => ({
            ...item,
            optionGroups: optionGroups.map((link) => link.optionGroup),
          })),
        })),
      }
    },
  )
}
