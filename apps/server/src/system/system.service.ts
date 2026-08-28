import { Injectable } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// 从仓库根 package.json 读取统一版本号（唯一版本源，见 docs/VERSIONING.md §3）
@Injectable()
export class SystemService {
  getVersion(): { version: string } {
    return { version: SystemService.readRootVersion() };
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
}
