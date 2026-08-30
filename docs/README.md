# RiriCloud 项目设计与实施文档

欢迎查阅 **RiriCloud 多节点 VPN/代理管理系统** 的官方设计与技术实施文档库。

---

## 📑 文档导航

| 文档名称 | 描述 |
| :--- | :--- |
| [系统架构设计 (ARCHITECTURE.md)](./ARCHITECTURE.md) | 总体拓扑、Master-Agent 分布式架构、安全模型与通信全景 |
| [技术选型全景 (TECH_STACK.md)](./TECH_STACK.md) | 前端 (React)、主控后端 (NestJS)、边缘守护程序 (Go Agent)、代理内核 (Sing-box) 技术选型细节与对比 |
| [数据模型设计 (DATA_MODELS.md)](./DATA_MODELS.md) | SQLite + Prisma ORM 实体关系、数据字典与索引设计 |
| [接口与通信协议 (API_AND_PROTOCOLS.md)](./API_AND_PROTOCOLS.md) | RESTful API 规范、WebSocket 主从双向通信协议、多客户端通用订阅引擎标准 |
| [前端 UI 设计规范 (FRONTEND_UI_GUIDELINES.md)](./FRONTEND_UI_GUIDELINES.md) | shadcn/ui 组件分层、暗黑模式预设与表格/表单规范 |
| [部署与运维指南 (DEPLOYMENT_GUIDE.md)](./DEPLOYMENT_GUIDE.md) | 主控面板部署、Go Agent 守护进程一键安装 (systemd / Docker) 与运维排错 |
| [阶段实施路线图 (ROADMAP.md)](./ROADMAP.md) | 迭代里程碑、模块开发步骤与质量验收清单 |
| [规划与任务台账 (plans/README.md)](./plans/README.md) | 中短期实施计划、细粒度 TODO、进行中任务与历史归档总台账（含机械约束） |
| [版本管理规范 (VERSIONING.md)](./VERSIONING.md) | SemVer 最小递增原则、Monorepo 统一版本号、Tag 与发布流程 |
| [Git 版本管理规范 (GIT_WORKFLOW.md)](./GIT_WORKFLOW.md) | GitHub Flow 分支模型、Conventional Commits 提交规范与合并策略 |
| [代码审查与架构约束 (CODE_REVIEW.md)](./CODE_REVIEW.md) | 质量门禁、NestJS / React / Go 分层硬约束与审查清单 |
| [项目全局硬约束 (PROJECT_CONSTRAINTS.md)](./PROJECT_CONSTRAINTS.md) | 技术栈锁定、零外部依赖、资源与安全红线、文档同步约束 |

仓库根目录另有 [README.md](../README.md)（项目主文档）、[AGENTS.md](../AGENTS.md)（AI 代理与协作者的入口规范）与 [CHANGELOG.md](../CHANGELOG.md)（变更日志）。

---

## 🎯 核心设计目标

1. **分布式主从纳管**：单一 Web 控制面板，轻松纳管全球任意机房的多台 VPS 代理节点。
2. **轻量与零额外依赖**：主控端使用 SQLite（WAL 模式）+ Prisma，节点端使用 Go 单静态二进制 + Sing-box，无重型中间件包袱。
3. **实时双向联动**：基于 WebSocket (WSS) 全双工长连接，配置变更毫秒级下发，节点健康度与流量消耗实时上报。
4. **全能通用订阅**：一套接口无缝输出 Clash Meta (Mihomo)、Sing-box Client JSON 以及通用 Base64/URI 链接。
