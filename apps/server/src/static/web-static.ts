import { join } from 'node:path';
import { Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { resolveWebDistRoot } from './resolve-web-dist';

// 手写 Web 面板静态托管（@nestjs/serve-static 4.x 的默认 renderPath '*'
// 与 Express 5 / path-to-regexp v8 不兼容，启动即抛 PathError）：
// express.static 托管资源文件 + 未命中 /api 前缀的 GET 回退 index.html（SPA）
export function registerWebStatic(app: NestExpressApplication): void {
  const root = resolveWebDistRoot();
  if (!root) {
    new Logger('WebStatic').warn('web dist not found, serving API only');
    return;
  }
  app.useStaticAssets(root);
  const indexHtml = join(root, 'index.html');
  const fallback: import('express').RequestHandler = (req, res, next) => {
    // 仅拦截非 /api 的页面导航请求，API 404 交回 Express 默认处理
    if (req.method === 'GET' && !req.path.startsWith('/api')) {
      res.sendFile(indexHtml, (err) => {
        if (err) {
          next(err);
        }
      });
      return;
    }
    next();
  };
  // 挂在所有路由之后：静态资源与 API 优先，最后兜底 SPA 回退
  app.use(fallback);
}
