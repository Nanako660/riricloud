---
title: "binary-distribution-optimization"
type: plan
status: active
target_version: "v0.8.12"
created_at: "2026-09-14"
author: "Antigravity & Maintainers"
---

# binary-distribution-optimization

## 🎯 目标与背景

**问题**（来自 0.8.11 实机联调与管理员反馈）：
1. 版本口径混乱：Agent 心跳上报纯编译版本 `0.7.3`，资源中心/升级任务目标是 `0.7.3-r1`（`versionOf()` 无条件拼 `-rN`），升级版本对账严格相等比较产生误报"重启可能失败"。
2. 创建节点生成安装命令不校验主控是否提供对应平台二进制（主控缺文件时 curl 404 直接失败，UI 无预警）。
3. 安装下载单点：安装命令只 curl 主控裸二进制，无回退、无镜像加速。

**方案（已确认决策）**：
- 版本口径：对账比较前归一化（剥 `-r<数字>` 后缀）+ Agent 类资源 revision=1 时展示不带 `-rN`。
- 安装默认优先从项目 GitHub Release（`agent-v<A.B.C>` Tag，`riri-agent_<ver>_<os>_<arch>.tar.gz` + `checksums.txt`）下载，回退主控提供。
- 内置默认 GitHub 镜像列表（前缀代理，系统设置可改），安装时对"直连+镜像"Range GET 测速选最快源。
- 安装命令改为拉取主控渲染的安装脚本（POSIX sh + PowerShell 双模板，逻辑在仓库内版本化）。
- 旧版 Agent 兼容：镜像经 env `GITHUB_MIRRORS` 注入，不用新 CLI flag。

**明确范围外**：升级任务分发仍走主控 URL；免安装（portable）与 Docker 安装形态不变；`mirror.go` 与 doctor 不涉及。

---

## 📋 里程碑与任务清单

### 里程碑 1：版本口径治理（PR #151）
- [x] 任务 1.1: `versionOf()` 增加 kind 维度（AGENT revision=1 不拼 `-rN`），同步 serializeRelease/resolveForNode/审计与 `binaries.service`/`listTasks`/部署历史回退
- [x] 任务 1.2: 对账 `normalizeVersion()` 归一化（reconcile + onModuleInit 水合）与 spec 用例（`0.7.3-r1` vs `0.7.3`）

### 里程碑 2：镜像与仓库设置（PR #152）
- [x] 任务 2.1: 设置键 `githubRepoUrl` / `githubMirrorUrls`（内置默认列表，五处 + DTO）
- [x] 任务 2.2: 设置页 agent tab 镜像列表编辑 UI

### 里程碑 3：主控渲染安装脚本与安装命令改造（PR #153、实机冒烟修复 #156）
- [x] 任务 3.1: `downloads/agent-installer.sh|.ps1` 端点（Token 鉴权 + UA 平台解析）与 TS 模板渲染器（版本/镜像/仓库/回退 sha 注入）
- [x] 任务 3.2: 脚本逻辑：测速（128KB Range GET）→ 下载 + checksums.txt 校验 → 解压安装 → 主控兜底
- [x] 任务 3.3: native 安装命令改造为拉取脚本执行（portable/Docker 不动）
- [x] 任务 3.4: 渲染器单测 + WSL 实机联调（测速/回退/校验日志）

### 里程碑 4：Agent 内核下载镜像支持（PR #154）
- [x] 任务 4.1: config `githubMirrors`（yaml + env `GITHUB_MIRRORS` + flag）与 install 持久化
- [x] 任务 4.2: `kernel.go` GitHub 分支直连/镜像顺序回退 + 单测

### 里程碑 5：创建/安装平台可用性校验（PR #155）
- [x] 任务 5.1: `install-commands-picker` 与 `node-form-dialog` 接入 binaryInfo，平台缺失警示（不阻断）

### 里程碑 6：文档与质量门禁
- [x] 任务 6.1: 同步 DEPLOYMENT_GUIDE / API_AND_PROTOCOLS / DATA_MODELS / FRONTEND_UI_GUIDELINES 与双 CHANGELOG
- [x] 任务 6.2: `pnpm gate` 全绿，逐 PR 合入 main
- [x] 任务 6.3: 100% 后 `pnpm plan:archive` 归档

---

## 🧪 验收标准与测试记录

- [x] Agent 资源升级后对账不再误报（`-r1` 目标 vs 纯版本心跳 → 确认 INFO）；revision=1 的 Agent 资源展示无 `-r1`
- [x] 主控缺平台二进制时安装仍可完成（GitHub → 镜像 → 主控三级回退，测速日志可见），UI 提前警示
- [x] 镜像测速生效（直连失败被剔除选最快镜像）；checksums.txt 校验生效
- [x] 旧版 Agent 二进制在 env 镜像注入下安装不受影响
- [x] `pnpm gate` 五门禁全绿
