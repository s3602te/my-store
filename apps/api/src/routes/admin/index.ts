import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { checkOrigin } from '../../plugins/auth.js'
import { adminAuthRoutes } from './auth.js'
import { adminMenuRoutes } from './menu.js'
import { adminOrderRoutes } from './orders.js'
import { adminStaffRoutes } from './staff.js'
import { adminStoreRoutes } from './store.js'

/** 後台所有路由(網址前綴 /api/admin)。先統一檢查請求來源(防 CSRF),再各自檢查登入與角色 */
export const adminRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', checkOrigin)

  await app.register(adminAuthRoutes)
  await app.register(adminOrderRoutes)
  await app.register(adminMenuRoutes)
  await app.register(adminStoreRoutes)
  await app.register(adminStaffRoutes)
}
