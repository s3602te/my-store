import { z } from 'zod'
import { dateTime, nullableDateTime } from './common.js'

/** 密碼規則:至少 10 個字元(長度比複雜度重要),最多 200 */
export const newPassword = z.string().min(10, '密碼至少需要 10 個字元').max(200, '密碼太長了')

export const changePasswordBody = z.object({
  currentPassword: z.string().min(1, '請輸入目前的密碼').max(200),
  newPassword,
})

/** 老闆只能建立「店長」或「店員」帳號;老闆帳號不能透過 API 建立或修改 */
const manageableRole = z.enum(['MANAGER', 'STAFF'])

export const createStaffBody = z.object({
  // 先去掉空白、轉小寫,再檢查格式(z.email() 會在去空白之前檢查,所以改用 regex)
  email: z.string().trim().toLowerCase().max(200).regex(z.regexes.email, 'Email 格式不正確'),
  name: z.string().trim().min(1, '請填寫姓名').max(50, '姓名太長了'),
  role: manageableRole,
})

export const updateStaffBody = z
  .object({
    name: z.string().trim().min(1, '請填寫姓名').max(50),
    role: manageableRole,
    isActive: z.boolean(),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, '請至少修改一個欄位')

export const staffOut = z.object({
  id: z.uuid(),
  email: z.string(),
  name: z.string(),
  role: z.enum(['OWNER', 'MANAGER', 'STAFF']),
  isActive: z.boolean(),
  lastLoginAt: nullableDateTime,
  createdAt: dateTime,
})

export const staffWithTempPassword = z.object({
  staff: staffOut,
  temporaryPassword: z.string().describe('臨時密碼,**只會顯示這一次**,請轉交給員工並請他登入後立刻修改'),
})
