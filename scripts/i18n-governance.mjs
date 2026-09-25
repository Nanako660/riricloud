#!/usr/bin/env node

/**
 * @file i18n-governance.mjs
 * @description RiriCloud 国际化 (i18n) 机械治理与质量门禁脚本
 *
 * 核心功能：
 * 1. check:
 *    - 扫描 apps/web/src 下所有 TSX 视图源码，拦截硬编码中文字符串（JSX 裸文本、placeholder、title、aria-label、toast 等）；
 *    - 发现未走 i18n 的硬编码文本时直接阻断门禁 (exit code 1)；
 *    - 输出各语言字典相对于 zh-CN 基准的词条覆盖率看板（不阻断发布，允许后续异步补足）。
 * 2. report:
 *    - 输出详细的多语言欠账清单与待翻译键名台账。
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const WEB_SRC_DIR = path.resolve(ROOT_DIR, 'apps/web/src');
const LOCALES_DIR = path.resolve(WEB_SRC_DIR, 'locales');

const NAMESPACES = ['common', 'auth', 'errors', 'landing', 'user', 'admin'];
const TARGET_LANGS = ['en-US', 'ja-JP'];
const BASE_LANG = 'zh-CN';

const CHINESE_CHAR_REGEX = /[\u4e00-\u9fa5]/;

/**
 * 递归获取目录下所有匹配扩展名的文件
 */
function walkFiles(dir, filterFn) {
  const results = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(fullPath, filterFn));
    } else if (entry.isFile() && filterFn(fullPath)) {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * 移除字符串中的花括号表达式 {...}
 */
function stripJsxExpressions(text) {
  let result = '';
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '{') {
      depth++;
    } else if (char === '}') {
      if (depth > 0) depth--;
    } else if (depth === 0) {
      result += char;
    }
  }
  return result;
}

/**
 * 扫描 TSX 文件中的裸写中文字符串
 */
function scanTsxForHardcodedChinese(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);
  const violations = [];

  let inBlockComment = false;

  for (let idx = 0; idx < lines.length; idx++) {
    const lineNum = idx + 1;
    let line = lines[idx];

    // 处理块级注释 /* ... */
    if (inBlockComment) {
      if (line.includes('*/')) {
        line = line.slice(line.indexOf('*/') + 2);
        inBlockComment = false;
      } else {
        continue;
      }
    }

    while (line.includes('/*')) {
      const start = line.indexOf('/*');
      const end = line.indexOf('*/', start + 2);
      if (end !== -1) {
        line = line.slice(0, start) + line.slice(end + 2);
      } else {
        line = line.slice(0, start);
        inBlockComment = true;
        break;
      }
    }

    // 去除行内单行注释 // ...
    const commentIdx = line.indexOf('//');
    const commentText = commentIdx !== -1 ? line.slice(commentIdx) : '';
    if (commentIdx !== -1) {
      // 允许使用 // i18n-ignore 豁免特定行
      if (commentText.includes('i18n-ignore')) {
        continue;
      }
      line = line.slice(0, commentIdx);
    }

    // 如果去除注释后不含中文，直接跳过
    if (!CHINESE_CHAR_REGEX.test(line)) {
      continue;
    }

    // 排除纯开发调试打印 console.log
    if (/console\.(log|warn|error|info|debug)\s*\(/.test(line)) {
      continue;
    }

    // 检查 1: 常见用户界面裸字符串属性中含有中文：placeholder="...", title="...", aria-label="..." 等
    const attrMatch = line.match(/\b(placeholder|title|label|aria-label|tooltip|emptyText|alt)=["'`]([^"'`]*[\u4e00-\u9fa5]+[^"'`]*)["'`]/i);
    if (attrMatch) {
      const text = attrMatch[2].trim();
      if (text) {
        violations.push({ lineNum, type: `属性 ${attrMatch[1]}`, text, raw: line.trim() });
        continue;
      }
    }

    // 检查 2: Toast / Alert 弹窗提示文本中硬编码中文：toast.xxx("...")
    const toastMatch = line.match(/\btoast\.(success|error|info|warning|promise)\s*\(\s*["'`]([^"'`]*[\u4e00-\u9fa5]+[^"'`]*)["'`]/);
    if (toastMatch) {
      const text = toastMatch[2].trim();
      if (text) {
        violations.push({ lineNum, type: `Toast 提示`, text, raw: line.trim() });
        continue;
      }
    }

    // 检查 3: JSX 标签间的裸文本节点：>...<（剥离内部 {...} 动态表达式）
    // 例如 <span>保存</span> -> 违规；<span>{t('...')}</span> -> 剥离后为 <span></span>，通过
    const tagMatches = [...line.matchAll(/>([^<]+)</g)];
    let foundJsxText = false;
    for (const match of tagMatches) {
      const inner = match[1];
      const stripped = stripJsxExpressions(inner).trim();
      if (stripped && CHINESE_CHAR_REGEX.test(stripped)) {
        violations.push({ lineNum, type: 'JSX 裸文本', text: stripped, raw: line.trim() });
        foundJsxText = true;
        break;
      }
    }
    if (foundJsxText) continue;

    // 检查 4: Zod 表单校验直接手写中文字符串：.min(..., '至少...') 等（非 t(...) 调用）
    const zodMatch = line.match(/\.(min|max|regex|refine|nonempty|length)\s*\([^)]*["'`]([^"'`]*[\u4e00-\u9fa5]+[^"'`]*)["'`]/);
    if (zodMatch) {
      const text = zodMatch[2].trim();
      if (text) {
        violations.push({ lineNum, type: `Zod 校验文案`, text, raw: line.trim() });
        continue;
      }
    }
  }

  return violations;
}

/**
 * 加载字典文件并解析为平铺对象
 */
function loadLocaleNamespace(lang, ns) {
  const filePath = path.join(LOCALES_DIR, lang, `${ns}.ts`);
  if (!fs.existsSync(filePath)) return {};
  const code = fs.readFileSync(filePath, 'utf8');
  const jsCode = code
    .replace(/\bas\s+const\b/g, '')
    .replace(/export\s+default\s+([a-zA-Z0-9_]+)\s*;?/g, 'module.exports = $1;');
  const sandbox = { module: { exports: {} } };
  try {
    vm.runInNewContext(jsCode, sandbox, { filename: filePath });
    return flattenObject(sandbox.module.exports);
  } catch (err) {
    console.error(`加载语言包失败: ${filePath}`, err);
    return {};
  }
}

function flattenObject(obj, prefix = '', result = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const keyPath = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      flattenObject(v, keyPath, result);
    } else {
      result[keyPath] = v;
    }
  }
  return result;
}

/**
 * 比对非主语言字典相对于 zh-CN 基准的差异
 */
function auditDictionaryCoverage() {
  const stats = {};
  for (const lang of TARGET_LANGS) {
    stats[lang] = { totalBaseKeys: 0, presentKeys: 0, missingKeys: [] };
  }

  for (const ns of NAMESPACES) {
    const baseDict = loadLocaleNamespace(BASE_LANG, ns);
    const baseKeyList = Object.keys(baseDict);

    for (const lang of TARGET_LANGS) {
      const targetDict = loadLocaleNamespace(lang, ns);
      const targetKeySet = new Set(Object.keys(targetDict));

      stats[lang].totalBaseKeys += baseKeyList.length;

      for (const k of baseKeyList) {
        if (targetKeySet.has(k)) {
          stats[lang].presentKeys++;
        } else {
          stats[lang].missingKeys.push(`${ns}:${k}`);
        }
      }
    }
  }

  return stats;
}

/**
 * 运行硬编码文本检查 (gate:i18n 核心门禁)
 */
function runCheck() {
  console.log('🔍 [i18n-governance] 正在扫描前端 TSX 源码中的未国际化硬编码中文...');

  const tsxFiles = walkFiles(WEB_SRC_DIR, (f) => {
    const rel = path.relative(WEB_SRC_DIR, f).replace(/\\/g, '/');
    if (rel.startsWith('locales/')) return false;
    if (rel.endsWith('.spec.tsx') || rel.endsWith('.test.tsx') || rel.endsWith('.d.ts')) return false;
    return rel.endsWith('.tsx');
  });

  const allViolations = [];

  for (const file of tsxFiles) {
    const violations = scanTsxForHardcodedChinese(file);
    if (violations.length > 0) {
      const relPath = path.relative(ROOT_DIR, file).replace(/\\/g, '/');
      allViolations.push({ file: relPath, violations });
    }
  }

  if (allViolations.length > 0) {
    console.error('\n❌ [i18n 机械门禁阻断] 在 TSX 视图源码中检测到未走 i18n 字典的硬编码中文！');
    console.error('👉 项目约束规范：新增或修改 UI 时，文本必须定义于 apps/web/src/locales/zh-CN/ 并通过 t(...) 引用。\n');

    let totalCount = 0;
    for (const { file, violations } of allViolations) {
      console.error(`📄 ${file}:`);
      for (const v of violations) {
        totalCount++;
        console.error(`  Line ${v.lineNum} [${v.type}]: "${v.text}"`);
        console.error(`    ↳ 代码片段: ${v.raw}`);
      }
      console.error('');
    }

    console.error(`共发现 ${totalCount} 处硬编码违规项。请将其移入对应命名空间的 zh-CN 字典，或在合法技术豁免行添加 // i18n-ignore。`);
    process.exit(1);
  }

  console.log('✅ [i18n-governance] TSX 源码硬编码扫描通过！所有可见 UI 文本均已通过 i18n 统一管理。');

  // 输出多语言覆盖率看板（不阻断）
  printCoverageReport(false);
}

/**
 * 打印多语言字典覆盖率看板
 */
function printCoverageReport(detailed = false) {
  const stats = auditDictionaryCoverage();
  console.log('\n📊 [i18n 多语言字典覆盖率看板 (以 zh-CN 为基准)]');
  console.log('----------------------------------------------------------------------');
  console.log('| 语言代码 | 语言名称 | zh-CN 基准词条 | 当前已翻译 | 覆盖率   | 待补齐 |');
  console.log('----------------------------------------------------------------------');

  const langNames = {
    'en-US': 'English',
    'ja-JP': '日本語'
  };

  let hasPending = false;

  for (const [lang, data] of Object.entries(stats)) {
    const name = langNames[lang] || lang;
    const rate = data.totalBaseKeys > 0 ? ((data.presentKeys / data.totalBaseKeys) * 100).toFixed(1) : '100.0';
    const pendingCount = data.missingKeys.length;
    if (pendingCount > 0) hasPending = true;

    console.log(
      `| ${lang.padEnd(8)} | ${name.padEnd(8)} | ${String(data.totalBaseKeys).padStart(14)} | ${String(data.presentKeys).padStart(10)} | ${(rate + '%').padStart(8)} | ${String(pendingCount).padStart(6)} |`
    );
  }
  console.log('----------------------------------------------------------------------');

  if (hasPending) {
    console.log('ℹ️  提示：检测到非中文语言存在未翻译词条。根据项目轻量敏捷规范，未补齐词条在运行时将自动无缝回退至 zh-CN，不影响主干合入。');
    if (detailed) {
      console.log('\n📋 [待补齐词条明细清单 (Missing Keys Ledger)]：');
      for (const [lang, data] of Object.entries(stats)) {
        if (data.missingKeys.length > 0) {
          console.log(`\n=== ${lang} (${data.missingKeys.length} 项) ===`);
          for (const key of data.missingKeys) {
            console.log(`  - ${key}`);
          }
        }
      }
    } else {
      console.log('👉 如需查看完整待补齐键名清单，请运行: pnpm i18n:report\n');
    }
  } else {
    console.log('✨ 太棒了！en-US 与 ja-JP 已 100% 对齐 zh-CN 全部词条！\n');
  }
}

// 命令行路由
const args = process.argv.slice(2);
const command = args[0] || 'check';

switch (command) {
  case 'check':
    runCheck();
    break;
  case 'report':
    printCoverageReport(true);
    break;
  default:
    console.error(`未知命令: ${command}。支持命令: check, report`);
    process.exit(1);
}
