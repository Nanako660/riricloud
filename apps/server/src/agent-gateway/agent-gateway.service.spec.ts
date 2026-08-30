import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AgentGatewayService } from './agent-gateway.service';
import type { HeartbeatData } from './agent-message';

describe('AgentGatewayService', () => {
  let service: AgentGatewayService;
  // 事务回调捕获：验证流量扣减与日志写入是否在同一事务
  let capturedTx: ((tx: unknown) => Promise<void>) | undefined;
  const prisma = {
    $transaction: jest.fn(async (fn) => {
      capturedTx = fn;
      return fn(txMock);
    }),
    node: { findUnique: jest.fn(), update: jest.fn() },
    user: { findMany: jest.fn() },
  };
  // 事务句柄 mock：记录调用序列
  const txCalls: string[] = [];
  const txNodeUpdate = jest.fn(
    async (args: { data: Record<string, unknown> }) => {
      txCalls.push('node.update');
      return args;
    }
  );
  const txMock = {
    node: {
      update: txNodeUpdate
    },
    user: {
      findUnique: jest.fn(),
      update: jest.fn(async () => {
        txCalls.push('user.update');
      })
    },
    trafficLog: {
      create: jest.fn(async () => {
        txCalls.push('trafficLog.create');
      })
    }
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        AgentGatewayService,
        { provide: PrismaService, useValue: prisma }
      ]
    }).compile();
    service = moduleRef.get(AgentGatewayService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    txCalls.length = 0;
    capturedTx = undefined;
  });

  const heartbeat: HeartbeatData = {
    cpuUsage: 12.5,
    memoryUsage: 45.0,
    bandwidthRate: 1024,
    trafficRecords: [{ userUuid: 'uuid-1', upload: 100, download: 200 }]
  };

  it('心跳的遥测更新、流量日志写入与配额扣减在同一事务内', async () => {
    txMock.user.findUnique.mockResolvedValue({
      id: 'u1',
      uuid: 'uuid-1',
      trafficLimitBytes: BigInt(107374182400),
      trafficUsedBytes: BigInt(0),
      expireAt: null,
      isActive: true
    });
    await service.handleHeartbeat('n1', heartbeat);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(capturedTx).toBeDefined();
    expect(txMock.node.update).toHaveBeenCalledTimes(1);
    expect(txMock.trafficLog.create).toHaveBeenCalledTimes(1);
    expect(txMock.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { trafficUsedBytes: { increment: BigInt(300) } }
    });
  });

  it('未知 userUuid 的流量记录被跳过且不抛错', async () => {
    txMock.user.findUnique.mockResolvedValue(null);
    await expect(service.handleHeartbeat('n1', heartbeat)).resolves.toBeUndefined();
    expect(txMock.trafficLog.create).not.toHaveBeenCalled();
  });

  it('旧版心跳（无内核状态字段）不写 kernelRunning/configError', async () => {
    txMock.user.findUnique.mockResolvedValue(null);
    await service.handleHeartbeat('n1', heartbeat);
    const data = txNodeUpdate.mock.calls[0]![0].data;
    expect(data).not.toHaveProperty('kernelRunning');
    expect(data).not.toHaveProperty('configError');
  });

  it('新版心跳的内核状态与失败原因落列', async () => {
    txMock.user.findUnique.mockResolvedValue(null);
    await service.handleHeartbeat('n1', {
      ...heartbeat,
      kernelRunning: false,
      appliedConfigVersion: 7,
      lastError: 'config check failed: bad inbound'
    });
    const data = txNodeUpdate.mock.calls[0]![0].data;
    expect(data.kernelRunning).toBe(false);
    expect(data.configError).toBe('config check failed: bad inbound');
  });

  it('心跳 lastError 为空串时清空 configError', async () => {
    txMock.user.findUnique.mockResolvedValue(null);
    await service.handleHeartbeat('n1', {
      ...heartbeat,
      kernelRunning: true,
      lastError: ''
    });
    const data = txNodeUpdate.mock.calls[0]![0].data;
    expect(data.kernelRunning).toBe(true);
    expect(data.configError).toBeNull();
  });

  it('config_apply_result 成功清空 configError，失败落原因（截断 8KB）', async () => {
    prisma.node.update.mockResolvedValue({});
    await service.handleConfigApplyResult('n1', { version: 3, success: true, message: 'ok' });
    expect(prisma.node.update).toHaveBeenCalledWith({
      where: { id: 'n1' },
      data: { configError: null }
    });

    const long = 'x'.repeat(9000);
    await service.handleConfigApplyResult('n1', {
      version: 4,
      success: false,
      message: long
    });
    expect(prisma.node.update).toHaveBeenLastCalledWith({
      where: { id: 'n1' },
      data: { configError: long.slice(0, 8192) }
    });
  });

  it('config_apply_result 落库失败不抛错（连接已断开场景）', async () => {
    prisma.node.update.mockRejectedValueOnce(new Error('node deleted'));
    await expect(
      service.handleConfigApplyResult('n1', { version: 3, success: true, message: 'ok' })
    ).resolves.toBeUndefined();
  });

  it('authenticate 对缺失 token 返回失败', async () => {
    const result = await service.authenticate(undefined);
    expect(result.ok).toBe(false);
  });

  describe('buildConfigSync', () => {
    const entitledUser = {
      uuid: 'uuid-1',
      email: 'a@x.com',
      password: 'user-pass',
      isActive: true,
      expireAt: null,
      trafficLimitBytes: BigInt(107374182400),
      trafficUsedBytes: BigInt(0)
    };

    const nodeWithInbounds = (inbounds: unknown[], configOverride: string | null = null) => ({
      id: 'n1',
      name: '东京节点 01',
      serverHost: '203.0.113.10',
      configOverride,
      inbounds
    });

    const inboundRows = [
      {
        type: 'VLESS',
        tag: 'vless-in',
        listen: '::',
        port: 443,
        sortOrder: 0,
        paramsJson: JSON.stringify({
          flow: 'xtls-rprx-vision',
          transport: { type: 'tcp' },
          tls: {
            enabled: true,
            mode: 'reality',
            serverName: 'www.apple.com',
            reality: {
              dest: 'www.apple.com:443',
              serverNames: ['www.apple.com'],
              privateKey: 'priv',
              publicKey: 'pub',
              shortIds: ['sid-1']
            }
          }
        })
      },
      {
        type: 'HYSTERIA2',
        tag: 'hy2-in',
        listen: '::',
        port: 8443,
        sortOrder: 1,
        paramsJson: JSON.stringify({
          upMbps: 0,
          downMbps: 0,
          tls: {
            enabled: true,
            mode: 'tls',
            serverName: 'hy.example.com',
            certificatePath: '/c.pem',
            keyPath: '/k.pem',
            alpn: ['h3'],
            insecure: false
          }
        })
      },
      {
        type: 'SHADOWSOCKS',
        tag: 'ss-in',
        listen: '::',
        port: 8388,
        sortOrder: 2,
        paramsJson: JSON.stringify({ method: 'aes-256-gcm', password: 'ss-shared' })
      }
    ];

    it('按入站数组逐协议组装，有资格用户注入 vless uuid 与 hy2 密码', async () => {
      prisma.node.findUnique.mockResolvedValue(nodeWithInbounds(inboundRows));
      prisma.user.findMany.mockResolvedValue([entitledUser]);
      const { singboxConfig } = await service.buildConfigSync('n1');
      const inbounds = singboxConfig.inbounds as Array<Record<string, unknown>>;
      expect(inbounds).toHaveLength(3);

      const vless = inbounds[0] as { users: unknown[] };
      expect(vless).toMatchObject({ type: 'vless', listen_port: 443 });
      expect(vless.users).toEqual([{ uuid: 'uuid-1', name: 'a@x.com', flow: 'xtls-rprx-vision' }]);

      const hy2 = inbounds[1] as { users: unknown[] };
      expect(hy2).toMatchObject({ type: 'hysteria2', listen_port: 8443 });
      expect(hy2.users).toEqual([{ name: 'a@x.com', password: 'user-pass' }]);

      const ss = inbounds[2];
      expect(ss).toMatchObject({ type: 'shadowsocks', password: 'ss-shared' });
      expect(ss).not.toHaveProperty('users');
      expect(singboxConfig.outbounds).toEqual([{ type: 'direct', tag: 'direct' }]);
    });

    it('用户未设置密码时凭证回退 uuid；无资格用户被排除', async () => {
      prisma.node.findUnique.mockResolvedValue(nodeWithInbounds([inboundRows[1]]));
      prisma.user.findMany.mockResolvedValue([
        { ...entitledUser, password: null },
        { ...entitledUser, uuid: 'uuid-2', email: 'b@x.com', password: null, isActive: false }
      ]);
      const { singboxConfig } = await service.buildConfigSync('n1');
      const [hy2] = singboxConfig.inbounds as Array<{ users: Array<{ password: string }> }>;
      expect(hy2.users).toEqual([{ name: 'a@x.com', password: 'uuid-1' }]);
    });

    it('configOverride 顶层深合并，inbounds 数组整组替换', async () => {
      prisma.node.findUnique.mockResolvedValue(
        nodeWithInbounds(
          inboundRows,
          JSON.stringify({
            log: { level: 'debug' },
            inbounds: [{ type: 'direct', tag: 'override-in' }],
            route: { final: 'direct' }
          })
        )
      );
      prisma.user.findMany.mockResolvedValue([]);
      const { singboxConfig } = await service.buildConfigSync('n1');
      expect(singboxConfig.log).toEqual({ level: 'debug', timestamp: true }); // 嵌套对象按键合并
      expect(singboxConfig.inbounds).toEqual([{ type: 'direct', tag: 'override-in' }]); // 数组整体替换
      expect(singboxConfig.route).toEqual({ final: 'direct' }); // 新增顶层键透传
    });

    it('版本号单调递增', async () => {
      prisma.node.findUnique.mockResolvedValue(nodeWithInbounds([]));
      prisma.user.findMany.mockResolvedValue([]);
      const a = await service.buildConfigSync('n1');
      const b = await service.buildConfigSync('n1');
      expect(b.version).toBeGreaterThan(a.version);
    });

    it('节点不存在抛出 NotFoundException', async () => {
      prisma.node.findUnique.mockResolvedValue(null);
      await expect(service.buildConfigSync('nope')).rejects.toThrow(NotFoundException);
    });
  });
});
