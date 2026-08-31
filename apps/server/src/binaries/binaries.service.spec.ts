import { NotFoundException } from '@nestjs/common';
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
    expect(service.buildDownloadUrl('agent-linux-amd64', 'secret-token')).toContain('/api/v1/downloads/binaries/agent-linux-amd64?token=secret-token');
  });

  it('未知目标不会被当作可下载资产', () => {
    expect(() => service.getAsset('unknown-target')).toThrow(NotFoundException);
  });

  it('下载鉴权拒绝缺失或无效凭证', async () => {
    await expect(service.authorizeDownload(undefined)).rejects.toThrow('缺少 AgentToken');
    prisma.node.findUnique.mockResolvedValue(null);
    await expect(service.authorizeDownload('bad-token')).rejects.toThrow('无效的 AgentToken');
  });
});
