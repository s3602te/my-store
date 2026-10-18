import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { currentStaff, requireRole } from '../../plugins/auth.js'
import { errorResponse, idParams } from '../../schemas/common.js'
import { adminOrder, listOrdersQuery, listOrdersResponse, staffReasonBody, staffStatusBody } from '../../schemas/order.js'
import {
  changeOrderStatus,
  confirmCashPayment,
  getOrderForStaff,
  listOrdersForStaff,
  toAdminOrder,
} from '../../services/orderService.js'

const security = [{ cookieAuth: [] }]
const errors = { 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse, 409: errorResponse }

/** 後台訂單:所有登入的員工(店員以上)都可以處理 */
export const adminOrderRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', requireRole('STAFF'))

  app.get(
    '/orders',
    {
      schema: {
        tags: ['後台-訂單'],
        summary: '訂單列表(預設今天)',
        description: '可用 `status`(逗號分隔)與 `date` 篩選。回應的 `counts` 是當天各狀態的訂單數,方便顯示「待接單 3」這類數字。',
        security,
        querystring: listOrdersQuery,
        response: { 200: listOrdersResponse, 400: errorResponse, 401: errorResponse },
      },
    },
    async (request) => {
      const result = await listOrdersForStaff(currentStaff(request), request.query, app.clock())
      return { ...result, orders: result.orders.map(toAdminOrder) }
    },
  )

  app.get(
    '/orders/:id',
    {
      schema: { tags: ['後台-訂單'], summary: '訂單詳情', security, params: idParams, response: { 200: adminOrder, ...errors } },
    },
    async (request) => toAdminOrder(await getOrderForStaff(currentStaff(request), request.params.id)),
  )

  app.post(
    '/orders/:id/accept',
    {
      schema: { tags: ['後台-訂單'], summary: '接單(待接單 → 已接單)', security, params: idParams, response: { 200: adminOrder, ...errors } },
    },
    async (request) =>
      toAdminOrder(await changeOrderStatus(currentStaff(request), request.params.id, 'ACCEPTED', undefined, app.clock())),
  )

  app.post(
    '/orders/:id/reject',
    {
      schema: {
        tags: ['後台-訂單'],
        summary: '拒絕接單(待接單 → 店家拒絕),必須填原因',
        security,
        params: idParams,
        body: staffReasonBody,
        response: { 200: adminOrder, ...errors },
      },
    },
    async (request) =>
      toAdminOrder(await changeOrderStatus(currentStaff(request), request.params.id, 'REJECTED', request.body.reason, app.clock())),
  )

  app.post(
    '/orders/:id/status',
    {
      schema: {
        tags: ['後台-訂單'],
        summary: '推進訂單狀態(製作中、可取餐、已完成、取消)',
        description:
          '只能依序前進,不能跳級或倒退:待接單 → 已接單 → 製作中 → 可取餐 → 已完成。取消(CANCELLED)必須填 `reason`;**完成(COMPLETED)之前必須先按「已收現金」**。',
        security,
        params: idParams,
        body: staffStatusBody,
        response: { 200: adminOrder, ...errors },
      },
    },
    async (request) =>
      toAdminOrder(
        await changeOrderStatus(currentStaff(request), request.params.id, request.body.status, request.body.reason, app.clock()),
      ),
  )

  app.post(
    '/orders/:id/payments/cash-confirm',
    {
      schema: {
        tags: ['後台-訂單'],
        summary: '確認已收現金',
        description: '只有「已接單 / 製作中 / 可取餐」的訂單可以收款。重複收款會被拒絕。',
        security,
        params: idParams,
        response: { 200: adminOrder, ...errors },
      },
    },
    async (request) => toAdminOrder(await confirmCashPayment(currentStaff(request), request.params.id, app.clock())),
  )
}
