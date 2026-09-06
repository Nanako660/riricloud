import { randomInt } from 'node:crypto';

export const USER_UID_MIN = 100000;
export const USER_UID_MAX = 999999;

type UserUidDelegate = {
  findUnique: (args: { where: { uid: number } }) => Promise<unknown>;
};

export async function generateUniqueUserUid(user: UserUidDelegate): Promise<number> {
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const uid = randomInt(USER_UID_MIN, USER_UID_MAX + 1);
    if (!(await user.findUnique({ where: { uid } }))) return uid;
  }
  throw new Error('无法分配唯一用户 UID');
}

export function defaultUserNickname(uid: number | null | undefined): string {
  return `用户_${uid ?? '未知'}`;
}

export function normalizeNickname(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function isUidUniqueConstraintError(error: unknown): boolean {
  return isUniqueConstraintError(error, 'uid');
}

export function isUniqueConstraintError(error: unknown, field: string): boolean {
  const candidate = error as { code?: string; meta?: { target?: unknown } } | null;
  const target = candidate?.meta?.target;
  return candidate?.code === 'P2002' && (target === field || (Array.isArray(target) && target.includes(field)));
}
