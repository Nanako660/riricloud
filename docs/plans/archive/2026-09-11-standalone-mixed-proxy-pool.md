---
title: "独立 Mixed (SOCKS5/HTTP) 直连代理池机制"
type: plan
status: completed
target_version: v0.9.0
created_at: "2026-09-11"
author: "Antigravity & Maintainers"
archived_at: "2026-09-11"
---
# 独立 Mixed (SOCKS5/HTTP) 直连代理池机制

## 🎯 目标与背景

当前 RiriCloud 核心订阅主要面向 Clash Meta、Sing-box 等富规则代理客户端，采用 VLESS、Trojan、Hysteria2 等抗封锁加密协议。然而，在自动化爬虫、数据采集、指纹浏览器多开（AdsPower / Hubstudio 等）、海外社媒运营及脚本工具场景下，用户与自动化系统往往需要标准的、可直接配置的工业通用代理（SOCKS5 与 HTTP CONNECT），且需要灵活的凭证隔离、来源 IP 白名单防盗刷及标准的纯文本导出格式。

本规划将 SOCKS / HTTP 代理能力彻底从“客户端翻墙订阅”体系中解耦分离，基于 Sing-box 的 `mixed` 双协议入站构建一套**独立的商业级直连代理池服务（Direct Proxy Pool）**。

---

## 🔒 已冻结的产品决策与技术架构

1. **业务定位与双轨解耦**：
   - 彻底将面向客户端的科学上网订阅（Clash/Sing-box）与面向自动化环境的直连代理池解耦。
   - 直连代理池提供标准的 `socks5://user:pass@host:port` 与 `http://user:pass@host:port` 直连能力。
2. **专属凭证 (Proxy Key) + 来源 IP 白名单**：
   - 不向自动化环境暴露用户主登录密码、UUID 或敏感订阅 Token。
   - 采用独立凭据模型 `ProxyKey`：用户可创建多个凭证（如用于不同爬虫项目或指纹浏览器环境），每个 Key 拥有独立的高熵用户名 (`pk_xxxx`) 与密码，并可选绑定来源 IP/CIDR 白名单。
3. **Mixed 单端口协议 (SOCKS5 + HTTP)**：
   - 边缘节点暴露 Sing-box `mixed` 入站，单端口同时承接 SOCKS5 与 HTTP CONNECT 请求，避免多端口分裂与防火墙配置复杂度。
   - 默认标准 TCP 明文监听以保证原生工具 100% 兼容；支持按需挂载系统证书中心的一键 TLS 证书。
4. **共享主账户流量与配额**：
   - Proxy Key 产生的流量直接统一累计至用户的主账户 `trafficUsedBytes` 中，共享套餐配额与余额结算体系。超额自动熔断下发，无需维护双重计费包。
5. **交付与导出**：
   - 用户中心新增独立页面 `/user/proxy-pool`（直连代理池）。
   - 提供工业标准多格式导出：`IP:Port:User:Pass` 纯文本列表、URI 列表、多语言代码片段（Python `requests`/`Playwright`、cURL、Node.js），以及基于 Token 的免登录 RESTful 动态拉取端点。

---

## 📋 里程碑与详细任务清单

### 里程碑 1：数据模型与持久化层 (Prisma & SQLite)
- [x] 任务 1.1: 在 `apps/server/prisma/schema.prisma` 中新增 `ProxyKey` 模型，包含 `id`、`userId`、`name`、`username`（唯一，形如 `pk_xxxx`）、`password`、`whitelistIps`（逗号分隔）、`isActive`、`createdAt`、`updatedAt`，并与 `User` 建立级联关联；额外增加 `exportToken`（免登录拉取令牌）、`trafficUsedBytes` 与 `lastUsedAt`（凭据级用量），并为 `TrafficLog` 增加可空 `proxyKeyId` 归属字段。
- [x] 任务 1.2: 执行 Prisma 迁移与客户端重新生成（`20260910201246_add_proxy_key`），验证 SQLite 外键约束、级联删除与索引性能。
- [x] 任务 1.3: 更新 `docs/DATA_MODELS.md`，同步记录 `ProxyKey` 数据结构、字段字典、约束与 ER 关系说明（新增 §2.8 Schema、§7 字段字典与 ER/生命周期章节）。

### 里程碑 2：服务端代理池业务与 API 接口
- [x] 任务 2.1: 在 `apps/server/src/proxy-pool/` 中创建 `proxy-pool` 模块（`ProxyPoolModule`、`ProxyPoolService`、`UserProxyPoolController`、`AdminProxyPoolController`、DTO 与 `proxy-key.util.ts`）。
- [x] 任务 2.2: 实现用户端 Proxy Key 完整管理逻辑（增删改查、名称备注、一键生成高熵密码、绑定/清空 IP 白名单、单键启停、密码与拉取令牌独立轮换）。
- [x] 任务 2.3: 实现直连代理池节点检索与动态构建服务（筛选 `protocolType=MIXED` 的启用直连线路，解析 `endpointOverrideEnabled` 覆盖或入口节点对外地址与端口）。
- [x] 任务 2.4: 实现多格式导出与自动化拉取接口 (`GET /api/v1/user/proxy-pool/export`)：
  - [x] 纯文本格式：`IP:Port:User:Pass`（支持指纹浏览器一键导入）；
  - [x] URI 格式：`socks5://` 与 `http://` 逐行格式；
  - [x] JSON 格式：提供节点名称、国家地区、延迟快照、协议类型与凭证的完整对象数组；
  - [x] 免登录拉取机制：支持通过 `?token=<exportToken>` 免 Cookie 鉴权拉取（`@Public()` + `@OptionalAuth()`，与登录态二选一），便于第三方爬虫框架定时同步。
- [x] 任务 2.5: 编写服务端单元测试套件（`proxy-key.util.spec.ts`、`proxy-pool.service.spec.ts`），覆盖凭据冲突重试、白名单 CIDR 校验、越权拦截、启停重下发与三种导出格式。

### 里程碑 3：节点入站编排与流量账务链路
- [x] 任务 3.1: 在 `apps/server/src/common/inbound.ts` 中增强 `MIXED` 协议入站生成逻辑，支持注入 `ProxyKey` 凭据数组（`proxyPoolUsers`），并新增 `buildProxyPoolWhitelistRules` 白名单路由规则编译器。
- [x] 任务 3.2: 升级 `AgentGatewayService` 节点配置合成器：在生成节点的 Sing-box 配置时，将有效的 `ProxyKey` 注入 `inbounds[].users` 并强制启用鉴权。（**实现形态调整**：入站认证用户名为冒号安全的裸 `pk_xxxx`，未追加 `::lineId` 复合后缀 —— 原因与证据见下方「⚠️ 实现偏差记录」。）
- [x] 任务 3.3: 适配流量采集与账务结算：在 Agent 心跳回传 V2Ray stats 累计快照时，服务端解析 `pk_xxxx` 映射回对应 `userId`，在同一事务内精确入库 `TrafficLog`（含 `proxyKeyId`）、累加 `ProxyKey.trafficUsedBytes`/`lastUsedAt`，并按线路倍率扣除用户主账户与订阅流量。
- [x] 任务 3.4: 实现超额与停机熔断：当本批次账务触及用户配额或账户被禁用时，触发全局 `config_sync` 重下发，快速吊销凭据。

### 里程碑 4：前端控制台交互与可视化 (React + shadcn/ui)
- [x] 任务 4.1: 在 `apps/web/src/pages/user/proxy-pool/` 增加页面，并在用户侧边栏增设「直连代理」导航项与 `/proxy-pool` 路由。
- [x] 任务 4.2: 开发 Proxy Key 凭据管理列表组件（展示名称、用户名、已用流量、白名单 IP 标签、状态切换、复制与删除二次确认弹窗，含密码掩码切换与轮换操作）。
- [x] 任务 4.3: 开发代理池提取与导出中心组件：
  - [x] 支持按节点端点（地区标签/延迟/在线状态）多选；
  - [x] 支持切换导出协议（SOCKS5 / HTTP）；
  - [x] 一键复制 `IP:Port:User:Pass` 与 URI 列表；
  - [x] 动态生成多语言代码示例（Python `requests`、`Playwright`、Node.js `axios`、Shell `cURL`）；
  - [x] 展示自动化定时拉取 API URL 与一键复制/令牌轮换按钮。
- [x] 任务 4.4: 严格执行前端规范自查（无裸 HTML 交互标签、全量采用 Radix/shadcn 组件、表单草稿遵循 `useFormResetOnKey` 契约、保障深浅色主题无缝切换）。

### 里程碑 5：文档治理、质量门禁与归档准备
- [x] 任务 5.1: 同步更新 `docs/API_AND_PROTOCOLS.md`，完整记录 Proxy Key 管理接口、管理端审计接口与 `/api/v1/user/proxy-pool/export` 接口规约（新增 §1.2/§1.3 条目与 §5 独立章节）。
- [x] 任务 5.2: 同步更新 `docs/ARCHITECTURE.md`，绘制双轨并行的代理池与订阅架构拓扑时序图（新增 §10）。
- [x] 任务 5.3: 更新 `CHANGELOG.md` 顶部的 `## [Unreleased]` 缓冲区，记录本次新增特性、变更与兼容性设计说明。
- [x] 任务 5.4: 执行全量五合一质量门禁自查（`pnpm gate` 校验 version, docs, server, web, agent 全绿）。

---

## 🧪 验收标准与测试记录

- [x] 单元测试覆盖率：`apps/server` 全量 57 suites / 421 tests 通过；新增 `proxy-key.util.spec.ts`、`proxy-pool.service.spec.ts`，并扩充 `inbound.spec.ts`（MIXED 凭据注入与白名单规则）与 `agent-gateway.service.spec.ts`（Mixed 配置合成、凭据账务映射、超额熔断触发）。
- [x] 节点配置验证：生成的 Sing-box 配置文件包含正确的 `type: "mixed"` 单端口入站、`pk_xxxx` 用户列表与白名单 `route.rules`；已用真实内核 `sing-box 1.14.0 check -c` 静态校验通过。
- [x] 工具兼容性验收：在 WSL Debian 中以真实 `sing-box` 内核启动生成的配置，使用 cURL 分别经 `socks5h://` 与 `http://` 成功出网（均返回 200）；错误密码返回 407；白名单外凭据的 SOCKS5 握手失败、HTTP 返回 502（连接被拒绝）。
- [x] 流量核销验收：脚本上报 1 MiB 上传 + 2 MiB 下载的累计快照后，`ProxyKey.trafficUsedBytes`、`User.trafficUsedBytes`、`Subscription.trafficUsedBytes` 均精确增加 3145728 字节，`TrafficLog` 写入 1 条带 `lineId` 与 `proxyKeyId` 的流水。
- [x] 前端视觉与交互验收：`/proxy-pool` 页面一键导出、四语言代码生成、白名单配置与生效逻辑闭环；`tsc --noEmit`、`eslint`、`vite build` 全绿。像素级视觉走查按 `docs/VISUAL_VERIFICATION.md` 约束仅在 Antigravity 环境、收到明确请求后执行（本次未执行）。
- [x] 全量门禁校验：`pnpm gate` 全绿（version / docs / server / web / agent）。

### ⚠️ 实现偏差记录（任务 3.2 / 验收标准 2）

计划原文要求将凭据格式化为 `pk_xxxx::lineId` 复合用户名注入 `inbounds[].users`。实现时发现该形态与计划自身的验收标准（「使用 cURL 与 Python 脚本通过 `socks5://` 和 `http://` 分别成功经由节点出网」）**互相冲突**：

1. Sing-box 的 HTTP CONNECT 认证由 Go `net/http.parseBasicAuth` 完成（见 `protocol/http/handshake.go` 中的 `ParseBasicAuth` linkname），其实现按**首个 `:`** 切分用户名与密码。
2. 通用客户端的 URI userinfo 解析行为一致（curl 解析 `scheme://user:pass@host` 亦按首个 `:` 切分）。

因此只需存在一个冒号，`http://pk_xxxx::lineId:password@host:port` 就会被解析为 username=`pk_xxxx`、password=`::lineId:password`，认证必然失败；`IP:Port:User:Pass` 纯文本导入格式同样无法表达含冒号的用户名。

**实测证据**（同一份配置，仅将用户名替换为复合形态）：

| 场景 | 冒号安全 `pk_xxxx` | 复合 `pk_xxxx::lineId` |
| :--- | :--- | :--- |
| `socks5h://` + 正确密码 | `code=200` | `code=000`（curl 同样按首个冒号切分 userinfo） |
| `http://` + 正确密码 | `code=200` | `code=407`（Basic 认证按首个冒号切分） |

**最终实现**：入站认证用户名使用裸 `pk_xxxx`；线路归属改由节点级活动线路解析（`resolveActiveLineForNode`，取该节点上 `status = ACTIVE` 的首条线路）确定，符合计划已冻结的“单节点单 Mixed 端口”产品设计。`parseTrafficCredential` 的 `::lineId` 复合解析能力予以保留，若后续出现复合凭证仍可正确映射回归属用户。该决策已同步记录于 `docs/API_AND_PROTOCOLS.md §5.1`、`docs/ARCHITECTURE.md §10` 与 `CHANGELOG.md`。
