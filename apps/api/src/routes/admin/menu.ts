import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { currentStaff, requireRole } from '../../plugins/auth.js'
import { errorResponse, idParams, okResponse } from '../../schemas/common.js'
import {
  availabilityBody,
  categoryBody,
  categoryOut,
  categoryUpdateBody,
  groupBody,
  groupOut,
  groupUpdateBody,
  itemBody,
  itemOut,
  itemUpdateBody,
  optionCreateBody,
  optionOut,
  optionUpdateBody,
} from '../../schemas/menu.js'
import * as menu from '../../services/menuAdminService.js'

const security = [{ cookieAuth: [] }]
const errors = { 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse, 409: errorResponse }

/**
 * 後台菜單管理。
 * 權限:看與「售完/恢復供應」店員就可以;新增、修改、刪除需要店長以上。
 */
export const adminMenuRoutes: FastifyPluginAsyncZod = async (app) => {
  const staff = requireRole('STAFF')
  const manager = requireRole('MANAGER')
  const tags = ['後台-菜單']

  // ── 分類 ──
  app.get('/menu/categories', {
    schema: { tags, summary: '分類列表(含下架的)', security, response: { 200: z.array(categoryOut), 401: errorResponse } },
    onRequest: [staff],
  }, async (request) => menu.listCategories(currentStaff(request).storeId))

  app.post('/menu/categories', {
    schema: { tags, summary: '新增分類 — 店長以上', security, body: categoryBody, response: { 201: categoryOut, ...errors } },
    onRequest: [manager],
  }, async (request, reply) => reply.status(201).send(await menu.createCategory(currentStaff(request), request.body)))

  app.patch('/menu/categories/:id', {
    schema: { tags, summary: '修改分類 — 店長以上', security, params: idParams, body: categoryUpdateBody, response: { 200: categoryOut, ...errors } },
    onRequest: [manager],
  }, async (request) => menu.updateCategory(currentStaff(request), request.params.id, request.body))

  app.delete('/menu/categories/:id', {
    schema: { tags, summary: '刪除分類(底下沒有餐點才能刪)— 店長以上', security, params: idParams, response: { 200: okResponse, ...errors } },
    onRequest: [manager],
  }, async (request) => {
    await menu.deleteCategory(currentStaff(request), request.params.id)
    return { ok: true as const }
  })

  // ── 餐點 ──
  app.get('/menu/items', {
    schema: { tags, summary: '餐點列表(含下架、售完的)', security, response: { 200: z.array(itemOut), 401: errorResponse } },
    onRequest: [staff],
  }, async (request) => menu.listItems(currentStaff(request).storeId))

  app.post('/menu/items', {
    schema: { tags, summary: '新增餐點 — 店長以上', security, body: itemBody, response: { 201: itemOut, ...errors } },
    onRequest: [manager],
  }, async (request, reply) => reply.status(201).send(await menu.createItem(currentStaff(request), request.body)))

  app.patch('/menu/items/:id', {
    schema: {
      tags,
      summary: '修改餐點(價格、說明、上下架、選項群組…)— 店長以上',
      description: '只會更新有傳的欄位,沒傳的欄位維持原樣。傳 `optionGroupIds` 會整組取代這道餐點的選項群組。',
      security,
      params: idParams,
      body: itemUpdateBody,
      response: { 200: itemOut, ...errors },
    },
    onRequest: [manager],
  }, async (request) => menu.updateItem(currentStaff(request), request.params.id, request.body))

  app.post('/menu/items/:id/availability', {
    schema: {
      tags,
      summary: '設定「今日售完 / 恢復供應」— 店員就可以',
      security,
      params: idParams,
      body: availabilityBody,
      response: { 200: itemOut, ...errors },
    },
    onRequest: [staff],
  }, async (request) => menu.setItemAvailability(currentStaff(request), request.params.id, request.body.isAvailable))

  app.delete('/menu/items/:id', {
    schema: { tags, summary: '刪除餐點(歷史訂單不受影響)— 店長以上', security, params: idParams, response: { 200: okResponse, ...errors } },
    onRequest: [manager],
  }, async (request) => {
    await menu.deleteItem(currentStaff(request), request.params.id)
    return { ok: true as const }
  })

  // ── 選項群組 ──
  app.get('/menu/option-groups', {
    schema: { tags, summary: '選項群組列表(含選項)', security, response: { 200: z.array(groupOut), 401: errorResponse } },
    onRequest: [staff],
  }, async (request) => menu.listGroups(currentStaff(request).storeId))

  app.post('/menu/option-groups', {
    schema: { tags, summary: '新增選項群組(可一併建立選項)— 店長以上', security, body: groupBody, response: { 201: groupOut, ...errors } },
    onRequest: [manager],
  }, async (request, reply) => reply.status(201).send(await menu.createGroup(currentStaff(request), request.body)))

  app.patch('/menu/option-groups/:id', {
    schema: { tags, summary: '修改選項群組 — 店長以上', security, params: idParams, body: groupUpdateBody, response: { 200: groupOut, ...errors } },
    onRequest: [manager],
  }, async (request) => menu.updateGroup(currentStaff(request), request.params.id, request.body))

  app.delete('/menu/option-groups/:id', {
    schema: { tags, summary: '刪除選項群組 — 店長以上', security, params: idParams, response: { 200: okResponse, ...errors } },
    onRequest: [manager],
  }, async (request) => {
    await menu.deleteGroup(currentStaff(request), request.params.id)
    return { ok: true as const }
  })

  // ── 選項 ──
  app.post('/menu/option-groups/:id/options', {
    schema: { tags, summary: '在群組裡新增選項 — 店長以上', security, params: idParams, body: optionCreateBody, response: { 201: optionOut, ...errors } },
    onRequest: [manager],
  }, async (request, reply) => reply.status(201).send(await menu.createOption(currentStaff(request), request.params.id, request.body)))

  app.patch('/menu/options/:id', {
    schema: { tags, summary: '修改選項(名稱、加價)— 店長以上', security, params: idParams, body: optionUpdateBody, response: { 200: optionOut, ...errors } },
    onRequest: [manager],
  }, async (request) => menu.updateOption(currentStaff(request), request.params.id, request.body))

  app.post('/menu/options/:id/availability', {
    schema: { tags, summary: '設定選項「今日不供應 / 恢復供應」— 店員就可以', security, params: idParams, body: availabilityBody, response: { 200: optionOut, ...errors } },
    onRequest: [staff],
  }, async (request) => menu.setOptionAvailability(currentStaff(request), request.params.id, request.body.isAvailable))

  app.delete('/menu/options/:id', {
    schema: { tags, summary: '刪除選項 — 店長以上', security, params: idParams, response: { 200: okResponse, ...errors } },
    onRequest: [manager],
  }, async (request) => {
    await menu.deleteOption(currentStaff(request), request.params.id)
    return { ok: true as const }
  })
}
