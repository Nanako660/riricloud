import * as bcrypt from 'bcryptjs';

// Prisma seed helpers are CommonJS runtime scripts and are loaded as-is in Jest.
const {
  ensureAdmin,
  resolveAdminCredentials,
  resolvePasswordPolicy,
  validateAdminEmail,
  validateAdminPassword
// eslint-disable-next-line @typescript-eslint/no-require-imports
} = require('../../prisma/admin-bootstrap') as {
  ensureAdmin: (prisma: MockPrisma, options?: { allowDemoDefaults?: boolean }) => Promise<{ admin: User; created: boolean }>;
  resolveAdminCredentials: (env: NodeJS.ProcessEnv, options?: { allowDemoDefaults?: boolean }) => {
    email: string | null;
    password: string | null;
  };
  resolvePasswordPolicy: (prisma: MockPrisma) => Promise<{ passwordMinLength: number } & Record<string, boolean>>;
  validateAdminEmail: (value: unknown) => string;
  validateAdminPassword: (value: unknown, minimum?: number, complexity?: Record<string, boolean>) => string;
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ensureMasterAgentNode, resolveMasterLocalHost } = require('../../prisma/master-agent-bootstrap') as {
  ensureMasterAgentNode: (prisma: MockPrisma, env?: NodeJS.ProcessEnv) => Promise<{ node: Node; created: boolean }>;
  resolveMasterLocalHost: (env: NodeJS.ProcessEnv) => string;
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ensureDefaultTemplate, buildDefaultTemplateData } = require('../../prisma/default-template') as {
  ensureDefaultTemplate: (prisma: MockPrisma) => Promise<{ template: Record<string, unknown>; created: boolean }>;
  buildDefaultTemplateData: (isDefault?: boolean) => Record<string, unknown>;
};

type User = { id: string; email: string; role: string; passwordHash?: string };
type MockPrisma = {
  systemSetting?: { findMany: jest.Mock };
  user: {
    findFirst: jest.Mock;
    findUnique: jest.Mock;
    create: jest.Mock;
  };
  node: {
    findFirst: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  subscriptionTemplate: {
    findFirst: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
};

type Node = { id: string; name: string; serverHost: string; isLocal: boolean; agentToken: string; status: string };

describe('管理员 bootstrap', () => {
  const originalEnv = { ...process.env };
  let prisma: MockPrisma;

  beforeEach(() => {
    prisma = {
      user: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn()
      },
      node: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn()
      },
      subscriptionTemplate: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn()
      }
    };
    delete process.env.ADMIN_EMAIL;
    delete process.env.ADMIN_PASSWORD;
    delete process.env.SEED_ADMIN_EMAIL;
    delete process.env.SEED_ADMIN_PASSWORD;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('正式 ADMIN_* 配置优先于兼容的 SEED_ADMIN_* 配置', () => {
    const credentials = resolveAdminCredentials({
      ADMIN_EMAIL: 'new@example.com',
      ADMIN_PASSWORD: 'New-password1!',
      SEED_ADMIN_EMAIL: 'legacy@example.com',
      SEED_ADMIN_PASSWORD: 'Legacy-password1!'
    });
    expect(credentials).toEqual({ email: 'new@example.com', password: 'New-password1!' });
  });

  it('已有管理员时跳过创建且不要求凭据', async () => {
    const existingAdmin = { id: 'admin-1', email: 'old@example.com', role: 'ADMIN' };
    prisma.user.findFirst.mockResolvedValue(existingAdmin);

    const result = await ensureAdmin(prisma);

    expect(result).toEqual({ admin: existingAdmin, created: false });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('空库缺少凭据时失败并提示正式配置名', async () => {
    prisma.user.findFirst.mockResolvedValue(null);

    await expect(ensureAdmin(prisma)).rejects.toThrow(/ADMIN_EMAIL.*ADMIN_PASSWORD/);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('空库使用正式配置创建首个管理员并哈希密码', async () => {
    process.env.ADMIN_EMAIL = 'admin@example.com';
    process.env.ADMIN_PASSWORD = 'Strong-password1!';
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockImplementation(async ({ data }: { data: User }) => ({
      ...data,
      id: 'admin-1'
    }));

    const result = await ensureAdmin(prisma);

    expect(result.created).toBe(true);
    expect(result.admin).toEqual(expect.objectContaining({ email: 'admin@example.com', role: 'ADMIN' }));
    expect(await bcrypt.compare('Strong-password1!', result.admin.passwordHash as string)).toBe(true);
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: {
        email: 'admin@example.com',
        passwordHash: expect.any(String),
        role: 'ADMIN'
      }
    });
  });

  it('不会把已存在的普通用户自动提权', async () => {
    process.env.ADMIN_EMAIL = 'user@example.com';
    process.env.ADMIN_PASSWORD = 'Strong-password1!';
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'user@example.com', role: 'USER' });

    await expect(ensureAdmin(prisma)).rejects.toThrow(/不会自动提权/);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('复用登录层的邮箱与密码约束', () => {
    expect(validateAdminEmail(' admin@example.com ')).toBe('admin@example.com');
    expect(() => validateAdminEmail('invalid-email')).toThrow();
    expect(validateAdminPassword('Strong-Password1!')).toBe('Strong-Password1!');
    expect(() => validateAdminPassword('12345678')).toThrow('密码必须包含：小写字母、数字');
    expect(() => validateAdminPassword('short')).toThrow(/8-64/);
    expect(() => validateAdminPassword('x'.repeat(65))).toThrow(/8-64/);
  });

  it('validateAdminPassword 支持自定义复杂度策略', () => {
    const complexity = { passwordRequireLowercase: true, passwordRequireUppercase: true, passwordRequireDigit: true, passwordRequireSpecial: false };
    expect(validateAdminPassword('Password123', 8, complexity)).toBe('Password123');
    expect(() => validateAdminPassword('password123', 8, complexity)).toThrow('密码必须包含：小写字母、大写字母、数字');
    expect(
      validateAdminPassword('only-length', 8, { passwordRequireLowercase: false, passwordRequireUppercase: false, passwordRequireDigit: false, passwordRequireSpecial: false })
    ).toBe('only-length');
  });

  it('resolvePasswordPolicy 键缺失时回退默认值', async () => {
    prisma.systemSetting = { findMany: jest.fn().mockResolvedValue([]) };
    await expect(resolvePasswordPolicy(prisma)).resolves.toEqual({
      passwordMinLength: 8,
      passwordRequireLowercase: true,
      passwordRequireUppercase: false,
      passwordRequireDigit: true,
      passwordRequireSpecial: false
    });
  });

  it('首管理员密码校验跟随系统设置的复杂度策略', async () => {
    process.env.ADMIN_EMAIL = 'admin@example.com';
    process.env.ADMIN_PASSWORD = 'Password123';
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.systemSetting = {
      findMany: jest.fn().mockResolvedValue([
        { key: 'passwordMinLength', value: '10' },
        { key: 'passwordRequireSpecial', value: 'true' }
      ])
    };
    prisma.user.create.mockImplementation(async ({ data }: { data: User }) => ({ ...data, id: 'admin-1' }));

    await expect(ensureAdmin(prisma)).rejects.toThrow('密码必须包含：小写字母、数字、特殊字符');

    process.env.ADMIN_PASSWORD = 'Password123!';
    const result = await ensureAdmin(prisma);
    expect(result.created).toBe(true);
  });

  it('创建并持久化 Master-Local 节点', async () => {
    const node = { id: 'node-local', name: 'Master-Local', serverHost: 'master.example.com', isLocal: true, agentToken: 'token', status: 'OFFLINE' };
    prisma.node.findFirst.mockResolvedValue(null);
    prisma.node.create.mockResolvedValue(node);

    const result = await ensureMasterAgentNode(prisma, { MASTER_LOCAL_HOST: 'master.example.com' });

    expect(result).toEqual({ node, created: true });
    expect(prisma.node.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: 'Master-Local',
        serverHost: 'master.example.com',
        isLocal: true,
        status: 'OFFLINE',
        agentToken: expect.any(String)
      })
    });
  });

  it('已有 Master-Local 时复用原节点和 Token，不覆盖配置', async () => {
    const node = { id: 'node-local', name: '自定义本机节点', serverHost: 'old.example.com', isLocal: true, agentToken: 'old-token', agentTokenHash: 'old-hash', status: 'ONLINE' };
    prisma.node.findFirst.mockResolvedValue(node);

    const result = await ensureMasterAgentNode(prisma, { MASTER_LOCAL_HOST: 'new.example.com' });

    expect(result).toEqual({ node, created: false });
    expect(prisma.node.create).not.toHaveBeenCalled();
    expect(prisma.node.update).not.toHaveBeenCalled();
  });

  it('显式传入 MASTER_LOCAL_AGENT_TOKEN 时创建并使用指定 Token', async () => {
    const node = { id: 'node-local', name: 'Master-Local', serverHost: '127.0.0.1', isLocal: true, agentToken: 'enc', agentTokenHash: 'hash', status: 'OFFLINE' };
    prisma.node.findFirst.mockResolvedValue(null);
    prisma.node.create.mockResolvedValue(node);

    const result = await ensureMasterAgentNode(prisma, { MASTER_LOCAL_AGENT_TOKEN: 'custom-token-123' });

    expect(result).toEqual({ node, created: true });
    expect(prisma.node.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: 'Master-Local',
        isLocal: true,
        agentTokenHash: expect.any(String)
      })
    });
  });

  it('显式传入 MASTER_LOCAL_AGENT_TOKEN 且与已有 TokenHash 不一致时同步更新 Token', async () => {
    const node = { id: 'node-local', name: 'Master-Local', serverHost: '127.0.0.1', isLocal: true, agentToken: 'old-enc', agentTokenHash: 'old-hash', status: 'ONLINE' };
    const updatedNode = { ...node, agentToken: 'new-enc', agentTokenHash: 'new-hash' };
    prisma.node.findFirst.mockResolvedValue(node);
    prisma.node.update.mockResolvedValue(updatedNode);

    const result = await ensureMasterAgentNode(prisma, { MASTER_LOCAL_AGENT_TOKEN: 'new-token-456' });

    expect(result).toEqual({ node: updatedNode, created: false });
    expect(prisma.node.update).toHaveBeenCalledWith({
      where: { id: 'node-local' },
      data: expect.objectContaining({
        agentToken: expect.any(String),
        agentTokenHash: expect.any(String)
      })
    });
  });

  it('从公网 URL 推导新本机节点的订阅地址', () => {
    expect(resolveMasterLocalHost({ RIRICLOUD_PUBLIC_URL: 'https://master.example.com:8443/panel' })).toBe('master.example.com');
    expect(resolveMasterLocalHost({})).toBe('127.0.0.1');
  });

  it('生产 bootstrap 在没有模板时创建内嵌默认模板', async () => {
    prisma.subscriptionTemplate.findFirst.mockResolvedValue(null);
    prisma.subscriptionTemplate.create.mockResolvedValue({ id: 'template-1', name: '默认通用全能分流模板' });

    const result = await ensureDefaultTemplate(prisma);

    expect(result).toEqual({ template: { id: 'template-1', name: '默认通用全能分流模板' }, created: true });
    expect(prisma.subscriptionTemplate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ...buildDefaultTemplateData(true),
        isBuiltin: true,
        isDefault: true
      })
    });
  });

  it('生产 bootstrap 已有内嵌模板时不覆盖管理员修改', async () => {
    const existing = { id: 'template-1', name: '管理员自定义默认模板', isBuiltin: true, isDefault: true };
    prisma.subscriptionTemplate.findFirst.mockResolvedValue(existing);

    const result = await ensureDefaultTemplate(prisma);

    expect(result).toEqual({ template: existing, created: false });
    expect(prisma.subscriptionTemplate.update).not.toHaveBeenCalled();
    expect(prisma.subscriptionTemplate.create).not.toHaveBeenCalled();
  });
});
