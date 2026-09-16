import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { TelemetryPrismaService } from '../prisma/telemetry-prisma.service';
import { SSEHubService } from './sse-hub.service';
import { SystemLogsService } from './system-logs.service';

describe('SystemLogsService', () => {
  let service: SystemLogsService;
  let sseHub: SSEHubService;
  let telemetryPrisma: {
    systemLog: {
      createMany: jest.Mock;
      count: jest.Mock;
      findMany: jest.Mock;
      deleteMany: jest.Mock;
    };
  };
  let prisma: {
    node: { findMany: jest.Mock };
    user: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    telemetryPrisma = {
      systemLog: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        count: jest.fn().mockResolvedValue(10),
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn().mockResolvedValue({ count: 5 })
      }
    };
    prisma = {
      node: { findMany: jest.fn().mockResolvedValue([]) },
      user: { findMany: jest.fn().mockResolvedValue([]) }
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SystemLogsService,
        SSEHubService,
        {
          provide: TelemetryPrismaService,
          useValue: telemetryPrisma
        },
        {
          provide: PrismaService,
          useValue: prisma
        }
      ]
    }).compile();

    service = module.get<SystemLogsService>(SystemLogsService);
    sseHub = module.get<SSEHubService>(SSEHubService);
  });

  afterEach(async () => {
    await service.onModuleDestroy();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should enqueue and publish to SSE hub', () => {
    const publishSpy = jest.spyOn(sseHub, 'publish');

    service.enqueue({
      source: 'SERVER',
      level: 'INFO',
      module: 'Auth',
      message: 'User logged in successfully'
    });

    expect(publishSpy).toHaveBeenCalledTimes(1);
    expect(publishSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'SERVER',
        level: 'INFO',
        module: 'Auth',
        message: 'User logged in successfully'
      })
    );
  });

  it('should flush buffered logs to SQLite via createMany', async () => {
    service.enqueue({
      source: 'SERVER',
      level: 'ERROR',
      module: 'Database',
      message: 'Connection timeout'
    });

    await service.flush();

    expect(telemetryPrisma.systemLog.createMany).toHaveBeenCalledTimes(1);
    expect(telemetryPrisma.systemLog.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          source: 'SERVER',
          level: 'ERROR',
          module: 'Database',
          message: 'Connection timeout'
        })
      ])
    });
  });

  it('should support pagination and filtering in query', async () => {
    telemetryPrisma.systemLog.findMany.mockResolvedValueOnce([
      {
        id: 'log-1',
        source: 'WEB',
        level: 'ERROR',
        module: 'UI',
        message: 'Uncaught TypeError',
        createdAt: new Date()
      }
    ]);
    telemetryPrisma.systemLog.count.mockResolvedValueOnce(1);

    const result = await service.query({
      level: 'ERROR',
      source: 'WEB',
      page: 1,
      pageSize: 10
    });

    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.page).toBe(1);
  });

  it('should clean expired logs by retention days', async () => {
    const result = await service.clean(7, undefined);
    expect(telemetryPrisma.systemLog.deleteMany).toHaveBeenCalled();
    expect(result.deletedCount).toBe(5);
  });

  it('should filter logs below minIngestLevel', () => {
    const publishSpy = jest.spyOn(sseHub, 'publish');

    service.setMinIngestLevel('WARN');

    // INFO 应该被过滤掉，不广播也不入库
    service.enqueue({
      source: 'SERVER',
      level: 'INFO',
      module: 'Http',
      message: 'Routine health check'
    });
    expect(publishSpy).not.toHaveBeenCalled();

    // WARN 达到阈值，正常入库与广播
    service.enqueue({
      source: 'SERVER',
      level: 'WARN',
      module: 'Http',
      message: 'Slow query warning'
    });
    expect(publishSpy).toHaveBeenCalledTimes(1);

    // ERROR 超过阈值，正常入库与广播
    service.enqueue({
      source: 'SERVER',
      level: 'ERROR',
      module: 'Database',
      message: 'Disk write failure'
    });
    expect(publishSpy).toHaveBeenCalledTimes(2);
  });
});
