import { ConflictException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
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
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn()
    },
    binaryAsset: { findUnique: jest.fn(), upsert: jest.fn() },
    binaryAssetFile: { deleteMany: jest.fn(), createMany: jest.fn() },
    binaryDeploymentTask: { findMany: jest.fn() },
    binaryAuditLog: { create: jest.fn() },
    $transaction: jest.fn()
  };
  prisma.$transaction.mockImplementation(async (callback: (tx: typeof prisma) => Promise<unknown>) => callback(prisma));
  const binaries = { refresh: jest.fn(async () => undefined) };

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
});
