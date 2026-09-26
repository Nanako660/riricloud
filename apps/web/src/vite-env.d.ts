/// <reference types="vite/client" />

// 统一版本号（vite.config.ts define 注入，唯一版本源为根 package.json）
declare const __APP_VERSION__: string;
// 构建时内嵌默认项目 GitHub 仓库公开地址
declare const __DEFAULT_GITHUB_REPO_URL__: string;
