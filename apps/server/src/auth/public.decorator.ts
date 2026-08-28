import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

// 显式登记公开端点（服务端默认拒绝鉴权，见 docs/PROJECT_CONSTRAINTS.md §4）
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
