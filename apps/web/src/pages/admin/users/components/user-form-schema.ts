import { z } from 'zod';

export const GB = 1024 ** 3;

const optionalPositiveInt = z.preprocess(
  (value) => (value === '' || value === null || value === undefined ? undefined : value),
  z.coerce.number().int().min(1).optional()
);

export const createUserSchema = z
  .object({
    email: z.string().email('请输入有效的邮箱地址'),
    password: z.string().min(8, '密码至少 8 位').max(64),
    role: z.enum(['USER', 'ADMIN']).default('USER'),
    planId: z.string().optional(),
    quotaGB: z.coerce.number().min(1, '配额至少 1 GB').max(1048576, '过大'),
    permanent: z.boolean().default(false),
    expireAt: z.string().optional()
  })
  .refine((value) => value.permanent || !!value.expireAt, {
    message: '请填写到期日期或选择永久有效',
    path: ['expireAt']
  });

export const editAccountSchema = z.object({
  role: z.enum(['USER', 'ADMIN']),
  isActive: z.boolean(),
  password: z.string().min(8, '密码至少 8 位').max(64).optional().or(z.literal(''))
});

export const subscriptionSchema = z.object({
  planId: z.string().optional(),
  status: z.enum(['ACTIVE', 'CANCELED', 'EXPIRED', 'REVOKED']),
  quotaGB: z.coerce.number().positive('配额必须大于 0'),
  usedGB: z.coerce.number().min(0, '已用流量不能为负数'),
  expireAt: z.string().optional(),
  addDays: optionalPositiveInt,
  extraLineIds: z.array(z.string()).default([])
});

export type CreateUserForm = z.infer<typeof createUserSchema>;
export type EditAccountForm = z.infer<typeof editAccountSchema>;
export type SubscriptionForm = z.infer<typeof subscriptionSchema>;

export function dateInputAfterDays(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function dateInputToIso(value: string): string | null {
  return value ? new Date(`${value}T23:59:59Z`).toISOString() : null;
}
