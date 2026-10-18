import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { errorResponse } from '../schemas/common.js'
import { publicStore } from '../schemas/store.js'
import { getStore, toPublicStore } from '../services/storeService.js'

export const storeRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/store',
    {
      schema: {
        tags: ['顧客'],
        summary: '店家資訊(營業時間、是否可以下單)',
        response: { 200: publicStore, 503: errorResponse },
      },
    },
    async () => toPublicStore(await getStore(), app.clock()),
  )
}
