import { NotFoundException } from '@nestjs/common';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BinariesService, normalizeOsArch } from './binaries.service';

describe('BinariesService', () => {
  const prisma = { node: { findUnique: jest.fn() } };
  let service: BinariesService;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.RIRICLOUD_INSTALL_SCRIPT_PATH;
    service = new BinariesService(prisma as never);
  });

  afterEach(() => {
    delete process.env.RIRICLOUD_INSTALL_SCRIPT_PATH;
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

  it('未知目标不会被当作可下载资产', () => {
    expect(() => service.getAsset('unknown-target')).toThrow(NotFoundException);
  });

  it('从显式路径读取 Agent 安装脚本', () => {
    const root = mkdtempSync(join(tmpdir(), 'riri-install-script-'));
    const path = join(root, 'install-agent.sh');
    const script = '#!/bin/sh\necho ok\n';
    writeFileSync(path, script);
    process.env.RIRICLOUD_INSTALL_SCRIPT_PATH = path;

    expect(service.getInstallScript()).toBe(script);

    rmSync(root, { recursive: true, force: true });
  });

  it('找不到安装脚本时返回 NotFoundException', () => {
    process.env.RIRICLOUD_INSTALL_SCRIPT_PATH = join(tmpdir(), 'riri-install-script-missing.sh');
    expect(() => service.getInstallScript()).toThrow(NotFoundException);
  });

  it('下载鉴权拒绝缺失或无效凭证', async () => {
    await expect(service.authorizeDownload(undefined)).rejects.toThrow('缺少 AgentToken');
    prisma.node.findUnique.mockResolvedValue(null);
    await expect(service.authorizeDownload('bad-token')).rejects.toThrow('无效的 AgentToken');
  });
});
