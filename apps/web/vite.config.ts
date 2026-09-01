import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import rootPackageJson from '../../package.json';

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
    __APP_VERSION__: JSON.stringify(rootPackageJson.version)
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
