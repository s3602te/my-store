import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { errorResponse } from '../schemas/common.js'
import {
  createOrderBody,
  createOrderResponse,
  customerCancelBody,
  idempotencyHeaders,
  publicOrder,
  trackingParams,
} from '../schemas/order.js'
import { cancelOrderByCustomer, createOrder, getOrderByToken, toPublicOrder } from '../services/orderService.js'

/** 顧客端訂單:下單、用追蹤碼查詢、自行取消(都不需要登入) */
export const orderRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    '/orders',
    {
      schema: {
        tags: ['顧客'],
        summary: '送出訂單(外帶、現金到店付款)',
        description:
          '**價格由後端計算**,這裡不需要(也不能)傳價格。成功後會回傳「訂單編號」與「追蹤碼」,請妥善保存追蹤碼,用它才能查詢與取消訂單。\n\n' +
          '選填的 `Idempotency-Key` 標頭(至少 16 字元的隨機字串):同一把鍵重複送出,只會建立一張訂單(防止網路不穩時重複下單)。',
        body: createOrderBody,
        headers: idempotencyHeaders,
        response: {
          201: createOrderResponse,
          200: createOrderResponse,
          400: errorResponse,
          409: errorResponse,
          429: errorResponse,
        },
      },
      config: { rateLimit: { max: 10, timeWindow: '10 minutes' } },
    },
    async (request, reply) => {
      const { order, duplicate } = await createOrder(request.body, {
        now: app.clock(),
        idempotencyKey: request.headers['idempotency-key'],
      })
      return reply.status(duplicate ? 200 : 201).send({ order: toPublicOrder(order), duplicate })
    },
  )

  app.get(
    '/orders/:token',
    {
      schema: {
        tags: ['顧客'],
        summary: '用追蹤碼查詢訂單狀態',
        params: trackingParams,
        response: { 200: publicOrder, 404: errorResponse },
      },
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    },
    async (request) => toPublicOrder(await getOrderByToken(request.params.token)),
  )

  app.post(
    '/orders/:token/cancel',
    {
      schema: {
        tags: ['顧客'],
        summary: '顧客自行取消訂單(只限「待接單」階段)',
        description: '店家一旦接單,就不能自行取消,需要直接聯絡店家。',
        params: trackingParams,
        body: customerCancelBody,
        response: { 200: publicOrder, 404: errorResponse, 409: errorResponse },
      },
      config: { rateLimit: { max: 20, timeWindow: '10 minutes' } },
    },
    async (request) => toPublicOrder(await cancelOrderByCustomer(request.params.token, request.body?.reason, app.clock())),
  )
}
