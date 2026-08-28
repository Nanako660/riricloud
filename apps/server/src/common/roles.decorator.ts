import { SetMetadata } from '@nestjs/common';
import { Role } from './constants';

export const ROLES_KEY = 'roles';

// 角色守卫装饰器：@Roles('ADMIN') 声明端点所需角色
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
