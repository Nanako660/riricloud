import { Injectable } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface SystemVersionResponse {
  version: string;
  agentVersion: string;
  agentImage: string;
}

// 读取 Master 版本号（根 package.json）与 Agent 独立版本号及推荐镜像（见 docs/VERSIONING.md）
@Injectable()
export class SystemService {
  getVersion(): SystemVersionResponse {
    return {
      version: SystemService.readRootVersion(),
      agentVersion: SystemService.readAgentVersion(),
      agentImage: process.env.AGENT_IMAGE || 'riricloud/agent:latest'
    };
  }

  private static readRootVersion(): string {
    // 开发态 cwd=apps/server；生产容器 cwd=/app（构建产物随镜像布局）
    const candidates = [join(process.cwd(), '..', '..', 'package.json'), join(process.cwd(), 'package.json')];
    for (const p of candidates) {
      try {
        return JSON.parse(readFileSync(p, 'utf8')).version ?? '0.0.0';
      } catch {
        // 尝试下一个候选路径
      }
    }
    return process.env.npm_package_version ?? '0.0.0';
  }

  private static readAgentVersion(): string {
    const candidates = [
      join(process.cwd(), '..', 'agent', 'VERSION'),
      join(process.cwd(), 'apps', 'agent', 'VERSION'),
      join(process.cwd(), 'binaries', 'AGENT_VERSION'),
      join(process.cwd(), 'AGENT_VERSION')
    ];
    for (const p of candidates) {
      try {
        const v = readFileSync(p, 'utf8').trim();
        if (v) return v;
      } catch {
        // 尝试下一个候选路径
      }
    }
    return process.env.AGENT_VERSION ?? '0.0.0';
  }
}
