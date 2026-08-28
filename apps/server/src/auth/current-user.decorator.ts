import { createParamDecorator, ExecutionContext } from '@nestjs/common';

// 从请求中取当前登录用户（由 JwtAuthGuard 挂载）
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    return ctx.switchToHttp().getRequest().user;
  }
);
