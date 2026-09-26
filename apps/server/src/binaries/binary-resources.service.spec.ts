import { ConflictException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BinaryResourcesService } from './binary-resources.service';
import { detectTargetFromBinaryHeader, inspectBinaryPayload } from './binary-inspector';

function buildFakeElfBinary(arch: 'amd64' | 'arm64', embeddedVersion?: string): Buffer {
  const header = Buffer.alloc(64, 0);
  // 0x7F 'E' 'L' 'F'
  header[0] = 0x7f;
  header[1] = 0x45;
  header[2] = 0x4c;
  header[3] = 0x46;
  header[4] = 2; // 64-bit
  header[5] = 1; // little-endian
  header.writeUInt16LE(arch === 'amd64' ? 0x3e : 0xb7, 18);
  if (!embeddedVersion) return header;
  const marker = Buffer.from(`RIRICLOUD_AGENT_VERSION:${embeddedVersion}\0`, 'ascii');
  return Buffer.concat([header, marker]);
}

function buildFakePeBinary(embeddedVersion?: string): Buffer {
  const buf = Buffer.alloc(128, 0);
  buf[0] = 0x4d; // 'M'
  buf[1] = 0x5a; // 'Z'
  buf.writeUInt32LE(0x40, 0x3c);
  buf.write('PE\0\0', 0x40, 'ascii');
  buf.writeUInt16LE(0x8664, 0x44); // AMD64
  if (!embeddedVersion) return buf;
  return Buffer.concat([buf, Buffer.from(`RIRICLOUD_AGENT_VERSION:${embeddedVersion}\0`, 'ascii')]);
}

function buildSingleFileTarGz(fileName: string, content: Buffer): Buffer {
  const header = Buffer.alloc(512, 0);
  header.write(fileName, 0, Math.min(fileName.length, 100), 'utf8');
  header.write('0000755\0', 100, 8, 'ascii');
  header.write(`${content.length.toString(8).padStart(11, '0')}\0`, 124, 12, 'ascii');
  header[156] = 48; // '0' regular file
  const paddingLen = (512 - (content.length % 512)) % 512;
  const eof = Buffer.alloc(1024, 0);
  return gzipSync(Buffer.concat([header, content, Buffer.alloc(paddingLen, 0), eof]));
}

describe('BinaryResourcesService', () => {
  let service: BinaryResourcesService;
  let dataDir: string;

  const release = (overrides: Record<string, unknown> = {}) => ({
    id: 'release-agent-1',
    kind: 'AGENT',
    upstreamVersion: '0.4.14',
    revision: 1,
    source: 'LOCAL',
    status: 'ACTIVE',
    builtFromAppVersion: '0.4.14',
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
    binaryAsset: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
      deleteMany: jest.fn()
    },
    binaryAssetFile: {
      findUnique: jest.fn(),
      deleteMany: jest.fn(),
      create: jest.fn(),
      createMany: jest.fn()
    },
    binaryDeploymentTask: {
      findMany: jest.fn(),
      count: jest.fn(),
      updateMany: jest.fn()
    },
    node: {
      updateMany: jest.fn()
    },
    $transaction: jest.fn()
  };
  prisma.$transaction.mockImplementation(async (arg: unknown) => {
    if (Array.isArray(arg)) return Promise.all(arg as Promise<unknown>[]);
    return (arg as (tx: typeof prisma) => Promise<unknown>)(prisma);
  });
  const binaries = { refresh: jest.fn(async () => undefined), getAsset: jest.fn() };
  const settingsService = {
    getSettings: jest.fn(async () => ({
      githubRepoUrl: 'https://github.com/Nanako660/riricloud',
      githubMirrorUrls: []
    }))
  };
  const systemLogs = { enqueue: jest.fn() };

  beforeAll(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'riricloud-binary-resources-'));
    process.env.RIRICLOUD_DATA_DIR = dataDir;
    service = new BinaryResourcesService(
      prisma as never,
      binaries as never,
      settingsService as never,
      systemLogs as never
    );
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    await rm(join(dataDir, 'binaries', '.seeded-releases.json'), { force: true }).catch(() => undefined);
    prisma.binaryRelease.findMany.mockResolvedValue([]);
    prisma.binaryRelease.findUnique.mockResolvedValue(null);
    prisma.binaryRelease.findFirst.mockResolvedValue(null);
    prisma.binaryRelease.create.mockResolvedValue(release());
    prisma.binaryRelease.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      ...release(),
      ...data
    }));
    prisma.binaryRelease.upsert.mockResolvedValue(release());
    prisma.binaryAsset.findFirst.mockResolvedValue(null);
    prisma.binaryAsset.upsert.mockResolvedValue({ id: 'asset-1' });
    prisma.binaryAssetFile.deleteMany.mockResolvedValue({ count: 0 });
    prisma.binaryAssetFile.create.mockResolvedValue({ id: 'file-1' });
    prisma.binaryAssetFile.createMany.mockResolvedValue({ count: 0 });
    prisma.binaryDeploymentTask.updateMany.mockResolvedValue({ count: 0 });
    prisma.node.updateMany.mockResolvedValue({ count: 0 });
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
  }) {
    const mainPath = join(options.root, 'riri-agent');
    await writeFile(mainPath, options.main);
    const files = [{ name: 'riri-agent', role: 'main', path: 'riri-agent', sha256: digest(options.main) }];
    await (service as unknown as { upsertManifestResource: (root: string, resource: unknown) => Promise<void> }).upsertManifestResource(options.root, {
      kind: 'AGENT',
      upstreamVersion: '0.4.14',
      revision: 1,
      source: 'LOCAL',
      status: 'ACTIVE',
      builtFromAppVersion: options.appVersion,
      isDefault: true,
      assets: [{ target: 'agent-linux-amd64', os: 'linux', arch: 'amd64', files }]
    });
  }

  describe('二进制自动解析引擎 (binary-inspector)', () => {
    it('从 ELF/PE 魔数头与内嵌标记自动识别平台、版本与 SHA-256', () => {
      const elfArm = buildFakeElfBinary('arm64', '0.4.14');
      expect(detectTargetFromBinaryHeader(elfArm)).toBe('agent-linux-arm64');
      const inspectedElf = inspectBinaryPayload({ buffer: elfArm });
      expect(inspectedElf.target).toBe('agent-linux-arm64');
      expect(inspectedElf.upstreamVersion).toBe('0.4.14');
      expect(inspectedElf.sha256).toBe(digest(elfArm));

      const peWin = buildFakePeBinary('0.5.0');
      expect(detectTargetFromBinaryHeader(peWin)).toBe('agent-windows-amd64');
      const inspectedPe = inspectBinaryPayload({ buffer: peWin });
      expect(inspectedPe.target).toBe('agent-windows-amd64');
      expect(inspectedPe.filename).toBe('riri-agent.exe');
      expect(inspectedPe.upstreamVersion).toBe('0.5.0');
    });

    it('自动解压 .tar.gz 归档并从包名与二进制头提取元数据', () => {
      const rawBin = buildFakeElfBinary('amd64');
      const archive = buildSingleFileTarGz('riri-agent', rawBin);
      const inspected = inspectBinaryPayload({
        buffer: archive,
        hintFilename: 'riri-agent_0.4.15_linux_amd64.tar.gz'
      });
      expect(inspected.target).toBe('agent-linux-amd64');
      expect(inspected.upstreamVersion).toBe('0.4.15');
      expect(inspected.sha256).toBe(digest(rawBin));
      expect(inspected.size).toBe(rawBin.length);
    });
  });

  it('上传文件无需手填版本、平台与哈希，自动解压计算并写入系统日志', async () => {
    const rawBin = buildFakeElfBinary('amd64', '0.4.16');
    const archive = buildSingleFileTarGz('riri-agent', rawBin);
    prisma.binaryRelease.findUnique.mockResolvedValue({
      ...release({ id: 'release-up-1', upstreamVersion: '0.4.16', source: 'UPLOAD' }),
      assets: [],
      deploymentTasks: [],
      _count: { deploymentTasks: 0 }
    });
    prisma.binaryRelease.upsert.mockResolvedValue(release({ id: 'release-up-1', upstreamVersion: '0.4.16' }));

    await service.upload({}, { buffer: archive, originalname: 'riri-agent_0.4.16_linux_amd64.tar.gz' }, 'admin-1');

    expect(prisma.binaryRelease.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        kind_upstreamVersion_revision: {
          kind: 'AGENT',
          upstreamVersion: '0.4.16',
          revision: 1
        }
      }
    }));
    expect(prisma.binaryAsset.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        target: 'agent-linux-amd64',
        sha256: digest(rawBin),
        size: rawBin.length
      })
    }));
    expect(systemLogs.enqueue).toHaveBeenCalledWith(expect.objectContaining({
      source: 'SERVER',
      module: 'BinaryResource',
      userId: 'admin-1',
      metadata: expect.objectContaining({ action: 'RESOURCE_IMPORTED', target: 'agent-linux-amd64' })
    }));
  });

  it('应用版本变化时复用同一 Agent 资源身份和文件哈希', async () => {
    const root = await mkdtemp(join(dataDir, 'manifest-'));
    const main = Buffer.from('riri-agent-0.4.14');
    const existing = release({ status: 'DISABLED', isDefault: false });
    prisma.binaryRelease.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existing);
    prisma.binaryRelease.create.mockResolvedValueOnce(release({ builtFromAppVersion: '0.4.14' }));
    prisma.binaryRelease.update.mockResolvedValueOnce(existing);

    await syncManifestResource({ appVersion: '0.4.14', root, main });
    await syncManifestResource({ appVersion: '0.4.15', root, main });

    expect(prisma.binaryRelease.create).toHaveBeenCalledTimes(1);
    expect(prisma.binaryRelease.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: existing.id },
      data: expect.objectContaining({ builtFromAppVersion: '0.4.15' })
    }));
    expect(prisma.binaryAsset.upsert).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: { releaseId_target: { releaseId: existing.id, target: 'agent-linux-amd64' } }
    }));
    expect(prisma.binaryRelease.update.mock.calls[0][0].data).not.toHaveProperty('status');
    expect(prisma.binaryRelease.update.mock.calls[0][0].data).not.toHaveProperty('isDefault');

    const createdFiles = prisma.binaryAssetFile.createMany.mock.calls[0][0].data as Array<{ name: string; sha256: string }>;
    expect(createdFiles).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'riri-agent', role: 'main', storageRoot: 'RUNTIME', storagePath: 'riri-agent', sha256: digest(main), size: main.length })
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
      target: 'agent-linux-amd64',
      os: 'linux',
      arch: 'amd64',
      filename: 'riri-agent',
      storageRoot: 'RUNTIME',
      storagePath: 'resources/asset/riri-agent',
      sha256: 'a'.repeat(64),
      size: 10,
      available: true,
      files: [{ id: 'file-1', name: 'riri-agent', role: 'main', sha256: 'a'.repeat(64), size: 10 }]
    };
    prisma.binaryRelease.findMany.mockResolvedValue([{ ...release({ compatibilityJson: JSON.stringify({ minAgentProtocolVersion: 2 }) }), assets: [asset] }]);

    await expect(service.resolveForNode('agent', 'linux/amd64', 'agent-token', 'https://panel.example.com', undefined, { agentProtocolVersion: 1 }))
      .rejects.toThrow(ConflictException);
    expect(prisma.binaryRelease.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { kind: 'AGENT', status: 'ACTIVE' }
    }));
  });

  it('资源列表按条件分页并返回支持的 Agent 平台列表', async () => {
    prisma.binaryRelease.findMany.mockResolvedValue([{ ...release(), assets: [], _count: { deploymentTasks: 3 } }]);
    prisma.binaryRelease.count.mockResolvedValue(11);

    const result = await service.list({ page: 2, pageSize: 10, status: 'ACTIVE', search: '0.4', platform: 'linux-amd64' });

    expect(prisma.binaryRelease.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        kind: 'AGENT',
        status: 'ACTIVE',
        OR: [{ upstreamVersion: { contains: '0.4' } }, { notes: { contains: '0.4' } }],
        assets: { some: { target: { endsWith: '-linux-amd64' } } }
      },
      skip: 10,
      take: 10
    }));
    expect(result.total).toBe(11);
    expect(result.page).toBe(2);
    expect(result.data[0].deploymentCount).toBe(3);
    expect(result.supportedTargets).toContain('agent-linux-amd64');
    expect(result.supportedTargets).not.toContain('singbox-linux-amd64');
  });

  it('停用默认资源时自动转移默认标记到最新 ACTIVE 资源并记入系统日志', async () => {
    const current = release({ isDefault: true });
    prisma.binaryRelease.findUnique.mockResolvedValue(current);
    prisma.binaryRelease.findFirst.mockResolvedValue({ id: 'release-next' });

    await service.disable(current.id, 'admin-1');

    expect(prisma.binaryRelease.update).toHaveBeenCalledWith({ where: { id: 'release-next' }, data: { isDefault: true } });
    expect(systemLogs.enqueue).toHaveBeenCalledWith(expect.objectContaining({
      module: 'BinaryResource',
      metadata: expect.objectContaining({
        action: 'RESOURCE_DISABLED',
        nextDefaultId: 'release-next'
      })
    }));
  });

  it('任意资源（含启用中、默认、有分发历史或原内置资源）均可直接删除，且重启不会复活', async () => {
    const releaseId = 'release-delete-any';
    const assetDir = join(dataDir, 'binaries', 'resources', releaseId, 'agent-linux-amd64');
    await mkdir(assetDir, { recursive: true });
    await writeFile(join(assetDir, 'riri-agent'), 'payload');

    prisma.binaryRelease.findUnique.mockResolvedValue({
      ...release({ id: releaseId, upstreamVersion: '0.4.14', source: 'BUILTIN', status: 'ACTIVE', isDefault: true }),
      assets: [{ id: 'asset-del-1', storageRoot: 'RUNTIME', storagePath: 'resources/release-delete-any/agent-linux-amd64/riri-agent', size: 7 }],
      _count: { deploymentTasks: 5 }
    });
    prisma.binaryRelease.findFirst.mockResolvedValue({ id: 'release-fallback-default' });

    const result = await service.remove(releaseId, 'admin-1');

    expect(result).toEqual({ id: releaseId, deleted: true });
    expect(prisma.binaryDeploymentTask.updateMany).toHaveBeenCalled();
    expect(prisma.binaryAssetFile.deleteMany).toHaveBeenCalledWith({ where: { asset: { releaseId } } });
    expect(prisma.binaryAsset.deleteMany).toHaveBeenCalledWith({ where: { releaseId } });
    expect(prisma.binaryRelease.delete).toHaveBeenCalledWith({ where: { id: releaseId } });
    expect(prisma.binaryRelease.update).toHaveBeenCalledWith({
      where: { id: 'release-fallback-default' },
      data: { isDefault: true }
    });
    await expect(stat(join(assetDir, 'riri-agent'))).rejects.toThrow();
    expect(systemLogs.enqueue).toHaveBeenCalledWith(expect.objectContaining({
      module: 'BinaryResource',
      metadata: expect.objectContaining({
        action: 'RESOURCE_DELETED',
        freedBytes: 7,
        nextDefaultId: 'release-fallback-default'
      })
    }));

    // 验证已删除的版本键记录在 .seeded-releases.json 中，重启时不再重复创建
    const seededRaw = JSON.parse(await readFile(join(dataDir, 'binaries', '.seeded-releases.json'), 'utf8')) as { keys: string[] };
    expect(seededRaw.keys).toContain('AGENT:0.4.14:1');
  });

  it('批量删除对所有资源生效', async () => {
    prisma.binaryRelease.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => ({
      ...release({ id: where.id, source: 'BUILTIN', status: 'ACTIVE', isDefault: false }),
      assets: [{ id: `asset-${where.id}`, storageRoot: 'RUNTIME', storagePath: 'x', size: 10 }],
      _count: { deploymentTasks: 2 }
    }));

    const result = await service.batch({ action: 'delete', ids: ['release-1', 'release-2'] }, 'admin-1');

    expect(result.succeeded).toBe(2);
    expect(result.failed).toBe(0);
  });

  describe('内置资源生命周期', () => {
    type LifecycleInternals = {
      syncManifests: (seededKeys?: Set<string>) => Promise<{ keys: Set<string>; staticManifestLoaded: boolean }>;
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
          source: 'LOCAL',
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

    it('主 manifest 加载成功时自动停用被取代的旧版本资源并转移默认', async () => {
      const stale = release({ id: 'release-old-agent', kind: 'AGENT', upstreamVersion: '0.6.0', isDefault: true });
      const current = release({ id: 'release-new-agent', kind: 'AGENT', upstreamVersion: '0.7.1', isDefault: false });
      prisma.binaryRelease.findMany.mockResolvedValue([stale, current]);
      prisma.binaryRelease.findFirst.mockResolvedValue({ id: 'release-new-agent' });

      await internals().retireSupersededBuiltins({ keys: new Set(['AGENT:0.7.1:1']), staticManifestLoaded: true });

      expect(prisma.binaryRelease.update).toHaveBeenCalledWith({ where: { id: 'release-old-agent' }, data: { status: 'DISABLED', isDefault: false } });
      expect(prisma.binaryRelease.update).toHaveBeenCalledWith({ where: { id: 'release-new-agent' }, data: { isDefault: true } });
      expect(systemLogs.enqueue).toHaveBeenCalledWith(expect.objectContaining({
        module: 'BinaryResource',
        metadata: expect.objectContaining({
          action: 'RESOURCE_DISABLED',
          reason: 'builtin-superseded'
        })
      }));
    });

    it('文件缺失或哈希不符的资产标记不可用，无可用资产的启用资源自动停用', async () => {
      const verifyDir = join(dataDir, 'binaries', 'verify');
      await mkdir(verifyDir, { recursive: true });
      const good = Buffer.from('good-bin');
      await writeFile(join(verifyDir, 'good'), good);
      await writeFile(join(verifyDir, 'tampered'), Buffer.from('tampered-bin'));
      const originalSha = digest(Buffer.from('original-bin'));
      const validAsset = { id: 'asset-good', target: 'agent-linux-amd64', storageRoot: 'RUNTIME', storagePath: 'verify/good', sha256: digest(good), available: true, files: [{ role: 'main', storageRoot: 'RUNTIME', storagePath: 'verify/good', sha256: digest(good) }] };
      const mismatchAsset = { id: 'asset-mismatch', target: 'agent-linux-arm64', storageRoot: 'RUNTIME', storagePath: 'verify/tampered', sha256: originalSha, available: true, files: [{ role: 'main', storageRoot: 'RUNTIME', storagePath: 'verify/tampered', sha256: originalSha }] };
      const missingAsset = { id: 'asset-missing', target: 'agent-linux-amd64', storageRoot: 'RUNTIME', storagePath: 'verify/missing', sha256: originalSha, available: true, files: [{ role: 'main', storageRoot: 'RUNTIME', storagePath: 'verify/missing', sha256: originalSha }] };
      prisma.binaryRelease.findMany.mockImplementation(async ({ where }: { where: { status: { in: string[] } } }) =>
        where.status.in.includes('ACTIVE')
          ? [
              { ...release({ id: 'release-partial', kind: 'AGENT', isDefault: false }), assets: [validAsset, mismatchAsset] },
              { ...release({ id: 'release-empty', kind: 'AGENT' }), assets: [missingAsset] }
            ]
          : []);
      prisma.binaryRelease.findFirst.mockResolvedValue({ id: 'release-fallback' });

      await internals().verifyAssetsAvailability();

      expect(prisma.binaryAsset.update).toHaveBeenCalledWith({ where: { id: 'asset-mismatch' }, data: { available: false } });
      expect(prisma.binaryAsset.update).toHaveBeenCalledWith({ where: { id: 'asset-missing' }, data: { available: false } });
      expect(prisma.binaryRelease.update).toHaveBeenCalledWith({ where: { id: 'release-empty' }, data: { status: 'DISABLED', isDefault: false } });
      expect(prisma.binaryRelease.update).toHaveBeenCalledWith({ where: { id: 'release-fallback' }, data: { isDefault: true } });
      expect(systemLogs.enqueue).toHaveBeenCalledWith(expect.objectContaining({
        level: 'WARN',
        module: 'BinaryResource',
        metadata: expect.objectContaining({
          action: 'RESOURCE_DISABLED',
          unavailableAssetIds: ['asset-missing']
        })
      }));
      await rm(verifyDir, { recursive: true, force: true });
    });
  });
});
