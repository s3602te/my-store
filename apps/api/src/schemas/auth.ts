import { z } from 'zod'

export const loginBody = z.object({
  email: z.string().trim().toLowerCase().min(1, '請輸入 Email').max(200),
  password: z.string().min(1, '請輸入密碼').max(200),
})

export const staffRole = z.enum(['OWNER', 'MANAGER', 'STAFF'])

export const staffProfile = z.object({
  id: z.uuid(),
  email: z.string(),
  name: z.string(),
  role: staffRole,
  storeId: z.uuid(),
})
export type StaffProfile = z.infer<typeof staffProfile>

export const loginResponse = z.object({ staff: staffProfile })
