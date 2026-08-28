import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { AgentGatewayService } from './agent-gateway.service';

// 心跳超时扫描：周期任务在模块销毁时清理（进程内定时器，零外部依赖）
@Injectable()
export class AgentSweepService implements OnModuleDestroy {
  private sweepTimer?: NodeJS.Timeout;

  constructor(private readonly gateway: AgentGatewayService) {}

  start() {
    this.sweepTimer = setInterval(() => {
      void this.gateway.sweepStaleNodes();
    }, 15_000);
    this.sweepTimer.unref?.();
  }

  onModuleDestroy() {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
    }
  }
}
