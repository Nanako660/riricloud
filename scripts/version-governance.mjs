#!/usr/bin/env node

/**
 * @file version-governance.mjs
 * @description RiriCloud 统一版本管理与自动化门禁治理脚本
 * 
 * 功能：
 * 1. bump [patch|minor|major|<version>]: 将 CHANGELOG.md 中的 [Unreleased] 转化为定稿版本小节、更新 package.json、同步 README.md 徽标并在顶部生成新 [Unreleased] 模板
 * 2. check: 校验版本号合法性、子包无私有版本、CHANGELOG 顶部 [Unreleased] 与首版本小节一致性、核心代码变更时的 [Unreleased] 维护约束
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const PKG_PATH = path.resolve(ROOT_DIR, 'package.json');
const CHANGELOG_PATH = path.resolve(ROOT_DIR, 'CHANGELOG.md');
const README_PATH = path.resolve(ROOT_DIR, 'README.md');
const AGENT_VERSION_PATH = path.resolve(ROOT_DIR, 'apps/agent/VERSION');
const AGENT_CHANGELOG_PATH = path.resolve(ROOT_DIR, 'apps/agent/CHANGELOG.md');

// Master 核心代码路径前缀（仅 Master 相关的核心代码）
const MASTER_CORE_CODE_PREFIXES = [
  'apps/server/',
  'apps/web/',
  'prisma/',
];

// Agent 核心代码路径前缀
const AGENT_CORE_CODE_PREFIXES = [
  'apps/agent/',
];

const UNRELEASED_TEMPLATE = `## [Unreleased]

### Added

### Changed

### Fixed

`;

/**
 * 终端颜色工具
 */
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
};

function logSuccess(msg) {
  console.log(`${colors.green}✓${colors.reset} ${msg}`);
}

function logInfo(msg) {
  console.log(`${colors.cyan}ℹ${colors.reset} ${msg}`);
}

function logWarn(msg) {
  console.log(`${colors.yellow}⚠${colors.reset} ${msg}`);
}

function logError(msg) {
  console.error(`${colors.red}❌ ${msg}${colors.reset}`);
}

/**
 * 获取今天的 YYYY-MM-DD 格式日期
 */
function getTodayString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 解析 SemVer 字符串
 */
function parseSemVer(str) {
  if (!str || typeof str !== 'string') return null;
  const match = str.trim().match(/^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/);
  if (!match) return null;
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    prerelease: match[4] || null,
    raw: `${match[1]}.${match[2]}.${match[3]}${match[4] ? `-${match[4]}` : ''}`,
  };
}

/**
 * 比较两个 SemVer 版本号
 * 返回：1 表示 a > b，0 表示 a == b，-1 表示 a < b
 */
function compareSemVer(v1, v2) {
  const p1 = parseSemVer(v1);
  const p2 = parseSemVer(v2);
  if (!p1 || !p2) {
    throw new Error(`无法比较非法版本号: "${v1}" 与 "${v2}"`);
  }

  if (p1.major !== p2.major) return p1.major > p2.major ? 1 : -1;
  if (p1.minor !== p2.minor) return p1.minor > p2.minor ? 1 : -1;
  if (p1.patch !== p2.patch) return p1.patch > p2.patch ? 1 : -1;

  // 正式版本高于预发布版本
  if (!p1.prerelease && p2.prerelease) return 1;
  if (p1.prerelease && !p2.prerelease) return -1;
  if (p1.prerelease && p2.prerelease) {
    if (p1.prerelease > p2.prerelease) return 1;
    if (p1.prerelease < p2.prerelease) return -1;
  }

  return 0;
}

/**
 * 计算下一个 SemVer 版本
 */
function bumpSemVer(currentVersion, bumpType) {
  const semver = parseSemVer(currentVersion);
  if (!semver) {
    throw new Error(`当前版本号非法: "${currentVersion}"`);
  }

  const type = (bumpType || 'patch').toLowerCase().trim();

  if (type === 'patch') {
    return `${semver.major}.${semver.minor}.${semver.patch + 1}`;
  } else if (type === 'minor') {
    return `${semver.major}.${semver.minor + 1}.0`;
  } else if (type === 'major') {
    return `${semver.major + 1}.0.0`;
  }

  // 显式传入了具体版本号（如 0.5.0）
  const explicit = parseSemVer(type);
  if (explicit) {
    if (compareSemVer(explicit.raw, currentVersion) <= 0) {
      throw new Error(`显式指定的目标版本号 ${explicit.raw} 必须严格大于当前版本 ${currentVersion}`);
    }
    return explicit.raw;
  }

  throw new Error(`未知的递增类型: "${bumpType}"，支持 patch | minor | major 或显式 SemVer 版本号（如 0.5.0）`);
}

/**
 * 提取并清理 Unreleased 小节内容
 */
function extractUnreleasedContent(changelog) {
  const startMatch = changelog.match(/^##\s*\[Unreleased\]/m);
  if (!startMatch || startMatch.index === undefined) {
    return { hasUnreleased: false, content: '', startIndex: -1, endIndex: -1 };
  }

  const startIndex = startMatch.index + startMatch[0].length;
  const afterStart = changelog.slice(startIndex);
  const nextSectionMatch = afterStart.match(/\r?\n(?=##\s*\[)/);
  const endIndex = nextSectionMatch && nextSectionMatch.index !== undefined
    ? startIndex + nextSectionMatch.index
    : changelog.length;

  const rawContent = changelog.slice(startIndex, endIndex);
  return {
    hasUnreleased: true,
    content: rawContent.trim(),
    startIndex: startMatch.index,
    endIndex,
  };
}

/**
 * 执行版本自增 (pnpm bump [patch|minor|major])
 */
function cmdBump(args) {
  const bumpType = args[0] || 'patch';

  if (!fs.existsSync(PKG_PATH)) {
    logError(`未找到根 package.json: ${PKG_PATH}`);
    process.exit(1);
  }

  const rawPkg = fs.readFileSync(PKG_PATH, 'utf-8');
  let pkg;
  try {
    pkg = JSON.parse(rawPkg);
  } catch (err) {
    logError(`解析 package.json 失败: ${err.message}`);
    process.exit(1);
  }

  const currentVersion = pkg.version;
  const nextVersion = bumpSemVer(currentVersion, bumpType);
  const today = getTodayString();

  // 1. 更新 package.json
  pkg.version = nextVersion;
  fs.writeFileSync(PKG_PATH, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');
  logSuccess(`package.json 版本已从 ${colors.yellow}v${currentVersion}${colors.reset} 递增至 ${colors.green}v${nextVersion}${colors.reset}`);

  // 2. 更新 CHANGELOG.md
  if (fs.existsSync(CHANGELOG_PATH)) {
    let changelog = fs.readFileSync(CHANGELOG_PATH, 'utf-8');
    const { hasUnreleased, content: unreleasedContent, startIndex, endIndex } = extractUnreleasedContent(changelog);

    // 判断 Unreleased 内容是否有实际条目（除空分类标题外有条目）
    const lines = unreleasedContent.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const hasMeaningfulContent = lines.some(l => l.startsWith('- ') || l.startsWith('* '));

    let newVersionSection = '';
    if (hasMeaningfulContent) {
      const cleanedContent = unreleasedContent
        .replace(/###\s+(Added|Changed|Fixed|Removed|Security|Deprecated)\s*(?=(?:\r?\n)*###|$)/g, '')
        .trim();
      newVersionSection = `## [${nextVersion}] - ${today}\n\n${cleanedContent}\n\n`;
    } else {
      newVersionSection = `## [${nextVersion}] - ${today}\n\n### Added\n\n- \n\n### Changed\n\n- \n\n### Fixed\n\n- \n\n`;
    }

    if (hasUnreleased) {
      // 替换旧的 ## [Unreleased]... 为新的 ## [Unreleased] 模板 + 定稿版本小节
      const before = changelog.slice(0, startIndex);
      const after = changelog.slice(endIndex).replace(/^\r?\n+/, '\n\n');
      changelog = `${before}${UNRELEASED_TEMPLATE}\n${newVersionSection}${after}`;
      fs.writeFileSync(CHANGELOG_PATH, changelog, 'utf-8');
      logSuccess(`CHANGELOG.md 已将 [Unreleased] 转换为 ## [${nextVersion}] - ${today}，并重置顶部 [Unreleased] 模板`);
    } else {
      // 在第一个具体版本小节前插入 [Unreleased] 模板与新版本小节
      const firstVersionRegex = /^##\s*\[(\d+\.\d+\.\d+)\]/m;
      const match = changelog.match(firstVersionRegex);
      const combined = `${UNRELEASED_TEMPLATE}\n${newVersionSection}`;

      if (match && match.index !== undefined) {
        changelog = changelog.slice(0, match.index) + combined + changelog.slice(match.index);
      } else {
        changelog += `\n${combined}`;
      }
      fs.writeFileSync(CHANGELOG_PATH, changelog, 'utf-8');
      logSuccess(`CHANGELOG.md 已插入新的版本小节 ## [${nextVersion}] - ${today} 与顶部 [Unreleased] 模板`);
    }
  } else {
    logWarn(`未找到 CHANGELOG.md，跳过日志更新`);
  }

  // 3. 更新 README.md 中的 Version 徽标
  if (fs.existsSync(README_PATH)) {
    let readme = fs.readFileSync(README_PATH, 'utf-8');
    const badgeRegex = /https:\/\/img\.shields\.io\/badge\/version-[^-\s)]+-blue\.svg/g;
    if (badgeRegex.test(readme)) {
      readme = readme.replace(badgeRegex, `https://img.shields.io/badge/version-${nextVersion}-blue.svg`);
      fs.writeFileSync(README_PATH, readme, 'utf-8');
      logSuccess(`README.md 顶部 Version 徽标已同步更新为 ${colors.green}[${nextVersion}]${colors.reset}`);
    } else {
      logWarn(`README.md 中未匹配到 Version 徽标 (img.shields.io/badge/version-...)，跳过徽标更新`);
    }
  }

  console.log('');
  logInfo(`下一步：请检查 CHANGELOG.md 中的 ## [${nextVersion}] 版本说明，自查 pnpm gate 后提 Release PR。`);
}

/**
 * 执行 Agent 独立版本自增 (pnpm bump:agent [patch|minor|major|<version>])
 */
function cmdBumpAgent(args) {
  const bumpType = args[0] || 'patch';

  if (!fs.existsSync(AGENT_VERSION_PATH)) {
    logError(`未找到 Agent 版本文件: ${AGENT_VERSION_PATH}`);
    process.exit(1);
  }

  const currentVersion = fs.readFileSync(AGENT_VERSION_PATH, 'utf-8').trim();
  const nextVersion = bumpSemVer(currentVersion, bumpType);
  const today = getTodayString();

  // 1. 更新 apps/agent/VERSION
  fs.writeFileSync(AGENT_VERSION_PATH, `${nextVersion}\n`, 'utf-8');
  logSuccess(`apps/agent/VERSION 版本已从 ${colors.yellow}v${currentVersion}${colors.reset} 递增至 ${colors.green}v${nextVersion}${colors.reset}`);

  // 2. 更新 apps/agent/CHANGELOG.md
  if (fs.existsSync(AGENT_CHANGELOG_PATH)) {
    let changelog = fs.readFileSync(AGENT_CHANGELOG_PATH, 'utf-8');
    const { hasUnreleased, content: unreleasedContent, startIndex, endIndex } = extractUnreleasedContent(changelog);

    const lines = unreleasedContent.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const hasMeaningfulContent = lines.some(l => l.startsWith('- ') || l.startsWith('* '));

    let newVersionSection = '';
    if (hasMeaningfulContent) {
      const cleanedContent = unreleasedContent
        .replace(/###\s+(Added|Changed|Fixed|Removed|Security|Deprecated)\s*(?=(?:\r?\n)*###|$)/g, '')
        .trim();
      newVersionSection = `## [${nextVersion}] - ${today}\n\n${cleanedContent}\n\n`;
    } else {
      newVersionSection = `## [${nextVersion}] - ${today}\n\n### Added\n\n- \n\n### Changed\n\n- \n\n### Fixed\n\n- \n\n`;
    }

    if (hasUnreleased) {
      const before = changelog.slice(0, startIndex);
      const after = changelog.slice(endIndex).replace(/^\r?\n+/, '\n\n');
      changelog = `${before}${UNRELEASED_TEMPLATE}\n${newVersionSection}${after}`;
      fs.writeFileSync(AGENT_CHANGELOG_PATH, changelog, 'utf-8');
      logSuccess(`apps/agent/CHANGELOG.md 已将 [Unreleased] 转换为 ## [${nextVersion}] - ${today}，并重置顶部 [Unreleased] 模板`);
    } else {
      const firstVersionRegex = /^##\s*\[(\d+\.\d+\.\d+)\]/m;
      const match = changelog.match(firstVersionRegex);
      const combined = `${UNRELEASED_TEMPLATE}\n${newVersionSection}`;

      if (match && match.index !== undefined) {
        changelog = changelog.slice(0, match.index) + combined + changelog.slice(match.index);
      } else {
        changelog += `\n${combined}`;
      }
      fs.writeFileSync(AGENT_CHANGELOG_PATH, changelog, 'utf-8');
      logSuccess(`apps/agent/CHANGELOG.md 已插入新的版本小节 ## [${nextVersion}] - ${today} 与顶部 [Unreleased] 模板`);
    }
  } else {
    logWarn(`未找到 apps/agent/CHANGELOG.md，跳过日志更新`);
  }

  console.log('');
  logInfo(`下一步：请检查 apps/agent/CHANGELOG.md 中的 ## [${nextVersion}] 版本说明，并提 Agent Release PR（Tag: agent-v${nextVersion}）。`);
}

/**
 * 查找 git 基准 commit / 分支
 */
function getGitBaseRef() {
  try {
    // 1. CI 环境中的 PR 基准
    if (process.env.GITHUB_BASE_REF) {
      return `origin/${process.env.GITHUB_BASE_REF}`;
    }

    // 2. 本地分支与 origin/main 或 main 比对
    const candidates = ['origin/main', 'main', 'master'];
    for (const ref of candidates) {
      try {
        execSync(`git rev-parse --verify ${ref}`, { stdio: 'ignore', cwd: ROOT_DIR });
        // 获取与基准的 merge-base
        const mergeBase = execSync(`git merge-base HEAD ${ref}`, { encoding: 'utf-8', cwd: ROOT_DIR }).trim();
        if (mergeBase) {
          return { ref, mergeBase };
        }
      } catch {
        // 继续尝试下一个候选
      }
    }
  } catch {
    // Git 命令不可用
  }
  return null;
}

/**
 * 获取变更文件列表
 */
function getChangedFiles(baseRef) {
  try {
    const diffTarget = typeof baseRef === 'object' ? baseRef.mergeBase : baseRef;
    const output = execSync(`git diff --name-only ${diffTarget} HEAD`, { encoding: 'utf-8', cwd: ROOT_DIR });
    return output
      .split(/\r?\n/)
      .map(s => s.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * 获取基准分支的 package.json 版本
 */
function getBasePackageVersion(baseRef) {
  try {
    const target = typeof baseRef === 'object' ? baseRef.mergeBase : baseRef;
    const content = execSync(`git show ${target}:package.json`, { encoding: 'utf-8', cwd: ROOT_DIR });
    const json = JSON.parse(content);
    return json.version || null;
  } catch {
    return null;
  }
}
/**
 * 校验 CHANGELOG 文件是否有有效新增条目
 */
function hasChangelogAdditions(baseRef, changelogRelativePath = 'CHANGELOG.md') {
  try {
    const diffTarget = typeof baseRef === 'object' ? baseRef.mergeBase : baseRef;
    const diffOutput = execSync(`git diff ${diffTarget} HEAD -- ${changelogRelativePath}`, { encoding: 'utf-8', cwd: ROOT_DIR });
    const addedLines = diffOutput
      .split(/\r?\n/)
      .filter(line => line.startsWith('+') && !line.startsWith('+++'))
      .map(line => line.substring(1).trim())
      .filter(line => line.length > 0 && !line.startsWith('## ') && !line.startsWith('### '));

    return addedLines.length > 0;
  } catch {
    return false;
  }
}

/**
 * 获取基准分支的 apps/agent/VERSION 版本
 */
function getBaseAgentVersion(baseRef) {
  try {
    const target = typeof baseRef === 'object' ? baseRef.mergeBase : baseRef;
    const content = execSync(`git show ${target}:apps/agent/VERSION`, { encoding: 'utf-8', cwd: ROOT_DIR, stdio: ['pipe', 'pipe', 'ignore'] });
    return content.trim() || null;
  } catch {
    return null;
  }
}

/**
 * 执行版本门禁检查 (pnpm gate:version)
 */
function cmdCheck() {
  console.log(`${colors.bold}🔍 开始执行版本管理与 CHANGELOG 门禁校验...${colors.reset}\n`);
  const errors = [];
  const warnings = [];

  // ---------- 1. 根 package.json 版本校验 (Master) ----------
  if (!fs.existsSync(PKG_PATH)) {
    errors.push(`未找到根 package.json: ${PKG_PATH}`);
    printCheckResult(errors, warnings);
    process.exit(1);
  }

  const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf-8'));
  const currentVersion = pkg.version;
  const parsedCurrent = parseSemVer(currentVersion);

  if (!parsedCurrent) {
    errors.push(`根 package.json 版本号 "${currentVersion}" 不符合 SemVer 规范 (MAJOR.MINOR.PATCH)`);
  } else {
    logSuccess(`Master (根 package.json) 版本号合法: ${colors.green}v${currentVersion}${colors.reset}`);
  }

  // ---------- 2. 子应用私有版本号校验（禁止私设版本） ----------
  const subPackages = ['apps/server/package.json', 'apps/web/package.json'];
  for (const sub of subPackages) {
    const subPath = path.resolve(ROOT_DIR, sub);
    if (fs.existsSync(subPath)) {
      const subPkg = JSON.parse(fs.readFileSync(subPath, 'utf-8'));
      if (subPkg.version) {
        errors.push(`${sub} 违规声明了私有 version 字段 ("${subPkg.version}")，必须遵循 Monorepo 统一版本号策略（唯一版本源为根 package.json）`);
      }
    }
  }

  // ---------- 3. Agent 独立版本号校验 (apps/agent/VERSION) ----------
  let currentAgentVersion = null;
  let parsedAgent = null;
  if (!fs.existsSync(AGENT_VERSION_PATH)) {
    errors.push(`未找到 Agent 版本文件: ${AGENT_VERSION_PATH}`);
  } else {
    currentAgentVersion = fs.readFileSync(AGENT_VERSION_PATH, 'utf-8').trim();
    parsedAgent = parseSemVer(currentAgentVersion);
    if (!parsedAgent) {
      errors.push(`apps/agent/VERSION 版本号 "${currentAgentVersion}" 不符合 SemVer 规范 (MAJOR.MINOR.PATCH)`);
    } else {
      logSuccess(`Agent (apps/agent/VERSION) 版本号合法: ${colors.green}v${currentAgentVersion}${colors.reset}`);
    }
  }

  // ---------- 4. Master CHANGELOG.md 结构与一致性校验 ----------
  if (!fs.existsSync(CHANGELOG_PATH)) {
    errors.push(`未找到 CHANGELOG.md`);
  } else {
    const changelog = fs.readFileSync(CHANGELOG_PATH, 'utf-8');

    // 匹配顶部是否有 [Unreleased]
    const hasUnreleased = /^##\s*\[Unreleased\]/m.test(changelog);
    if (!hasUnreleased) {
      warnings.push(`CHANGELOG.md 顶部缺少 ## [Unreleased] 缓冲区（遵循 Keep a Changelog 规范），建议补充`);
    } else {
      logSuccess(`CHANGELOG.md 顶部已配置 [Unreleased] 缓冲区`);
    }

    // 匹配所有具体版本标题 ## [X.Y.Z] - YYYY-MM-DD
    const versionHeaderRegex = /^##\s*\[(\d+\.\d+\.\d+)\](?:\s*-\s*([^\r\n]+))?/gm;
    const matches = [];
    let match;
    while ((match = versionHeaderRegex.exec(changelog)) !== null) {
      matches.push({
        title: match[0],
        version: match[1].trim(),
        date: (match[2] || '').trim(),
        index: match.index,
      });
    }

    if (matches.length === 0) {
      errors.push(`CHANGELOG.md 未找到任何具体版本小节（格式应为 ## [X.Y.Z] - YYYY-MM-DD）`);
    } else {
      const firstConcrete = matches[0];

      if (firstConcrete.version !== currentVersion) {
        errors.push(
          `CHANGELOG.md 首个具体版本小节 [${firstConcrete.version}] 与 package.json 版本 [${currentVersion}] 不一致！` +
          `请保持两者完全同步。`
        );
      } else {
        logSuccess(`CHANGELOG.md 最新定稿版本小节与 package.json 版本一致: ${colors.green}[${firstConcrete.version}]${colors.reset}`);
      }

      // 校验日期格式 YYYY-MM-DD
      if (firstConcrete.date && !/^\d{4}-\d{2}-\d{2}$/.test(firstConcrete.date)) {
        errors.push(`CHANGELOG.md 版本小节 [${firstConcrete.version}] 的日期格式不合法 ("${firstConcrete.date}")，必须为 YYYY-MM-DD`);
      }
    }
  }

  // ---------- 5. Agent apps/agent/CHANGELOG.md 结构与一致性校验 ----------
  if (!fs.existsSync(AGENT_CHANGELOG_PATH)) {
    errors.push(`未找到 Agent 独立更新日志: ${AGENT_CHANGELOG_PATH}`);
  } else {
    const agentChangelog = fs.readFileSync(AGENT_CHANGELOG_PATH, 'utf-8');

    const hasAgentUnreleased = /^##\s*\[Unreleased\]/m.test(agentChangelog);
    if (!hasAgentUnreleased) {
      warnings.push(`apps/agent/CHANGELOG.md 顶部缺少 ## [Unreleased] 缓冲区，建议补充`);
    } else {
      logSuccess(`apps/agent/CHANGELOG.md 顶部已配置 [Unreleased] 缓冲区`);
    }

    const agentHeaderRegex = /^##\s*\[(\d+\.\d+\.\d+)\](?:\s*-\s*([^\r\n]+))?/gm;
    const agentMatches = [];
    let am;
    while ((am = agentHeaderRegex.exec(agentChangelog)) !== null) {
      agentMatches.push({
        title: am[0],
        version: am[1].trim(),
        date: (am[2] || '').trim(),
        index: am.index,
      });
    }

    if (agentMatches.length === 0) {
      errors.push(`apps/agent/CHANGELOG.md 未找到任何具体版本小节（格式应为 ## [X.Y.Z] - YYYY-MM-DD）`);
    } else if (currentAgentVersion) {
      const firstConcrete = agentMatches[0];

      if (firstConcrete.version !== currentAgentVersion) {
        errors.push(
          `apps/agent/CHANGELOG.md 首个具体版本小节 [${firstConcrete.version}] 与 apps/agent/VERSION [${currentAgentVersion}] 不一致！`
        );
      } else {
        logSuccess(`apps/agent/CHANGELOG.md 最新定稿版本小节与 apps/agent/VERSION 一致: ${colors.green}[${firstConcrete.version}]${colors.reset}`);
      }

      if (firstConcrete.date && !/^\d{4}-\d{2}-\d{2}$/.test(firstConcrete.date)) {
        errors.push(`apps/agent/CHANGELOG.md 版本小节 [${firstConcrete.version}] 的日期格式不合法 ("${firstConcrete.date}")，必须为 YYYY-MM-DD`);
      }
    }
  }

  // ---------- 6. README.md 顶部 Version 徽标一致性校验 ----------
  if (!fs.existsSync(README_PATH)) {
    warnings.push(`未找到根目录 README.md`);
  } else {
    const readme = fs.readFileSync(README_PATH, 'utf-8');
    const badgeRegex = /https:\/\/img\.shields\.io\/badge\/version-([^-\s)]+)-blue\.svg/;
    const match = readme.match(badgeRegex);

    if (!match) {
      errors.push(`README.md 未找到 Version 徽标（格式应包含 https://img.shields.io/badge/version-X.Y.Z-blue.svg）`);
    } else {
      const readmeVersion = match[1].trim();
      if (readmeVersion !== currentVersion) {
        errors.push(
          `README.md 顶部的 Version 徽标 [${readmeVersion}] 与 package.json 版本 [${currentVersion}] 不一致！` +
          `请运行 pnpm bump 或手动同步。`
        );
      } else {
        logSuccess(`README.md Version 徽标与 package.json 版本一致: ${colors.green}[${readmeVersion}]${colors.reset}`);
      }
    }
  }

  // ---------- 7. Git 变更与版本 / CHANGELOG 维护约束校验 ----------
  const baseInfo = getGitBaseRef();
  if (baseInfo) {
    const baseRefName = typeof baseInfo === 'object' ? baseInfo.ref : baseInfo;
    const baseVersion = getBasePackageVersion(baseInfo);
    const baseAgentVersion = getBaseAgentVersion(baseInfo);
    const changedFiles = getChangedFiles(baseInfo);

    let isMainBranch = false;
    try {
      const curBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8', cwd: ROOT_DIR }).trim();
      isMainBranch = curBranch === 'main' || curBranch === 'master';
    } catch {
      // ignore
    }

    // 7.1 Master 变更约束
    if (baseVersion && parsedCurrent) {
      const cmp = compareSemVer(currentVersion, baseVersion);
      const masterChanges = changedFiles.filter(file =>
        MASTER_CORE_CODE_PREFIXES.some(prefix => file.startsWith(prefix))
      );

      if (cmp < 0) {
        errors.push(
          `当前分支 Master 版本 (v${currentVersion}) 低于基准分支 ${baseRefName} 的版本 (v${baseVersion})，禁止降级版本！`
        );
      } else if (cmp > 0) {
        logSuccess(
          `Master 发版模式：检测到版本号已递增 ${colors.yellow}v${baseVersion}${colors.reset} → ${colors.green}v${currentVersion}${colors.reset}（对比 ${baseRefName}）`
        );
      } else {
        if (!isMainBranch && masterChanges.length > 0) {
          const hasAdditions = hasChangelogAdditions(baseInfo, 'CHANGELOG.md');
          if (!hasAdditions) {
            errors.push(
              `检测到 Master 核心代码发生变更（${masterChanges.length} 个文件变动，如 ${masterChanges.slice(0, 3).join(', ')}${masterChanges.length > 3 ? ' 等' : ''}），` +
              `但根 CHANGELOG.md 的 [Unreleased] 缓冲区未检测到新增日志记录！\n` +
              `👉 解决方式：请在 CHANGELOG.md 顶部的 ## [Unreleased] 下记录本次变更（按 Added/Changed/Fixed 分类）。`
            );
          } else {
            logSuccess(`检测到 Master 核心代码变更，CHANGELOG.md [Unreleased] 缓冲区已同步维护变更条目（当前版本保持 v${currentVersion}）`);
          }
        }
      }
    }

    // 7.2 Agent 变更约束
    if (currentAgentVersion && parsedAgent) {
      const agentChanges = changedFiles.filter(file =>
        AGENT_CORE_CODE_PREFIXES.some(prefix => file.startsWith(prefix)) &&
        file !== 'apps/agent/VERSION' &&
        file !== 'apps/agent/CHANGELOG.md'
      );

      if (baseAgentVersion) {
        const agentCmp = compareSemVer(currentAgentVersion, baseAgentVersion);
        if (agentCmp < 0) {
          errors.push(
            `当前分支 Agent 版本 (v${currentAgentVersion}) 低于基准分支 ${baseRefName} 的版本 (v${baseAgentVersion})，禁止降级！`
          );
        } else if (agentCmp > 0) {
          logSuccess(
            `Agent 发版模式：检测到 Agent 版本已递增 ${colors.yellow}v${baseAgentVersion}${colors.reset} → ${colors.green}v${currentAgentVersion}${colors.reset}（对比 ${baseRefName}）`
          );
        } else {
          if (!isMainBranch && agentChanges.length > 0) {
            const hasAgentAdditions = hasChangelogAdditions(baseInfo, 'apps/agent/CHANGELOG.md');
            if (!hasAgentAdditions) {
              errors.push(
                `检测到 Agent 核心代码发生变更（${agentChanges.length} 个文件变动，如 ${agentChanges.slice(0, 3).join(', ')}${agentChanges.length > 3 ? ' 等' : ''}），` +
                `但 apps/agent/CHANGELOG.md 的 [Unreleased] 缓冲区未检测到新增日志记录！\n` +
                `👉 解决方式：请在 apps/agent/CHANGELOG.md 顶部的 ## [Unreleased] 下记录本次变更（按 Added/Changed/Fixed 分类）。`
              );
            } else {
              logSuccess(`检测到 Agent 核心代码变更，apps/agent/CHANGELOG.md [Unreleased] 缓冲区已同步维护变更条目（当前版本保持 v${currentAgentVersion}）`);
            }
          }
        }
      } else {
        // 基准分支尚无 apps/agent/VERSION（架构分水岭初次落地）
        if (!isMainBranch && agentChanges.length > 0) {
          const hasAgentAdditions = hasChangelogAdditions(baseInfo, 'apps/agent/CHANGELOG.md');
          if (hasAgentAdditions) {
            logSuccess(`Agent 独立版本与更新日志初始化生效（基线版本: v${currentAgentVersion}）`);
          }
        }
      }
    }
  } else {
    logInfo(`未检测到可比对的 git 基准分支（可能为独立初始提交或浅克隆），已跳过分支版本差分校验`);
  }

  printCheckResult(errors, warnings);

  if (errors.length > 0) {
    process.exit(1);
  }
}

function printCheckResult(errors, warnings) {
  console.log('');
  if (warnings.length > 0) {
    console.log(`${colors.yellow}${colors.bold}⚠️  警告事项：${colors.reset}`);
    for (const w of warnings) {
      console.log(`  ${colors.yellow}• ${w}${colors.reset}`);
    }
    console.log('');
  }

  if (errors.length > 0) {
    console.log(`${colors.red}${colors.bold}❌ 门禁未通过，发现以下 ${errors.length} 项违规：${colors.reset}`);
    for (const e of errors) {
      console.log(`  ${colors.red}• ${e}${colors.reset}`);
    }
    console.log('');
  } else {
    console.log(`${colors.green}${colors.bold}✨ 版本管理与 CHANGELOG 门禁校验全部通过！${colors.reset}\n`);
  }
}

// ---------- CLI 入口 ----------
const command = process.argv[2] || 'check';
const args = process.argv.slice(3);

if (command === 'bump') {
  cmdBump(args);
} else if (command === 'bump-agent' || command === 'bump:agent') {
  cmdBumpAgent(args);
} else if (command === 'check') {
  cmdCheck();
} else {
  console.log(`
${colors.bold}RiriCloud 版本管理与门禁工具${colors.reset}

用法：
  pnpm bump [patch|minor|major|<version>]         将 Master [Unreleased] 转化为定稿版本小节并更新 package.json 与 README.md
  pnpm bump:agent [patch|minor|major|<version>]   将 Agent [Unreleased] 转化为定稿版本小节并更新 apps/agent/VERSION
  pnpm gate:version                               校验当前分支 Master 与 Agent 版本号、CHANGELOG 格式与 [Unreleased] 维护约束
`);
  process.exit(1);
}

