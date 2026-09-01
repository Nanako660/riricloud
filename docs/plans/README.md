# 规划与任务台账 (Plans & Archival Ledger)

本文档是 **RiriCloud** 项目全部中短期任务规划、架构改造清单与历史实施记录的总台账。

---

## 📌 规划管理生命周期与机械约束

1. **新建规划**：通过 `pnpm plan:new <name>` 在 `docs/plans/` 下创建标准模板，并在本文档进行中表格登记。
2. **执行推进**：在对应 `docs/plans/<name>.md` 中维护任务勾选框（`- [ ]` -> `- [x]`）。
3. **完成归档（机械硬约束）**：
   - 门禁脚本 `pnpm gate:docs` 将扫描进行中文档：**若某文档内所有任务项均已勾选（100% `[x]` 且无 `[ ]`），门禁将直接阻断报错**，强制要求归档。
   - 执行 `pnpm plan:archive <filename>` 一键自动打上归档时间戳、更改状态为 `completed`、追加 `YYYY-MM-DD-` 前缀移入 `docs/plans/archive/`，并自动刷新本文档台账。
4. **根目录保护**：禁止在 `docs/` 根目录随意堆放散乱的 TODO / 计划文件，所有计划类文档必须收敛至本目录。

---

## 🚀 进行中规划 (Active Plans)

| 规划名称 | 目标版本 | 创建日期 | 任务进度 |
| :--- | :--- | :--- | :--- |
| [Agent 现代化交互式 CLI 与全生命周期管理架构（破坏性重构）](./agent-interactive-cli-architecture.md) | `v0.4.0` | 2026-09-01 | 0/29 (0%) |

---

## 📦 历史归档规划 (Archived Plans)

| 归档规划名称 | 达成版本 | 归档日期 | 关联 PR / 提交 |
| :--- | :--- | :--- | :--- |
| [v0.3.0 订阅架构与极简 Agent 远程升级重构](./archive/2026-08-31-v0.3.0-architecture-refactor.md) | `v0.3.0` | 2026-08-31 | PR #3 (squash commit 2c87b14) |
| [部署打包实施方案（Release 二进制分发 + 本地 Docker 分发）](./archive/2026-08-31-packaging-and-deployment.md) | `v0.4.0` | 2026-08-31 | — |
| [节点与线路解耦、链式代理中继与主控本机节点架构重构](./archive/2026-08-31-node-line-separation-and-relay.md) | `v0.4.0` | 2026-08-31 | — |
| [node-detail-ops-and-master-upgrades](./archive/2026-08-31-node-detail-ops-and-master-upgrades.md) | `v0.3.0` | 2026-08-31 | — |
| [Master 内置本机 Agent](./archive/2026-08-31-master-embedded-agent.md) | `v0.4.0` | 2026-08-31 | — |
| [恢复线路管理完整可视化编辑](./archive/2026-08-31-line-visual-editor-restoration.md) | `v0.4.0` | 2026-08-31 | — |
| [线路顶层编排与出入站生命周期重构 (Line-Centric Pipeline Architecture)](./archive/2026-08-31-line-centric-pipeline.md) | `v0.4.0` | 2026-08-31 | — |
| [agent-dual-mode-communication](./archive/2026-08-31-agent-dual-mode-communication.md) | `v0.3.0` | 2026-08-31 | — |
| [完善 Master 管理员初始化流程](./archive/2026-08-31-admin-bootstrap.md) | `—` | 2026-08-31 | — |
