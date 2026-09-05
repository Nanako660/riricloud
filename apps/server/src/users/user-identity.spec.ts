import { defaultUserNickname, generateUniqueUserUid } from './user-identity';

describe('user identity helpers', () => {
  it('分配六位范围内的随机 UID，并在碰撞后继续尝试', async () => {
    const findUnique = jest.fn().mockResolvedValueOnce({ id: 'existing' }).mockResolvedValueOnce(null);
    const uid = await generateUniqueUserUid({ findUnique });
    expect(uid).toBeGreaterThanOrEqual(100000);
    expect(uid).toBeLessThanOrEqual(999999);
    expect(findUnique).toHaveBeenCalledTimes(2);
  });

  it('为空 UID 生成稳定的默认昵称', () => {
    expect(defaultUserNickname(123456)).toBe('用户_123456');
  });
});
