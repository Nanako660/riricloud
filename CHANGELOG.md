# 更新日志 (Changelog)

本项目的所有显著变更都记录在本文件中。

格式基于 [Keep a Changelog 1.1.0](https://keepachangelog.com/zh-CN/1.1.0/)，
版本管理遵循 [语义化版本 2.0.0](https://semver.org/lang/zh-CN/) 与
[docs/VERSIONING.md](docs/VERSIONING.md)（最小递增原则、统一版本号、Tag 与本文件一一对应）。

变更类型说明：`Added` 新增 · `Changed` 变更 · `Fixed` 修复 · `Removed` 移除 · `Security` 安全 · `Deprecated` 弃用。
约定：功能/修复合入 main 时在 `[Unreleased]` 追加条目；发布时整理为版本小节并打 `vX.Y.Z` Tag。

## [Unreleased]

### Added

- 建立项目设计文档库：系统架构、技术选型、数据模型、接口与通信协议、部署运维指南、阶段实施路线图。
- 建立工程治理规范：版本管理规范（SemVer 最小递增 + Monorepo 统一版本号）、Git 版本管理规范（GitHub Flow + Conventional Commits 中英混合格式）、代码审查与架构约束（质量门禁 + NestJS/React/Go 分层硬约束 + 审查清单）、项目全局硬约束（技术栈锁定、零外部依赖、资源与安全红线、文档同步约束）。
- 建立前端 UI 设计与组件规范：`docs/FRONTEND_UI_GUIDELINES.md`（shadcn/ui New York 风格预设、Zinc 灰色系与暗黑模式、组件分层、禁止裸写原生 HTML 交互标签、React Hook Form + Zod 表单校验、Sonner 与 AlertDialog 交互反馈、TanStack Table 与 Recharts 图表规范）。
- 建立 AI 代理工作规范 `AGENTS.md`（按任务类型的必读文档索引、硬性规则摘要、变更-文档同步映射表）。
