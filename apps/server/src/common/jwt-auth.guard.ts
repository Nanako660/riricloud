import { ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../auth/public.decorator';
import { ROLES_KEY } from './roles.decorator';
import { Role } from './constants';

// 全局 JWT + RBAC 守卫：默认所有端点需要 JWT，@Public() 显式放行；
// 端点声明 @Roles() 时在 JWT 校验通过后校验角色（安全红线：服务端默认拒绝）
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass()
    ]);
    if (isPublic) {
      return true;
    }

    const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass()
    ]);
    // @Roles() 端点走完整 JWT 链后做角色判定（base canActivate 内完成 passport 认证）
    const authenticated = (await super.canActivate(context)) as boolean;
    if (required && required.length > 0) {
      const { user } = context.switchToHttp().getRequest();
      if (!user || !required.includes(user.role)) {
        throw new ForbiddenException('需要管理员权限');
      }
    }
    return authenticated;
  }
}
