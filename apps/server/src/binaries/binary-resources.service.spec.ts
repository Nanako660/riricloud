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
    binaryAsset: { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), upsert: jest.fn(), deleteMany: jest.fn() },
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

  describe('内置资源生命周期', () => {
    type LifecycleInternals = {
      syncManifests: () => Promise<{ keys: Set<string>; staticManifestLoaded: boolean }>;
      retireSupersededBuiltins: (manifest: { keys: Set<string>; staticManifestLoaded: boolean }) => Promise<void>;
      normalizeDefaults: () => Promise<void>;
      verifyAssetsAvailability: () => Promise<void>;
    };
    const internals = () => service as unknown as LifecycleInternals;

    it('syncManifests 认领资源键并如实汇报主 manifest 加载状态', async () => {
      const runtimeRoot = join(dataDir, 'binaries');
      await mkdir(runtimeRoot, { recursive: true });
      const body = Buffer.from('agent-0.7.1');
      await writeFile(join(runtimeRoot, 'riri-agent'), body);
      await writeFile(join(runtimeRoot, 'manifest.json'), JSON.stringify({
        schemaVersion: 1,
        resources: [{
          kind: 'AGENT',
          upstreamVersion: '0.7.1',
          revision: 1,
          source: 'BUILTIN',
          status: 'ACTIVE',
          isDefault: true,
          assets: [{ target: 'agent-linux-amd64', os: 'linux', arch: 'amd64', files: [{ name: 'riri-agent', role: 'main', path: 'riri-agent', sha256: digest(body) }] }]
        }]
      }));

      const result = await internals().syncManifests();

      expect(result.staticManifestLoaded).toBe(false);
      expect(Array.from(result.keys)).toEqual(['AGENT:0.7.1:1']);
      await rm(join(runtimeRoot, 'manifest.json'), { force: true });
      await rm(join(runtimeRoot, 'riri-agent'), { force: true });
    });

    it('主 manifest 加载成功时归档被取代的内置资源并转移默认', async () => {
      const stale = release({ id: 'release-old-agent', kind: 'AGENT', upstreamVersion: '0.6.0', isDefault: true });
      const current = release({ id: 'release-new-agent', kind: 'AGENT', upstreamVersion: '0.7.1', isDefault: false });
      prisma.binaryRelease.findMany.mockResolvedValue([stale, current]);
      prisma.binaryRelease.findFirst.mockResolvedValue({ id: 'release-new-agent' });

      await internals().retireSupersededBuiltins({ keys: new Set(['AGENT:0.7.1:1']), staticManifestLoaded: true });

      expect(prisma.binaryRelease.findMany).toHaveBeenCalledWith({ where: { source: 'BUILTIN', status: { not: 'RETIRED' } } });
      expect(prisma.binaryRelease.update).toHaveBeenCalledWith({ where: { id: 'release-old-agent' }, data: { status: 'RETIRED', isDefault: false } });
      expect(prisma.binaryRelease.update).toHaveBeenCalledWith({ where: { id: 'release-new-agent' }, data: { isDefault: true } });
      expect(prisma.binaryAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          action: 'RESOURCE_RETIRED',
          metadataJson: expect.stringContaining('builtin-superseded')
        })
      }));
    });

    it('主 manifest 未加载或资源仍受当前 manifest 支持时不触发归档', async () => {
      prisma.binaryRelease.findMany.mockResolvedValue([release({ id: 'release-old', upstreamVersion: '0.6.0' })]);

      await internals().retireSupersededBuiltins({ keys: new Set(), staticManifestLoaded: false });
      expect(prisma.binaryRelease.update).not.toHaveBeenCalled();

      prisma.binaryRelease.findMany.mockResolvedValue([release({ id: 'release-current', upstreamVersion: '1.14.0' })]);
      await internals().retireSupersededBuiltins({ keys: new Set(['SINGBOX:1.14.0:1']), staticManifestLoaded: true });
      expect(prisma.binaryRelease.update).not.toHaveBeenCalled();
      expect(prisma.binaryAuditLog.create).not.toHaveBeenCalled();
    });

    it('多默认脏数据收敛为每类型唯一默认', async () => {
      prisma.binaryRelease.findMany.mockImplementation(async ({ where }: { where: { kind: string } }) =>
        where.kind === 'AGENT'
          ? [
              release({ id: 'release-default-new' }),
              release({ id: 'release-default-old', upstreamVersion: '0.6.0' }),
              release({ id: 'release-default-stale', status: 'RETIRED', upstreamVersion: '0.5.0' })
            ]
          : []);
      prisma.binaryRelease.findFirst.mockResolvedValue(null);
      prisma.binaryRelease.updateMany.mockResolvedValue({ count: 2 });

      await internals().normalizeDefaults();

      expect(prisma.binaryRelease.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['release-default-old', 'release-default-stale'] } },
        data: { isDefault: false }
      });
      expect(prisma.binaryRelease.update).not.toHaveBeenCalledWith(expect.objectContaining({ data: { isDefault: true } }));
    });

    it('同类型缺失默认时补设最新 ACTIVE 资源', async () => {
      prisma.binaryRelease.findMany.mockResolvedValue([]);
      prisma.binaryRelease.findFirst.mockResolvedValue({ id: 'release-next' });

      await internals().normalizeDefaults();

      expect(prisma.binaryRelease.update).toHaveBeenCalledWith({ where: { id: 'release-next' }, data: { isDefault: true } });
    });

    it('文件缺失或哈希不符的资产标记不可用，无可用资产的启用资源自动停用', async () => {
      const verifyDir = join(dataDir, 'binaries', 'verify');
      await mkdir(verifyDir, { recursive: true });
      const good = Buffer.from('good-bin');
      await writeFile(join(verifyDir, 'good'), good);
      await writeFile(join(verifyDir, 'tampered'), Buffer.from('tampered-bin'));
      const originalSha = digest(Buffer.from('original-bin'));
      const validAsset = { id: 'asset-good', target: 'singbox-linux-amd64', storageRoot: 'RUNTIME', storagePath: 'verify/good', sha256: digest(good), available: true, files: [{ role: 'main', storageRoot: 'RUNTIME', storagePath: 'verify/good', sha256: digest(good) }] };
      const mismatchAsset = { id: 'asset-mismatch', target: 'singbox-linux-arm64', storageRoot: 'RUNTIME', storagePath: 'verify/tampered', sha256: originalSha, available: true, files: [{ role: 'main', storageRoot: 'RUNTIME', storagePath: 'verify/tampered', sha256: originalSha }] };
      const missingAsset = { id: 'asset-missing', target: 'agent-linux-amd64', storageRoot: 'RUNTIME', storagePath: 'verify/missing', sha256: originalSha, available: true, files: [{ role: 'main', storageRoot: 'RUNTIME', storagePath: 'verify/missing', sha256: originalSha }] };
      prisma.binaryRelease.findMany.mockImplementation(async ({ where }: { where: { status: { in: string[] } } }) =>
        where.status.in.includes('ACTIVE')
          ? [
              { ...release({ id: 'release-partial', kind: 'SINGBOX', isDefault: false }), assets: [validAsset, mismatchAsset] },
              { ...release({ id: 'release-empty', kind: 'AGENT' }), assets: [missingAsset] }
            ]
          : []);
      prisma.binaryRelease.findFirst.mockResolvedValue({ id: 'release-fallback' });

      await internals().verifyAssetsAvailability();

      expect(prisma.binaryAsset.update).toHaveBeenCalledWith({ where: { id: 'asset-mismatch' }, data: { available: false } });
      expect(prisma.binaryAsset.update).toHaveBeenCalledWith({ where: { id: 'asset-missing' }, data: { available: false } });
      expect(prisma.binaryAsset.update).not.toHaveBeenCalledWith({ where: { id: 'asset-good' }, data: expect.anything() });
      expect(prisma.binaryRelease.update).toHaveBeenCalledWith({ where: { id: 'release-empty' }, data: { status: 'DISABLED', isDefault: false } });
      expect(prisma.binaryRelease.update).toHaveBeenCalledWith({ where: { id: 'release-fallback' }, data: { isDefault: true } });
      expect(prisma.binaryRelease.update).not.toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'release-partial' } }));
      expect(prisma.binaryAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          action: 'RESOURCE_DISABLED',
          metadataJson: expect.stringContaining('asset-missing')
        })
      }));
      await rm(verifyDir, { recursive: true, force: true });
    });

    it('文件恢复后资产可用状态自愈回填', async () => {
      const healDir = join(dataDir, 'binaries', 'heal');
      await mkdir(healDir, { recursive: true });
      const body = Buffer.from('restored-bin');
      await writeFile(join(healDir, 'sing-box'), body);
      const healedAsset = { id: 'asset-heal', target: 'singbox-linux-amd64', storageRoot: 'RUNTIME', storagePath: 'heal/sing-box', sha256: digest(body), available: false, files: [{ role: 'main', storageRoot: 'RUNTIME', storagePath: 'heal/sing-box', sha256: digest(body) }] };
      prisma.binaryRelease.findMany.mockResolvedValue([
        { ...release({ id: 'release-heal', kind: 'SINGBOX', isDefault: false }), assets: [healedAsset] }
      ]);

      await internals().verifyAssetsAvailability();

      expect(prisma.binaryAsset.update).toHaveBeenCalledWith({ where: { id: 'asset-heal' }, data: { available: true } });
      expect(prisma.binaryRelease.update).not.toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'release-heal' } }));
      await rm(healDir, { recursive: true, force: true });
    });
  });
});
