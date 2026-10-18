import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { currentStaff, requireRole } from '../../plugins/auth.js'
import { errorResponse, idParams } from '../../schemas/common.js'
import { createStaffBody, staffOut, staffWithTempPassword, updateStaffBody } from '../../schemas/staff.js'
import { createStaff, listStaff, resetStaffPassword, updateStaff } from '../../services/staffService.js'

const security = [{ cookieAuth: [] }]
const errors = { 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse, 409: errorResponse }

/** 員工帳號管理:只有老闆(OWNER)可以 */
export const adminStaffRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', requireRole('OWNER'))
  const tags = ['後台-員工(老闆)']

  app.get('/staff', {
    schema: { tags, summary: '員工列表', security, response: { 200: z.array(staffOut), 401: errorResponse, 403: errorResponse } },
  }, async (request) => listStaff(currentStaff(request).storeId))

  app.post('/staff', {
    schema: {
      tags,
      summary: '新增員工(店長或店員)',
      description: '系統會產生一組**臨時密碼,只在這次回應顯示一次**。請轉交給員工,並請他登入後立刻修改密碼。',
      security,
      body: createStaffBody,
      response: { 201: staffWithTempPassword, ...errors },
    },
  }, async (request, reply) => reply.status(201).send(await createStaff(currentStaff(request), request.body)))

  app.patch('/staff/:id', {
    schema: {
      tags,
      summary: '修改員工(姓名、角色、啟用/停用)',
      description: '停用員工,或修改角色,會立刻讓他目前所有的登入失效。老闆帳號與自己的帳號不能在這裡修改。',
      security,
      params: idParams,
      body: updateStaffBody,
      response: { 200: staffOut, ...errors },
    },
  }, async (request) => updateStaff(currentStaff(request), request.params.id, request.body))

  app.post('/staff/:id/reset-password', {
    schema: {
      tags,
      summary: '重設員工密碼(產生新的臨時密碼)',
      security,
      params: idParams,
      response: { 200: staffWithTempPassword, ...errors },
    },
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (request) => resetStaffPassword(currentStaff(request), request.params.id))
}
