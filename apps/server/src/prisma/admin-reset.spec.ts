// Prisma seed helpers are CommonJS runtime scripts and are loaded as-is in Jest.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { resetAdminPassword } = require('../../prisma/admin-reset.js') as {
  resetAdminPassword: (client: unknown, email: string, password: string) => Promise<unknown>;
};

describe('admin reset', () => {
  it('重置管理员密码时递增 sessionVersion', async () => {
    const update = jest.fn().mockResolvedValue({ id: 'admin-1' });
    const client = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 'admin-1', role: 'ADMIN' }),
        update
      }
    };

    await resetAdminPassword(client, 'Admin@Example.com', 'New-admin-password1!');

    expect(update).toHaveBeenCalledWith({
      where: { id: 'admin-1' },
      data: { passwordHash: expect.any(String), sessionVersion: { increment: 1 } }
    });
  });

  it('不会为不存在或非管理员账号重置密码', async () => {
    const update = jest.fn();
    const client = { user: { findUnique: jest.fn().mockResolvedValue({ id: 'user-1', role: 'USER' }), update } };

    await expect(resetAdminPassword(client, 'user@example.com', 'new-password')).rejects.toThrow('不是 ADMIN');
    expect(update).not.toHaveBeenCalled();
  });

  it('读取系统设置执行管理员密码最小长度', async () => {
    const update = jest.fn().mockResolvedValue({ id: 'admin-1' });
    const client = {
      systemSetting: { findMany: jest.fn().mockResolvedValue([{ key: 'passwordMinLength', value: '12' }]) },
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 'admin-1', role: 'ADMIN' }),
        update
      }
    };

    await expect(resetAdminPassword(client, 'admin@example.com', 'Short1!')).rejects.toThrow('12-64');
    expect(update).not.toHaveBeenCalled();
  });

  it('重置密码遵循配置的字符类别要求', async () => {
    const update = jest.fn().mockResolvedValue({ id: 'admin-1' });
    const client = {
      systemSetting: { findMany: jest.fn().mockResolvedValue([{ key: 'passwordRequireSpecial', value: 'true' }]) },
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 'admin-1', role: 'ADMIN' }),
        update
      }
    };

    await expect(resetAdminPassword(client, 'admin@example.com', 'Password123')).rejects.toThrow('密码必须包含：小写字母、数字、特殊字符');
    await resetAdminPassword(client, 'admin@example.com', 'Password123!');
    expect(update).toHaveBeenCalledWith({
      where: { id: 'admin-1' },
      data: { passwordHash: expect.any(String), sessionVersion: { increment: 1 } }
    });
  });
});
