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
| [流量账务与 SQLite 写入链路优化](./traffic-accounting-sqlite-optimization.md) | `0.5.0` | 2026-09-03 | 19/20 (95%) |

---

## 📦 历史归档规划 (Archived Plans)

| 归档规划名称 | 达成版本 | 归档日期 | 关联 PR / 提交 |
| :--- | :--- | :--- | :--- |
| [全栈可视化日志管理系统 (System Log Management)](./archive/2026-09-06-system-log-management.md) | `v0.6.11` | 2026-09-06 | — |
| [用户系统完善：随机数字 UID、自定义昵称、换绑邮箱、SMTP 邮箱验证与双模式人机验证](./archive/2026-09-05-user-system-enhancement.md) | `v0.6.11` | 2026-09-05 | — |
| [系统设置梳理与全链路统一时区支持](./archive/2026-09-05-system-settings-timezone.md) | `v0.6.8` | 2026-09-05 | — |
| [中转线路与单节点多线路流量统计归属根除修复](./archive/2026-09-05-root-cause-relay-and-multi-line-traffic-fix.md) | `0.6.6` | 2026-09-05 | — |
| [重构线路端点拓扑：引入 Entry-Landing 架构并废除 exitPort](./archive/2026-09-05-line-topology-landing-refactor.md) | `v0.5.0` | 2026-09-05 | — |
| [线路测速功能（端到端测速、自动定时检测与延迟 Chip 标签展示）](./archive/2026-09-05-line-speedtest.md) | `0.5.0` | 2026-09-05 | — |
| [管理端流量统计大盘新增用户侧统计与排行](./archive/2026-09-05-admin-traffic-user-statistics.md) | `v0.6.10` | 2026-09-05 | — |
| [订阅流量周期重置与用户额外线路](./archive/2026-09-04-subscription-traffic-reset-extra-lines.md) | `0.5.0` | 2026-09-04 | — |
| [订阅模板全链路闭环优化与现代化工作台](./archive/2026-09-04-subscription-template-full-refactor.md) | `0.6.2` | 2026-09-04 | — |
| [中转线路流量统计归属与倍率计费重构](./archive/2026-09-04-relay-traffic-accounting.md) | `0.6.2` | 2026-09-04 | — |
| [中继线路复用已有落地线路（异构协议桥接）](./archive/2026-09-04-relay-target-line-bridge.md) | `0.5.0` | 2026-09-04 | — |
| [用户系统完善：货币系统、个人中心、卡密充值与订阅交易闭环](./archive/2026-09-03-user-currency-and-profile.md) | `v0.4.20` | 2026-09-03 | — |
| [下线仪表盘并将能力全量合并至我的订阅](./archive/2026-09-03-merge-dashboard-into-subscription.md) | `v0.4.x` | 2026-09-03 | — |
| [二进制资源中心与 Sing-box 版本解耦](./archive/2026-09-03-binary-resource-center.md) | `v0.5.0` | 2026-09-03 | — |
| [RiriCloud 全站移动端适配](./archive/2026-09-02-web-mobile-adaptation.md) | `v0.4.15` | 2026-09-01 | — |
| [Nginx 反向代理与订阅伪静态链接](./archive/2026-09-02-nginx-subscription-short-link.md) | `0.4.x` | 2026-09-02 | — |
| [管理端线路流量大盘与单用户流量统计](./archive/2026-09-02-admin-traffic-dashboard-and-user-statistics.md) | `v0.4.16` | 2026-09-02 | — |
| [系统设置全参数可配置化与现代化管理面板](./archive/2026-09-01-system-settings-full-config.md) | `v0.4.8` | 2026-09-01 | — |
| [开发脚本整理与 Docker WSL 约束](./archive/2026-09-01-dev-scripts.md) | `脚本治理` | 2026-09-01 | — |
| [证书管理中心与 Docker 本地持久化路径改造](./archive/2026-09-01-certificate-management-and-docker-persistence.md) | `v0.4.15` | 2026-09-01 | — |
| [Agent 现代化交互式 CLI 与全生命周期管理架构（破坏性重构）](./archive/2026-09-01-agent-interactive-cli-architecture.md) | `v0.4.1` | 2026-09-01 | — |
| [v0.3.0 订阅架构与极简 Agent 远程升级重构](./archive/2026-08-31-v0.3.0-architecture-refactor.md) | `v0.3.0` | 2026-08-31 | PR #3 (squash commit 2c87b14) |
| [部署打包实施方案（Release 二进制分发 + 本地 Docker 分发）](./archive/2026-08-31-packaging-and-deployment.md) | `v0.4.0` | 2026-08-31 | — |
| [节点与线路解耦、链式代理中继与主控本机节点架构重构](./archive/2026-08-31-node-line-separation-and-relay.md) | `v0.4.0` | 2026-08-31 | — |
| [node-detail-ops-and-master-upgrades](./archive/2026-08-31-node-detail-ops-and-master-upgrades.md) | `v0.3.0` | 2026-08-31 | — |
| [Master 内置本机 Agent](./archive/2026-08-31-master-embedded-agent.md) | `v0.4.0` | 2026-08-31 | — |
| [恢复线路管理完整可视化编辑](./archive/2026-08-31-line-visual-editor-restoration.md) | `v0.4.0` | 2026-08-31 | — |
| [线路顶层编排与出入站生命周期重构 (Line-Centric Pipeline Architecture)](./archive/2026-08-31-line-centric-pipeline.md) | `v0.4.0` | 2026-08-31 | — |
| [agent-dual-mode-communication](./archive/2026-08-31-agent-dual-mode-communication.md) | `v0.3.0` | 2026-08-31 | — |
| [完善 Master 管理员初始化流程](./archive/2026-08-31-admin-bootstrap.md) | `—` | 2026-08-31 | — |
