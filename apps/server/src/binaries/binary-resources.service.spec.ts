import { ConflictException, BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BinaryResourcesService } from './binary-resources.service';

describe('BinaryResourcesService', () => {
  let service: BinaryResourcesService;
  let dataDir: string;

  const release = (overrides: Record<string, unknown> = {}) => ({
    id: 'release-singbox-1',
    kind: 'SINGBOX',
    upstreamVersion: '1.14.0',
    revision: 1,
    source: 'BUILTIN',
    status: 'ACTIVE',
    builtFromAppVersion: '0.5.0',
    compatibilityJson: '{}',
    notes: null,
    isDefault: true,
    ...overrides
  });

  const prisma = {
    binaryRelease: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      upsert: jest.fn(),
      count: jest.fn(),
      delete: jest.fn()
    },
    binaryAsset: { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn(), upsert: jest.fn(), deleteMany: jest.fn() },
    binaryAssetFile: { deleteMany: jest.fn(), create: jest.fn(), createMany: jest.fn() },
    binaryDeploymentTask: { findMany: jest.fn(), count: jest.fn() },
    binaryAuditLog: { create: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    user: { findMany: jest.fn() },
    $transaction: jest.fn()
  };
  prisma.$transaction.mockImplementation(async (arg: unknown) => {
    if (Array.isArray(arg)) return Promise.all(arg as Promise<unknown>[]);
    return (arg as (tx: typeof prisma) => Promise<unknown>)(prisma);
  });
  const binaries = { refresh: jest.fn(async () => undefined), getAsset: jest.fn() };

  beforeAll(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'riricloud-binary-resources-'));
    process.env.RIRICLOUD_DATA_DIR = dataDir;
    service = new BinaryResourcesService(prisma as never, binaries as never);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.binaryRelease.findMany.mockResolvedValue([]);
    prisma.binaryRelease.findUnique.mockResolvedValue(null);
    prisma.binaryRelease.create.mockResolvedValue(release());
    prisma.binaryRelease.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...release(), ...data }));
    prisma.binaryRelease.upsert.mockResolvedValue(release());
    prisma.binaryAsset.findFirst.mockResolvedValue(null);
    prisma.binaryAsset.upsert.mockResolvedValue({ id: 'asset-1' });
    prisma.binaryAssetFile.deleteMany.mockResolvedValue({ count: 0 });
    prisma.binaryAssetFile.createMany.mockResolvedValue({ count: 0 });
    prisma.binaryAuditLog.create.mockResolvedValue({ id: 'audit-1' });
  });

  afterAll(async () => {
    delete process.env.RIRICLOUD_DATA_DIR;
    await rm(dataDir, { recursive: true, force: true });
  });

  function digest(body: Buffer) {
    return createHash('sha256').update(body).digest('hex');
  }

  async function syncManifestResource(options: {
    appVersion: string;
    root: string;
    main: Buffer;
    auxiliary?: Buffer;
  }) {
    const mainPath = join(options.root, 'sing-box');
    await writeFile(mainPath, options.main);
    const files = [{ name: 'sing-box', role: 'main', path: 'sing-box', sha256: digest(options.main) }];
    if (options.auxiliary) {
      const auxiliaryPath = join(options.root, 'libcronet.so');
      await writeFile(auxiliaryPath, options.auxiliary);
      files.push({ name: 'libcronet.so', role: 'auxiliary', path: 'libcronet.so', sha256: digest(options.auxiliary) });
    }
    await (service as unknown as { upsertManifestResource: (root: string, resource: unknown) => Promise<void> }).upsertManifestResource(options.root, {
      kind: 'SINGBOX',
      upstreamVersion: '1.14.0',
      revision: 1,
      source: 'BUILTIN',
      status: 'ACTIVE',
      builtFromAppVersion: options.appVersion,
      isDefault: true,
      cronetVersion: 'v150.0.7871.63-2',
      assets: [{ target: 'singbox-linux-amd64', os: 'linux', arch: 'amd64', files }]
    });
  }

  it('应用版本变化时复用同一 Sing-box 资源身份和文件哈希', async () => {
    const root = await mkdtemp(join(dataDir, 'manifest-'));
    const main = Buffer.from('sing-box-1.14.0');
    const auxiliary = Buffer.from('cronet-v150');
    const existing = release({ status: 'DISABLED', isDefault: false });
    prisma.binaryRelease.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existing);
    prisma.binaryRelease.create.mockResolvedValueOnce(release({ builtFromAppVersion: '0.5.0' }));
    prisma.binaryRelease.update.mockResolvedValueOnce(existing);

    await syncManifestResource({ appVersion: '0.5.0', root, main, auxiliary });
    await syncManifestResource({ appVersion: '0.5.1', root, main, auxiliary });

    expect(prisma.binaryRelease.create).toHaveBeenCalledTimes(1);
    expect(prisma.binaryRelease.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: existing.id },
      data: expect.objectContaining({ builtFromAppVersion: '0.5.1' })
    }));
    expect(prisma.binaryAsset.upsert).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: { releaseId_target: { releaseId: existing.id, target: 'singbox-linux-amd64' } }
    }));
    expect(prisma.binaryRelease.update.mock.calls[0][0].data).not.toHaveProperty('status');
    expect(prisma.binaryRelease.update.mock.calls[0][0].data).not.toHaveProperty('isDefault');

    const createdFiles = prisma.binaryAssetFile.createMany.mock.calls[0][0].data as Array<{ name: string; sha256: string }>;
    expect(createdFiles).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'sing-box', role: 'main', storageRoot: 'RUNTIME', storagePath: 'sing-box', sha256: digest(main), size: main.length }),
      expect.objectContaining({ name: 'libcronet.so', role: 'auxiliary', storageRoot: 'RUNTIME', storagePath: 'libcronet.so', sha256: digest(auxiliary), size: auxiliary.length })
    ]));
    await rm(root, { recursive: true, force: true });
  });

  it('启用资源只切换状态，不会隐式抢占默认资源', async () => {
    const disabled = release({ status: 'DISABLED', isDefault: false });
    prisma.binaryRelease.findUnique.mockResolvedValue(disabled);
    prisma.binaryRelease.update.mockResolvedValue({ ...disabled, status: 'ACTIVE' });

    await service.activate(disabled.id, 'admin-1');

    expect(prisma.binaryRelease.update).toHaveBeenCalledWith({ where: { id: disabled.id }, data: { status: 'ACTIVE' } });
    expect(prisma.binaryRelease.updateMany).not.toHaveBeenCalled();
  });

  it('节点协议版本不满足资源约束时阻止分发', async () => {
    const asset = {
      id: 'asset-1',
      target: 'singbox-linux-amd64',
      os: 'linux',
      arch: 'amd64',
      filename: 'sing-box',
      storageRoot: 'RUNTIME',
      storagePath: 'resources/asset/sing-box',
      sha256: 'a'.repeat(64),
      size: 10,
      available: true,
      files: [{ id: 'file-1', name: 'sing-box', role: 'main', sha256: 'a'.repeat(64), size: 10 }]
    };
    prisma.binaryRelease.findMany.mockResolvedValue([{ ...release({ compatibilityJson: JSON.stringify({ minAgentProtocolVersion: 2 }) }), assets: [asset] }]);

    await expect(service.resolveForNode('singbox', 'linux/amd64', 'agent-token', 'https://panel.example.com', undefined, { agentProtocolVersion: 1 }))
      .rejects.toThrow(ConflictException);
    expect(prisma.binaryRelease.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { kind: 'SINGBOX', status: 'ACTIVE' }
    }));
  });

  it('解析节点资源返回独立版本、主文件地址和辅助文件地址', async () => {
    const asset = {
      id: 'asset-1',
      target: 'singbox-linux-amd64',
      os: 'linux',
      arch: 'amd64',
      filename: 'sing-box',
      storageRoot: 'RUNTIME',
      storagePath: 'resources/asset/sing-box',
      sha256: 'a'.repeat(64),
      size: 10,
      available: true,
      files: [
        { id: 'file-1', name: 'sing-box', role: 'main', sha256: 'a'.repeat(64), size: 10 },
        { id: 'file-2', name: 'libcronet.so', role: 'auxiliary', sha256: 'b'.repeat(64), size: 20 }
      ]
    };
    prisma.binaryRelease.findMany.mockResolvedValue([{ ...release(), assets: [asset] }]);

    const result = await service.resolveForNode('singbox', 'linux/amd64', 'agent-token', 'https://panel.example.com', undefined, { agentProtocolVersion: 2 });

    expect(result).toEqual(expect.objectContaining({ version: '1.14.0-r1', resourceId: release().id, assetId: asset.id, sha256: asset.sha256 }));
    expect(result.files).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'file-1', role: 'main', url: expect.stringContaining('/api/v1/downloads/binary-files/file-1') }),
      expect.objectContaining({ id: 'file-2', role: 'auxiliary', url: expect.stringContaining('/api/v1/downloads/binary-files/file-2') })
    ]));
  });

  it('原子写入不会留下临时文件', async () => {
    const root = await mkdtemp(join(dataDir, 'atomic-'));
    const target = join(root, 'nested', 'binary');
    await (service as unknown as { writeAtomically: (path: string, body: Buffer) => Promise<void> }).writeAtomically(target, Buffer.from('complete'));

    expect(await readFile(target, 'utf8')).toBe('complete');
    const entries = await readdir(join(root, 'nested'));
    expect(entries).toEqual(['binary']);
    await rm(root, { recursive: true, force: true });
  });

  it('旧目录认领遇到同版本同目标已有不同哈希资产时保持幂等', async () => {
    const legacyPath = join(dataDir, 'legacy-agent');
    await writeFile(legacyPath, 'legacy-agent-content');
    const legacyAsset = {
      target: 'agent-linux-amd64',
      filename: 'riri-agent',
      path: legacyPath,
      sha256: digest(Buffer.from('legacy-agent-content')),
      size: Buffer.byteLength('legacy-agent-content')
    };
    binaries.getAsset.mockImplementation((target: string) => {
      if (target === legacyAsset.target) return legacyAsset;
      throw new Error('asset unavailable');
    });
    prisma.binaryRelease.upsert.mockResolvedValue({ id: 'release-1' });
    prisma.binaryAsset.upsert.mockResolvedValue({ id: 'existing-asset', sha256: 'different-hash' });
    prisma.binaryAsset.create.mockRejectedValue(Object.assign(new Error('duplicate asset'), { code: 'P2002' }));

    await expect(
      (service as unknown as { syncLegacyAssets: () => Promise<void> }).syncLegacyAssets()
    ).resolves.toBeUndefined();

    expect(prisma.binaryAsset.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { releaseId_target: { releaseId: 'release-1', target: legacyAsset.target } }
    }));
    expect(prisma.binaryAsset.create).not.toHaveBeenCalled();
    expect(prisma.binaryAssetFile.create).not.toHaveBeenCalled();
    await rm(legacyPath, { force: true });
  });

  it('资源列表按条件分页并返回支持的平台列表', async () => {
    prisma.binaryRelease.findMany.mockResolvedValue([{ ...release(), _count: { deploymentTasks: 3 } }]);
    prisma.binaryRelease.count.mockResolvedValue(11);

    const result = await service.list({ page: 2, pageSize: 10, kind: 'AGENT', status: 'ACTIVE', search: '0.9', platform: 'linux-amd64' });

    expect(prisma.binaryRelease.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        kind: 'AGENT',
        status: 'ACTIVE',
        OR: [{ upstreamVersion: { contains: '0.9' } }, { notes: { contains: '0.9' } }],
        assets: { some: { target: { endsWith: '-linux-amd64' } } }
      },
      skip: 10,
      take: 10
    }));
    expect(result.total).toBe(11);
    expect(result.page).toBe(2);
    expect(result.data[0].deploymentCount).toBe(3);
    expect(result.supportedTargets).toContain('agent-linux-amd64');
    expect(result.supportedTargets).not.toContain('agent-linux-armv7');
  });

  it('停用默认资源时自动转移默认标记到最新 ACTIVE 资源', async () => {
    const current = release({ isDefault: true });
    prisma.binaryRelease.findUnique.mockResolvedValue(current);
    prisma.binaryRelease.findFirst.mockResolvedValue({ id: 'release-next' });

    await service.disable(current.id, 'admin-1');

    expect(prisma.binaryRelease.update).toHaveBeenCalledWith({ where: { id: 'release-next' }, data: { isDefault: true } });
    expect(prisma.binaryAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: 'RESOURCE_DISABLED',
        metadataJson: expect.stringContaining('release-next')
      })
    }));
  });

  it('停用非默认资源不触发默认转移', async () => {
    const current = release({ isDefault: false });
    prisma.binaryRelease.findUnique.mockResolvedValue(current);

    await service.disable(current.id, 'admin-1');

    expect(prisma.binaryRelease.findFirst).not.toHaveBeenCalled();
  });

  it('恢复归档资源回到停用状态，非归档资源被拒绝', async () => {
    prisma.binaryRelease.findUnique.mockResolvedValue(release({ status: 'RETIRED', isDefault: false }));
    await service.restore('release-singbox-1', 'admin-1');
    expect(prisma.binaryRelease.update).toHaveBeenCalledWith({ where: { id: 'release-singbox-1' }, data: { status: 'DISABLED' } });

    prisma.binaryRelease.findUnique.mockResolvedValue(release({ status: 'ACTIVE' }));
    await expect(service.restore('release-singbox-1')).rejects.toThrow(ConflictException);
  });

  it('更新资源备注与兼容性约束', async () => {
    prisma.binaryRelease.findUnique.mockResolvedValue(release({ source: 'UPLOAD' }));

    await service.update('release-singbox-1', { notes: ' 新备注 ', compatibility: { minAgentProtocolVersion: 2, minAgentVersion: '0.7.0' } }, 'admin-1');

    expect(prisma.binaryRelease.update).toHaveBeenCalledWith({
      where: { id: 'release-singbox-1' },
      data: { notes: '新备注', compatibilityJson: JSON.stringify({ minAgentProtocolVersion: 2, minAgentVersion: '0.7.0' }) }
    });
  });

  it('更新资源拒绝未知或类型错误的兼容性字段', async () => {
    prisma.binaryRelease.findUnique.mockResolvedValue(release({ source: 'UPLOAD' }));

    await expect(service.update('release-singbox-1', { compatibility: { unknownField: 1 } })).rejects.toThrow(BadRequestException);
    await expect(service.update('release-singbox-1', { compatibility: { minAgentProtocolVersion: '2' } })).rejects.toThrow(BadRequestException);
  });

  it('删除资源校验内置、启用状态与分发历史', async () => {
    prisma.binaryRelease.findUnique
      .mockResolvedValueOnce(release({ source: 'BUILTIN', isDefault: true, assets: [], _count: { deploymentTasks: 0 } }))
      .mockResolvedValueOnce(release({ source: 'UPLOAD', status: 'ACTIVE', isDefault: true, assets: [], _count: { deploymentTasks: 0 } }))
      .mockResolvedValueOnce(release({ source: 'UPLOAD', status: 'DISABLED', isDefault: false, assets: [], _count: { deploymentTasks: 2 } }));

    await expect(service.remove('release-singbox-1')).rejects.toThrow('内置资源不可删除');
    await expect(service.remove('release-singbox-1')).rejects.toThrow('启用中的资源不可删除');
    await expect(service.remove('release-singbox-1')).rejects.toThrow('分发历史');
  });

  it('删除无引用资源会清理运行时目录并写审计', async () => {
    const releaseId = 'release-delete-me';
    const assetDir = join(dataDir, 'binaries', 'resources', releaseId, 'singbox-linux-amd64');
    await mkdir(assetDir, { recursive: true });
    await writeFile(join(assetDir, 'sing-box'), 'payload');
    prisma.binaryRelease.findUnique.mockResolvedValue({
      ...release({ id: releaseId, source: 'UPLOAD', status: 'DISABLED', isDefault: false }),
      assets: [{ storageRoot: 'RUNTIME', size: 7 }],
      _count: { deploymentTasks: 0 }
    });

    const result = await service.remove(releaseId, 'admin-1');

    expect(result).toEqual({ id: releaseId, deleted: true });
    expect(prisma.binaryAssetFile.deleteMany).toHaveBeenCalledWith({ where: { asset: { releaseId } } });
    expect(prisma.binaryAsset.deleteMany).toHaveBeenCalledWith({ where: { releaseId } });
    expect(prisma.binaryRelease.delete).toHaveBeenCalledWith({ where: { id: releaseId } });
    await expect(stat(join(assetDir, 'sing-box'))).rejects.toThrow();
    expect(prisma.binaryAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'RESOURCE_DELETED' })
    }));
  });

  it('批量操作返回逐项成功与失败结果', async () => {
    const deletable = {
      ...release({ id: 'release-ok', source: 'UPLOAD', status: 'DISABLED', isDefault: false }),
      assets: [{ storageRoot: 'RUNTIME', size: 1 }],
      _count: { deploymentTasks: 0 }
    };
    const builtin = { ...release({ id: 'release-builtin', source: 'BUILTIN' }), assets: [], _count: { deploymentTasks: 0 } };
    prisma.binaryRelease.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
      where.id === 'release-ok' ? deletable : builtin);

    const result = await service.batch({ action: 'delete', ids: ['release-ok', 'release-builtin'] }, 'admin-1');

    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.results[0]).toEqual({ id: 'release-ok', ok: true });
    expect(result.results[1].ok).toBe(false);
    expect(result.results[1].error).toContain('内置资源不可删除');
  });

  it('审计日志分页返回并补全操作者信息', async () => {
    prisma.binaryAuditLog.findMany.mockResolvedValue([
      { id: 'a1', action: 'RESOURCE_IMPORTED', operatorId: 'admin-1', releaseId: 'release-1', createdAt: new Date() },
      { id: 'a2', action: 'RESOURCE_ACTIVATED', operatorId: null, releaseId: null, createdAt: new Date() }
    ]);
    prisma.binaryAuditLog.count.mockResolvedValue(2);
    prisma.user.findMany.mockResolvedValue([{ id: 'admin-1', nickname: '管理员', email: 'a@b.c' }]);

    const result = await service.auditLogs({ page: 1, pageSize: 20, action: 'RESOURCE_IMPORTED' });

    expect(prisma.binaryAuditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { action: 'RESOURCE_IMPORTED' },
      skip: 0,
      take: 20
    }));
    expect(result.data[0].operator).toEqual({ id: 'admin-1', nickname: '管理员', email: 'a@b.c' });
    expect(result.data[1].operator).toBeNull();
  });
});
