import type { FastifyInstance } from 'fastify'
import { config } from '../config.js'
import { prisma } from '../db.js'

/**
 * GET /api/menu — 顧客看到的菜單。
 * - 只回傳「上架」的分類與餐點(isActive = true);下架的不會出現。
 * - 「售完」的餐點(isAvailable = false)仍會回傳,讓前端顯示「售完」並禁止點選。
 */
export async function menuRoutes(app: FastifyInstance) {
  app.get('/menu', async (_request, reply) => {
    const store = await prisma.store.findUnique({
      where: { slug: config.storeSlug },
      select: { id: true, name: true, acceptingOrders: true },
    })

    if (!store) {
      return reply.status(503).send({
        error: { code: 'STORE_NOT_CONFIGURED', message: '找不到店家資料,請先執行資料庫 seed' },
      })
    }

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
  })
}
