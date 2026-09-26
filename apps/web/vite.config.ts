import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import rootPackageJson from '../../package.json';

const defaultGithubRepoUrl = (
  process.env.RIRICLOUD_DEFAULT_GITHUB_REPO_URL ||
  (typeof rootPackageJson.repository === 'object' && rootPackageJson.repository?.url
    ? rootPackageJson.repository.url
    : 'https://github.com/Nanako660/riricloud')
)
  .trim()
  .replace(/^git\+/, '')
  .replace(/\.git$/i, '')
  .replace(/\/+$/, '');

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  define: {
    // 统一版本号注入（唯一版本源为根 package.json，见 docs/VERSIONING.md §3）
    __APP_VERSION__: JSON.stringify(rootPackageJson.version),
    // 构建时内嵌默认项目 GitHub 公开仓库地址（用于系统设置与资源管理默认回退）
    __DEFAULT_GITHUB_REPO_URL__: JSON.stringify(defaultGithubRepoUrl)
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:3000',
        changeOrigin: true
      }
    }
  }
});
