import { existsSync } from 'node:fs';
import { join } from 'node:path';

// Web 面板静态资源目录解析（返回 null 表示不托管，纯 API 模式）
// 优先级：WEB_DIST_PATH 环境变量（发行包/自定义部署显式指定）
//        → 开发态 monorepo 布局（cwd=apps/server）
//        → 发行包布局（cwd=包根，web-dist 与 apps/server 平级）
export function resolveWebDistRoot(cwd: string = process.cwd()): string | null {
  const candidates = [
    process.env.WEB_DIST_PATH,
    join(cwd, '..', '..', 'apps', 'web', 'dist'),
    join(cwd, 'web-dist')
  ].filter((p): p is string => !!p);

  for (const candidate of candidates) {
    if (existsSync(join(candidate, 'index.html'))) {
      return candidate;
    }
  }
  return null;
}
