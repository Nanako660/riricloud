import { AgentService } from './agent-gateway.service';

describe('AgentService per-line authorization', () => {
  const userOne = {
    uuid: '11111111-1111-4111-8111-111111111111',
    email: 'one@example.com',
    password: 'one-password',
    isActive: true
  };
  const userTwo = {
    uuid: '22222222-2222-4222-8222-222222222222',
    email: 'two@example.com',
    password: 'two-password',
    isActive: true
  };
  const vlessParams = JSON.stringify({
    flow: 'xtls-rprx-vision',
    transport: { type: 'tcp' },
    tls: {
      enabled: true,
      mode: 'reality',
      serverName: 'www.apple.com',
      reality: { dest: 'www.apple.com:443', serverNames: ['www.apple.com'], privateKey: 'private', publicKey: 'public', shortIds: ['sid'] }
    }
  });
  const line = (id: string, isPublic: boolean, tagsJson: string) => ({
    id,
    name: id,
    tag: null,
    listen: '0.0.0.0',
    type: 'DIRECT',
    relayMode: null,
    protocolType: 'VLESS',
    paramsJson: vlessParams,
    entryNodeId: 'node-1',
    entryPort: id === 'public-line' ? 24443 : 24444,
    landingNodeId: null,
    landingPort: null,
    tagsJson,
    isPublic,
    status: 'ACTIVE',
    entryNode: { status: 'ONLINE' },
    landingNode: null,
    certificate: null
  });
  const prisma = {
    node: { findUnique: jest.fn() },
    subscription: { findMany: jest.fn() },
    user: { findMany: jest.fn() }
  };

  beforeEach(() => jest.clearAllMocks());

  it('仅按套餐匹配或用户额外授权注入每条线路的凭证', async () => {
    const publicLine = line('public-line', true, '["vip"]');
    const hiddenLine = line('hidden-line', false, '["internal"]');
    prisma.node.findUnique.mockResolvedValue({
      id: 'node-1',
      serverHost: '198.51.100.10',
      status: 'ONLINE',
      configOverride: null,
      entryLines: [publicLine, hiddenLine],
      landingLines: []
    });
    prisma.subscription.findMany.mockResolvedValue([
      {
        id: 'sub-one',
        status: 'ACTIVE',
        trafficLimitBytes: 1000n,
        trafficUsedBytes: 0n,
        expireAt: null,
        user: { ...userOne, extraLineGrants: [] },
        plan: { lineMatchMode: 'TAGS', lineTagsJson: '["vip"]', lineIdsJson: '[]' }
      },
      {
        id: 'sub-two',
        status: 'ACTIVE',
        trafficLimitBytes: 1000n,
        trafficUsedBytes: 0n,
        expireAt: null,
        user: { ...userTwo, extraLineGrants: [{ lineId: 'hidden-line' }] },
        plan: { lineMatchMode: 'TAGS', lineTagsJson: '["vip"]', lineIdsJson: '[]' }
      }
    ]);

    const service = new AgentService(prisma as never);
    const result = await service.buildConfigSync('node-1');
    const inbounds = result.singboxConfig.inbounds as Array<Record<string, unknown>>;
    const publicInbound = inbounds.find((inbound) => inbound.tag === 'line-public-line');
    const hiddenInbound = inbounds.find((inbound) => inbound.tag === 'line-hidden-line');

    expect(publicInbound?.users).toEqual([
      { uuid: userOne.uuid, name: `${userOne.email}::public-line`, flow: 'xtls-rprx-vision' },
      { uuid: userTwo.uuid, name: `${userTwo.email}::public-line`, flow: 'xtls-rprx-vision' }
    ]);
    expect(hiddenInbound?.users).toEqual([
      { uuid: userTwo.uuid, name: `${userTwo.email}::hidden-line`, flow: 'xtls-rprx-vision' }
    ]);
    expect((result.singboxConfig.experimental as { v2ray_api: { stats: { users: string[] } } }).v2ray_api.stats.users)
      .toEqual([`${userOne.email}::public-line`, `${userTwo.email}::public-line`, `${userTwo.email}::hidden-line`]);
  });
});
