---
title: "agent-dual-mode-communication"
type: plan
status: completed
target_version: v0.3.0
created_at: "2026-08-31"
author: "Antigravity & Maintainers"
archived_at: "2026-08-31"
---
# Agent WS / HTTP 轮询双通信模式架构落地规划

## 🎯 目标与背景

随着节点部署场景的多样化（例如企业内网、严苛 CDN / WAF 防护环境、以及主控端完全无状态化托管），长连接 WebSocket 可能会面临中间网关断连或不支持 WS 升级的情况。

本特性的目标是在保留现有 **WebSocket (WS/WSS) 秒级实时长连接** 的同时，新增一套标准的 **HTTP/HTTPS 定时主动轮询（Pull/Report 模式）** 通信架构，实现：
1. **两种通信方式并存、按需可选**：每台节点可自由选择通过 WSS 长连接还是 HTTP 轮询连接 Master；
2. **Master 端业务单一真相源**：提取统一的 `AgentService`，WS 网关与 HTTP 控制器均作为无业务的薄传输适配器；
3. **Agent 智能协议自推导**：通过 `MASTER_URL` 协议前缀（`ws://` vs `http://`）或 `AGENT_MODE` 自动切换通信引擎；
4. **控制台体验无缝融合**：节点状态清晰展示通信模式徽章，安装向导提供双模式一键命令。

---

## 📋 里程碑与任务清单

### 里程碑 1：Master 服务端架构解耦与 HTTP 轮询端点实现
- [x] **任务 1.1: 业务层提炼为统一的 `AgentService`**
  - 将配置生成与版本比对（`buildConfigSync`）、遥测指标入库、流量结算、异步任务分发与结果处理抽离为统一服务；
- [x] **任务 1.2: 实现单一合一轮询端点 `POST /api/v1/agent/poll`**
  - 支持 `X-Agent-Token` 请求头鉴权；
  - 请求体（上行）：CPU/内存/带宽、内核存活状态、当前配置版本、最近错误、任务执行回执；
  - 响应体（下行）：`needUpdate`、目标 `version`、目标 `singboxConfig`、待执行任务队列、推荐 `nextPollSecs`；
- [x] **任务 1.3: 现有 `AgentGateway` (WS) 适配器重构**
  - 移除网关内的重复业务逻辑，100% 委托给 `AgentService`；
- [x] **任务 1.4: 统一双模式在离线滑动窗口健康探测器**
  - WSS 节点：连接断开且超过 15s 无重连标记为 `OFFLINE`；
  - HTTP 节点：超过 $3 \times \text{PollInterval}$（约 45s）无上报标记为 `OFFLINE`；
- [x] **任务 1.5: 服务端单元测试与质量验证**
  - 编写 HTTP 轮询鉴权、配置增量下发、异步任务队列与离线判定单元测试。

---

### 里程碑 2：Agent 客户端双模式通信与自适应状态机实现
- [x] **任务 2.1: Agent 配置层升级 (`internal/config`)**
  - 支持 `MASTER_URL`（支持 `ws(s)://` 与 `http(s)://` 协议自推导）；
  - 支持 `AGENT_MODE=ws|http`（或命令行参数 `--mode`）显式指定；
  - 支持 `POLL_INTERVAL_SECS`（默认 15s），向后兼容 `MASTER_WS_URL`；
- [x] **任务 2.2: 实现 HTTP 轮询客户端模块 (`internal/poll`)**
  - 周期性定时上报遥测与内核运行状态；
  - 接收配置响应，联动 `singbox.Manager` 执行预检与优雅热重启；
  - 接收并异步执行网络探针（`probe`）与远程升级（`upgrade`）任务并在下次轮询提交回执；
  - 支持服务端动态 `nextPollSecs` 调步协商；
- [x] **任务 2.3: `main.go` 通信模式统一调度与无孤儿优雅退出**
  - 根据配置启动 WS 客户端或 HTTP 轮询客户端，统一受根 Context 信号控制；
- [x] **任务 2.4: Agent 单元测试覆盖**
  - 针对 `config`、`poll` 客户端及双模式切换编写单元测试。

---

### 里程碑 3：Web 控制台节点状态呈现与安装向导升级
- [x] **任务 3.1: 节点列表与详情页展示通信模式徽章**
  - 渲染 `WS 在线` / `HTTP 轮询` / `离线` 语义徽章与最后上报时间戳；
- [x] **任务 3.2: 节点一键安装向导组件升级**
  - 提供 WS 模式（默认推荐）与 HTTP 模式两种一键 Shell 安装命令切换；
- [x] **任务 3.3: 异步交互任务（探针 / 升级）在 HTTP 模式下的前端轮询等待体验**
  - 前端发起探针/升级后展示加载/进度态，轮询任务执行结果。

---

### 里程碑 4：全链路联调、文档治理与质量门禁
- [x] **任务 4.1: 同步更新系统设计文档与 CHANGELOG**
  - 更新 `docs/ARCHITECTURE.md`（双模式通信拓扑时序图）；
  - 更新 `docs/API_AND_PROTOCOLS.md`（补充 HTTP 轮询接口契约）；
  - 更新 `docs/DEPLOYMENT_GUIDE.md`（补充 HTTP 模式部署说明与配置参数）；
  - 登记 `CHANGELOG.md` 的 `[Unreleased]` 小节；
- [x] **任务 4.2: 运行端到端联调测试**
  - 验证 WS 模式节点与 HTTP 轮询模式节点混合纳管与配置下发；
- [x] **任务 4.3: 四端质量门禁全绿**。
  - `pnpm gate` 的文档、服务端与 Web 阶段通过；Go 阶段因本机 `bash` 解析为无发行版的 WSL 启动器未能由包装脚本执行，已使用项目内 `.tools/go` 完成等价 `vet / gofmt / test / build` 检查。

---

## 🧪 验收标准与测试记录

- [x] 服务端单元测试 100% 通过（`pnpm gate:server`）；
- [x] 前端构建与代码检查 100% 通过（`pnpm gate:web`）；
- [x] Go Agent 单元测试与编译 100% 通过（项目内 `.tools/go` 等价执行）；
- [x] 文档治理门禁全绿（`pnpm gate:docs`）；
- [x] 本地 E2E 双模式节点混合纳管联调验证通过。

> 验证备注：构建后的真实联调覆盖 HTTP 配置版本协商、探针任务取回与回执、WS 鉴权，以及同节点从 WS 切换到 HTTP 时旧连接以关闭码 `4002` 被淘汰。
