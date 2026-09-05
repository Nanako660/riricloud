import { Injectable, type MessageEvent } from '@nestjs/common';
import { filter, map, Observable, Subject } from 'rxjs';

export interface SystemLogEntry {
  id: string;
  traceId?: string | null;
  source: string;
  level: string;
  module: string;
  message: string;
  metadata: string;
  nodeId?: string | null;
  userId?: string | null;
  createdAt: Date;
}

export interface StreamFilter {
  level?: string;
  source?: string;
  nodeId?: string;
  keyword?: string;
}

@Injectable()
export class SSEHubService {
  private readonly stream$ = new Subject<SystemLogEntry>();

  /**
   * 发布单条实时日志到 SSE 广播池
   */
  publish(entry: SystemLogEntry): void {
    this.stream$.next(entry);
  }

  /**
   * 订阅实时日志流并根据入参过滤
   */
  subscribe(filterCriteria?: StreamFilter): Observable<MessageEvent> {
    return this.stream$.pipe(
      filter((entry) => {
        if (!filterCriteria) return true;

        if (filterCriteria.level && filterCriteria.level !== 'ALL') {
          if (entry.level !== filterCriteria.level) return false;
        }

        if (filterCriteria.source && filterCriteria.source !== 'ALL') {
          if (entry.source !== filterCriteria.source) return false;
        }

        if (filterCriteria.nodeId && filterCriteria.nodeId !== 'ALL') {
          if (entry.nodeId !== filterCriteria.nodeId) return false;
        }

        if (filterCriteria.keyword) {
          const kw = filterCriteria.keyword.toLowerCase();
          const matchMsg = entry.message.toLowerCase().includes(kw);
          const matchMod = entry.module.toLowerCase().includes(kw);
          const matchMeta = entry.metadata.toLowerCase().includes(kw);
          const matchTrace = entry.traceId ? entry.traceId.toLowerCase().includes(kw) : false;
          if (!matchMsg && !matchMod && !matchMeta && !matchTrace) {
            return false;
          }
        }

        return true;
      }),
      map((entry) => ({
        data: entry,
        id: entry.id
      }))
    );
  }
}
