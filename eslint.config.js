// ESLint 统一配置（flat config）：web 与 server 共用本文件，按目录区分语言环境与规则
const eslint = require('@eslint/js');
const tseslint = require('typescript-eslint');
const globals = require('globals');
const reactHooks = require('eslint-plugin-react-hooks');
const reactRefresh = require('eslint-plugin-react-refresh');

module.exports = tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      'eslint.config.js',
      'commitlint.config.cjs',
      'apps/server/prisma/**'
    ]
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // 下划线前缀参数为接口预留（如 UA 类型嗅探），允许未使用
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }]
    }
  },
  {
    files: ['apps/server/**/*.ts'],
    languageOptions: { globals: { ...globals.node, ...globals.jest } }
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }]
    }
  },
  {
    // shadcn/ui 原子组件经 CLI 生成并保持官方标准实现，其导出形态固定（buttonVariants、
    // useFormField 等与组件同文件），Fast Refresh 粒度规则不适用于该层，否则每次
    // shadcn add 都会重新引入警告
    files: ['apps/web/src/components/ui/**/*.{ts,tsx}'],
    rules: {
      'react-refresh/only-export-components': 'off'
    }
  }
);
