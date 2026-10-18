import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { currentStaff, requireRole } from '../../plugins/auth.js'
import { errorResponse } from '../../schemas/common.js'
import { adminStore, updateStoreBody } from '../../schemas/store.js'
import { getStore, toAdminStore, updateStore } from '../../services/storeService.js'

const security = [{ cookieAuth: [] }]

export const adminStoreRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/store',
    {
      schema: {
        tags: ['後台-店家'],
        summary: '店家設定',
        security,
        response: { 200: adminStore, 401: errorResponse },
      },
      onRequest: [requireRole('STAFF')],
    },
    async () => toAdminStore(await getStore(), app.clock()),
  )

  app.patch(
    '/store',
    {
      schema: {
        tags: ['後台-店家'],
        summary: '修改店家設定(暫停接單、營業時間、備餐時間)— 店長以上',
        security,
        body: updateStoreBody,
        response: { 200: adminStore, 400: errorResponse, 401: errorResponse, 403: errorResponse },
      },
      onRequest: [requireRole('MANAGER')],
    },
    async (request) => {
      const staff = currentStaff(request)
      const store = await updateStore(staff.storeId, staff.id, request.body)
      return toAdminStore(store, app.clock())
    },
  )
}
