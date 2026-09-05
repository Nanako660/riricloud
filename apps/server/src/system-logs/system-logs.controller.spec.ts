import { ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Response } from 'express';
import { ExportLogsDto } from './dto/query-logs.dto';
import { SSEHubService } from './sse-hub.service';
import { SystemLogsController } from './system-logs.controller';
import { SystemLogsService } from './system-logs.service';

describe('SystemLogsController', () => {
  let controller: SystemLogsController;
  let logsService: {
    query: jest.Mock;
    getMetrics: jest.Mock;
    clean: jest.Mock;
    export: jest.Mock;
    enqueue: jest.Mock;
  };
  let sseHub: {
    subscribe: jest.Mock;
  };

  beforeEach(async () => {
    logsService = {
      query: jest.fn().mockResolvedValue({ data: [], total: 0, page: 1, pageSize: 50, totalPages: 0 }),
      getMetrics: jest.fn().mockResolvedValue({ totalLogs: 0, errorCount24h: 0, warnCount24h: 0, avgLatencyMs: 0, trend: [] }),
      clean: jest.fn().mockResolvedValue({ deletedCount: 10 }),
      export: jest.fn().mockResolvedValue('id,createdAt,source\n1,2026-09-06,SERVER'),
      enqueue: jest.fn()
    };
    sseHub = {
      subscribe: jest.fn()
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SystemLogsController],
      providers: [
        { provide: SystemLogsService, useValue: logsService },
        { provide: SSEHubService, useValue: sseHub }
      ]
    }).compile();

    controller = module.get<SystemLogsController>(SystemLogsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('ValidationPipe with ExportLogsDto', () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true
    });

    it('should successfully validate export query with format=csv and startTime', async () => {
      const rawQuery = {
        format: 'csv',
        startTime: '2026-09-04T16:32:18.838Z'
      };

      const result = await pipe.transform(rawQuery, {
        type: 'query',
        metatype: ExportLogsDto
      });

      expect(result).toBeDefined();
      expect(result.format).toBe('csv');
      expect(result.startTime).toBe('2026-09-04T16:32:18.838Z');
    });

    it('should reject invalid format in ExportLogsDto', async () => {
      const rawQuery = {
        format: 'invalid-format'
      };

      await expect(
        pipe.transform(rawQuery, {
          type: 'query',
          metatype: ExportLogsDto
        })
      ).rejects.toThrow();
    });

    it('should reject unwhitelisted properties in ExportLogsDto', async () => {
      const rawQuery = {
        format: 'csv',
        unknownProp: 'malicious'
      };

      await expect(
        pipe.transform(rawQuery, {
          type: 'query',
          metatype: ExportLogsDto
        })
      ).rejects.toThrow();
    });
  });

  describe('exportLogs', () => {
    it('should set csv content headers and return data', async () => {
      const mockRes = {
        setHeader: jest.fn()
      } as unknown as Response;

      const query: ExportLogsDto = {
        format: 'csv',
        startTime: '2026-09-04T16:32:18.838Z'
      };

      const result = await controller.exportLogs(query, mockRes);

      expect(logsService.export).toHaveBeenCalledWith(query, 'csv');
      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv; charset=utf-8');
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        expect.stringContaining('attachment; filename="riricloud-logs-')
      );
      expect(result).toBe('id,createdAt,source\n1,2026-09-06,SERVER');
    });

    it('should set json content headers when format is json', async () => {
      logsService.export.mockResolvedValue('[]');
      const mockRes = {
        setHeader: jest.fn()
      } as unknown as Response;

      const query: ExportLogsDto = {
        format: 'json'
      };

      const result = await controller.exportLogs(query, mockRes);

      expect(logsService.export).toHaveBeenCalledWith(query, 'json');
      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'application/json; charset=utf-8');
      expect(result).toBe('[]');
    });
  });

  describe('cleanLogs', () => {
    it('should delegate to logsService.clean with params', async () => {
      const result = await controller.cleanLogs({ retentionDays: 7, maxRecords: 10000 });
      expect(logsService.clean).toHaveBeenCalledWith(7, 10000);
      expect(result).toEqual({ deletedCount: 10 });
    });
  });
});
