---
title: "agent-embedded-singbox"
type: plan
status: completed
target_version: v0.8.12
created_at: "2026-09-14"
author: "Antigravity & Maintainers"
archived_at: "2026-09-14"
---
# agent-embedded-singbox

## 🎯 目标与背景

当前 RiriCloud 体系中，Agent（主控管理守护进程）与 Sing-box（代理数据面内核）作为两个相互独立的实体分别构建、分发与升级。
存在痛点：
1. **安装链路冗余**：VPS 节点下载 Agent 后，Agent 启动必须向 Master 或 GitHub 发起二次请求下载 Sing-box，网络受限时极易安装失败。
2. **升级运维割裂**：管理员在后台需要维护两套资源版本与升级任务，双生命周期增加运维对账负担。

**目标**：
在保持 **Agent 管理面与 Sing-box 数据面进程隔离** 的前提下，实现 **单二进制交付** 与 **统一生命周期管理**：
- 构建期将定制编译的 Sing-box 内核（以及 Linux 下的 `libcronet.so`）以 Gzip 归档形式通过 `//go:embed` 嵌入 Agent 二进制（体积仅 ~25MB）；
- Agent 启动时自动校验落盘文件 SHA-256，缺失、损坏或 Agent 升级后自动自愈解压覆盖，随后以独立子进程托管拉起；
- 主控端与 Web 面板彻底做减法，升级交互收敛为统一的「Agent 升级」单动作；
- 数据库结构平滑向前兼容，避免破坏性迁移。

---

## 📋 里程碑与任务清单

### 里程碑 1：Agent 内嵌资源包与内核解压自愈（`apps/agent`）
- [x] 任务 1.1: 新建 `apps/agent/internal/embedded/` 包，支持 `//go:embed assets/singbox.tar.gz` 与 `Ensure(dataDir, expectedSHA)` 解压、权限赋予与校验自愈；
- [x] 任务 1.2: 添加占位用 `assets/singbox.tar.gz` 与 `embedded_test.go` 单测，确保日常开发与门禁无需编译内核即可通过；
- [x] 任务 1.3: 重构 `apps/agent/internal/kernel/kernel.go` 与 `install.go`，切换为从内嵌自愈释放，保留 `SINGBOX_BIN_PATH` 环境变量覆写。

### 里程碑 2：构建流水线与脚本改造（`scripts/`）
- [x] 任务 2.1: 改造 `scripts/build-binaries.sh`：调整时序为先准备定制 Sing-box（及 `libcronet.so`），打包为 gzip 注入 embed 目录再编译 Agent；
- [x] 任务 2.2: 适配 `scripts/bundle-master.sh` 与 `scripts/release.sh`，Master 发行包直接包含内嵌内核的 Agent。

### 里程碑 3：主控服务端升级服务收敛（`apps/server`）
- [x] 任务 3.1: 调整 `UpgradeNodeDto`：`target` 字段支持缺省并默认为 `'agent'`，向前兼容旧请求；
- [x] 任务 3.2: 调整 `NodesService.requestUpgrade`：默认目标锁定为 Agent，精简升级任务 payload；
- [x] 任务 3.3: 调整 `BinariesInstallerService`：安装脚本日志与文案同步，提示单二进制全能安装。

### 里程碑 4：Web 前端升级弹窗简化（`apps/web`）
- [x] 任务 4.1: 重构 `upgrade-node-dialog.tsx`：移除「升级目标」切换下拉框，收敛为统一的「Agent 升级」，增加内嵌说明提示；
- [x] 任务 4.2: 资源版本列表仅筛选 `kind === 'AGENT'`，优化交互体验。

### 里程碑 5：文档同步、质量门禁与归档
- [x] 任务 5.1: 同步更新 `docs/ARCHITECTURE.md`、`docs/DEPLOYMENT_GUIDE.md` 与 `CHANGELOG.md`；
- [x] 任务 5.2: 运行 `pnpm gate`（五合一全绿），使用 `pnpm plan:archive` 完成归档。

---

## 🧪 验收标准与测试记录

- [x] `apps/agent` 单元测试通过，`embedded` 包正确处理创建、解压、校验与覆盖自愈；
- [x] `scripts/gate-agent.sh` 通过，不破坏现有 Agent 门禁；
- [x] `pnpm gate:server` 与 `pnpm gate:web` 通过；
- [x] `bash scripts/build-binaries.sh --agent-only` 构建出的二进制能正确自解压出 `sing-box` 并正常拉起；
- [x] `pnpm gate` 五门禁全绿。
