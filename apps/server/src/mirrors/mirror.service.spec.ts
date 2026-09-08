import { BadRequestException } from '@nestjs/common';
import { MirrorService } from './mirror.service';

function createService() {
  const prisma = {
    mirrorSite: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn()
    },
    node: { findUnique: jest.fn().mockResolvedValue({ id: 'node-1' }) }
  };
  const agent = { startMirrorTask: jest.fn(), cancelMirrorTask: jest.fn() };
  const rateLimit = { consume: jest.fn().mockReturnValue(true) };
  return { service: new MirrorService(prisma as never, agent as never, rateLimit as never), prisma };
}

describe('MirrorService', () => {
  it('rejects private upstream addresses before persisting a mirror', async () => {
    const { service, prisma } = createService();

    await expect(service.create({
      name: 'internal',
      slug: 'internal-site',
      upstreamBaseUrl: 'http://127.0.0.1',
      allowedOrigins: ['github.com'],
      nodeId: 'node-1',
      accessMode: 'ADMIN'
    })).rejects.toThrow('private or metadata');
    expect(prisma.mirrorSite.create).not.toHaveBeenCalled();
  });

  it('rejects embedded upstream credentials', async () => {
    const { service } = createService();

    await expect(service.create({
      name: 'credentialed',
      slug: 'credentialed-site',
      upstreamBaseUrl: 'https://user:password@github.com',
      allowedOrigins: ['github.com'],
      nodeId: 'node-1',
      accessMode: 'ADMIN'
    })).rejects.toThrow(BadRequestException);
  });

  it('rejects path traversal before starting an Agent task', () => {
    const { service } = createService();
    const site = { upstreamBaseUrl: 'https://github.com' } as never;
    const buildTargetUrl = (service as unknown as { buildTargetUrl: (value: never, path: string, query: string) => string }).buildTargetUrl.bind(service);

    expect(() => buildTargetUrl(site, '../etc/passwd', '')).toThrow(BadRequestException);
  });
});
