import { z } from 'zod';
import { passwordZodSchema, type PasswordStrengthPolicy } from '@/lib/password-policy';

export const GB = 1024 ** 3;

const optionalPositiveInt = z.preprocess(
  (value) => (value === '' || value === null || value === undefined ? undefined : value),
  z.coerce.number().int().min(1).optional()
);

export function buildCreateUserSchema(minLength: number, policy: PasswordStrengthPolicy) {
  return z.object({
    email: z.string().email('请输入有效的邮箱地址'),
    password: passwordZodSchema(minLength, policy),
    role: z.enum(['USER', 'ADMIN']).default('USER'),
    planId: z.string().optional()
  });
}

export function buildEditAccountSchema(minLength: number, policy: PasswordStrengthPolicy) {
  return z.object({
    role: z.enum(['USER', 'ADMIN']),
    isActive: z.boolean(),
    emailVerified: z.boolean(),
    password: passwordZodSchema(minLength, policy).optional().or(z.literal(''))
  });
}

export const subscriptionSchema = z.object({
  planId: z.string().optional(),
  status: z.enum(['ACTIVE', 'CANCELED', 'EXPIRED', 'REVOKED']),
  quotaGB: z.coerce.number().min(0, '配额不能为负数'),
  usedGB: z.coerce.number().min(0, '已用流量不能为负数'),
  expireAt: z.string().optional(),
  addDays: optionalPositiveInt,
  extraLineIds: z.array(z.string()).default([])
});

export type CreateUserForm = z.infer<ReturnType<typeof buildCreateUserSchema>>;
export type EditAccountForm = z.infer<ReturnType<typeof buildEditAccountSchema>>;
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
