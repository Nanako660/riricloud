import { NotFoundException } from '@nestjs/common';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { BinariesService, normalizeOsArch } from './binaries.service';

describe('BinariesService', () => {
  const prisma = { node: { findUnique: jest.fn() } };
  let service: BinariesService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new BinariesService(prisma as never);
  });

  it('规范化常见系统架构标识', () => {
    expect(normalizeOsArch('linux/x86_64')).toBe('linux-amd64');
    expect(normalizeOsArch('linux/aarch64')).toBe('linux-arm64');
    expect(normalizeOsArch('windows/amd64')).toBe('windows-amd64');
    expect(normalizeOsArch('unknown/value')).toBeUndefined();
  });

  it('生成带 AgentToken 的主控内部下载地址', () => {
    delete process.env.RIRICLOUD_PUBLIC_URL;
    expect(service.buildDownloadUrl('agent-linux-amd64', 'secret-token')).toContain('/api/v1/downloads/binaries/agent-linux-amd64?token=secret-token');
  });

  it('公网地址为空白时回退到主控本地地址', () => {
    process.env.RIRICLOUD_PUBLIC_URL = '  ';
    process.env.PORT = '33000';
    expect(service.buildDownloadUrl('agent-linux-amd64', 'secret-token')).toBe('http://localhost:33000/api/v1/downloads/binaries/agent-linux-amd64?token=secret-token');
    delete process.env.RIRICLOUD_PUBLIC_URL;
    delete process.env.PORT;
  });

  it('配置二进制分发基准地址时优先使用系统设置', async () => {
    const settings = { getSettings: jest.fn().mockResolvedValue({ binaryDownloadBaseUrl: 'https://cdn.example.com/riricloud' }) };
    const configured = new BinariesService(prisma as never, settings as never);
    await expect(configured.buildConfiguredDownloadUrl('agent-linux-amd64', 'secret-token')).resolves.toBe(
      'https://cdn.example.com/riricloud/api/v1/downloads/binaries/agent-linux-amd64?token=secret-token'
    );
  });

  it('系统设置未配置时使用请求域名生成二进制地址', async () => {
    const settings = { getSettings: jest.fn().mockResolvedValue({ binaryDownloadBaseUrl: '', publicBaseUrl: '' }) };
    const configured = new BinariesService(prisma as never, settings as never);
    await expect(configured.buildConfiguredDownloadUrl('agent-linux-amd64', 'secret-token', 'https://panel.example.com')).resolves.toBe(
      'https://panel.example.com/api/v1/downloads/binaries/agent-linux-amd64?token=secret-token'
    );
  });

  it('全站访问地址作为二进制分发地址的默认配置', async () => {
    const settings = { getSettings: jest.fn().mockResolvedValue({ binaryDownloadBaseUrl: '', publicBaseUrl: 'https://panel.example.com' }) };
    const configured = new BinariesService(prisma as never, settings as never);
    await expect(configured.buildConfiguredDownloadUrl('agent-linux-amd64', 'secret-token')).resolves.toBe(
      'https://panel.example.com/api/v1/downloads/binaries/agent-linux-amd64?token=secret-token'
    );
  });

  it('未知目标不会被当作可下载资产', () => {
    expect(() => service.getAsset('unknown-target')).toThrow(NotFoundException);
  });

  it('按 User-Agent 选择 Agent 下载目标', () => {
    expect(service.resolveAgentTarget('riri-agent-installer/linux-x86_64')).toBe('agent-linux-amd64');
    expect(service.resolveAgentTarget('riri-agent-installer/darwin-arm64')).toBe('agent-macos-arm64');
    expect(service.resolveAgentTarget('riri-agent-installer/windows-amd64')).toBe('agent-windows-amd64');
    expect(service.resolveAgentTarget(undefined)).toBe('agent-linux-amd64');
  });

  it('下载鉴权拒绝缺失或无效凭证', async () => {
    await expect(service.authorizeDownload(undefined)).rejects.toThrow('缺少 AgentToken');
    prisma.node.findUnique.mockResolvedValue(null);
    await expect(service.authorizeDownload('bad-token')).rejects.toThrow('无效的 AgentToken');
  });

  it('优先从持久仓 data/binaries 加载目标二进制', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'riri-bin-test-'));
    try {
      const dataDir = join(tempDir, 'data');
      const staticDir = join(tempDir, 'binaries');
      await mkdir(join(dataDir, 'binaries'), { recursive: true });
      await mkdir(staticDir, { recursive: true });

      await writeFile(join(staticDir, 'agent-linux-amd64'), 'static-agent-content');
      await writeFile(join(dataDir, 'binaries', 'agent-linux-amd64'), 'runtime-agent-content');

      process.env.RIRICLOUD_DATA_DIR = dataDir;
      process.env.RIRICLOUD_BINARY_DIR = staticDir;

      const testService = new BinariesService(prisma as never);
      await testService.refresh();

      const asset = testService.getAsset('agent-linux-amd64');
      expect(asset.path).toBe(join(dataDir, 'binaries', 'agent-linux-amd64'));
    } finally {
      delete process.env.RIRICLOUD_DATA_DIR;
      delete process.env.RIRICLOUD_BINARY_DIR;
      await rm(tempDir, { recursive: true, force: true });
    }
  }, 15000);

  it('持久仓无产物时回退到静态内置仓 binaries/', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'riri-bin-test-'));
    try {
      const dataDir = join(tempDir, 'data');
      const staticDir = join(tempDir, 'binaries');
      await mkdir(join(dataDir, 'binaries'), { recursive: true });
      await mkdir(staticDir, { recursive: true });

      await writeFile(join(staticDir, 'agent-linux-arm64'), 'static-agent-content');

      process.env.RIRICLOUD_DATA_DIR = dataDir;
      process.env.RIRICLOUD_BINARY_DIR = staticDir;

      const testService = new BinariesService(prisma as never);
      await testService.refresh();

      const asset = testService.getAsset('agent-linux-arm64');
      expect(asset.path).toBe(join(staticDir, 'agent-linux-arm64'));
    } finally {
      delete process.env.RIRICLOUD_DATA_DIR;
      delete process.env.RIRICLOUD_BINARY_DIR;
      await rm(tempDir, { recursive: true, force: true });
    }
  }, 15000);
});
