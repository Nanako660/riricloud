import { Test } from '@nestjs/testing';
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
  };

  // 事务句柄 mock：记录调用序列
  const txCalls: string[] = [];
  const txMock = {
    node: {
      update: jest.fn(async () => {
        txCalls.push('node.update');
      })
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

  it('authenticate 对缺失 token 返回失败', async () => {
    const result = await service.authenticate(undefined);
    expect(result.ok).toBe(false);
  });
});
