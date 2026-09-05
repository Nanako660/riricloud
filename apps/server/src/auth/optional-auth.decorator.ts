import { SetMetadata } from '@nestjs/common';

export const OPTIONAL_AUTH_KEY = 'optionalAuth';

// 公开接口在携带有效 JWT 时仍解析当前用户，供同一路由同时支持注册与登录态操作。
export const OptionalAuth = () => SetMetadata(OPTIONAL_AUTH_KEY, true);
