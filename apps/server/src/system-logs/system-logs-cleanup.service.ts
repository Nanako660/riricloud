import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { SettingsService } from '../system/settings.service';
import { SystemLogsService } from './system-logs.service';

@Injectable()
export class SystemLogsCleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SystemLogsCleanupService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly systemLogsService: SystemLogsService,
    private readonly settingsService: SettingsService
  ) {}

  onModuleInit(): void {
    // 延迟 10 秒后执行首次清理，避免拖慢应用启动
    setTimeout(() => {
      void this.runCleanup();
    }, 10_000);

    // 每小时巡检清理一次超期和超额日志
    this.timer = setInterval(() => {
      void this.runCleanup();
    }, 3600 * 1000);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async runCleanup(): Promise<void> {
    try {
      const allSettings = await this.settingsService.getSettings();
      const retentionDays = allSettings.logsRetentionDays ? Number(allSettings.logsRetentionDays) : 7;
      const maxRecords = allSettings.logsMaxCount ? Number(allSettings.logsMaxCount) : 100_000;

      const { deletedCount } = await this.systemLogsService.clean(retentionDays, maxRecords);
      if (deletedCount > 0) {
        this.logger.log(`Auto cleanup expired system logs: purged ${deletedCount} records (retention=${retentionDays}d, max=${maxRecords})`);
      }
    } catch (err) {
      this.logger.warn(`Failed to run system logs cleanup: ${String(err)}`);
    }
  }
}
