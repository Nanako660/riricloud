import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { AgentService } from './agent.service';

// 心跳超时扫描：周期任务在模块销毁时清理（进程内定时器，零外部依赖）
@Injectable()
export class AgentSweepService implements OnModuleDestroy {
  private readonly logger = new Logger(AgentSweepService.name);
  private sweepTimer?: NodeJS.Timeout;

  constructor(private readonly gateway: AgentService) {}

  private async runSweep(): Promise<void> {
    try {
      await this.gateway.sweepStaleNodes();
    } catch (err) {
      this.logger.warn(`stale node sweep failed: ${err}`);
    }
    try {
      await this.gateway.cleanupOldRateMetrics();
    } catch (err) {
      this.logger.warn(`rate metric cleanup failed: ${err}`);
    }
  }

  start() {
    this.sweepTimer = setInterval(() => {
      void this.runSweep();
    }, 15_000);
    this.sweepTimer.unref?.();
  }

  onModuleDestroy() {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
    }
  }
}
