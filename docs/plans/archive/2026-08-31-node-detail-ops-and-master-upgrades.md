---
title: "node-detail-ops-and-master-upgrades"
type: plan
status: completed
target_version: v0.3.0
created_at: "2026-08-31"
author: "Antigravity & Maintainers"
archived_at: "2026-08-31"
---
# 节点管理详情页完善、探针诊断闭环与主控自包含升级分发中心规划

## 🎯 目标与背景

当前节点管理详情页在实际生产运维中存在若干痛点：
1. **探针功能缺乏回调结果**：管理员在前端发起 TCP/DNS/ICMP 诊断后无法直观查看延迟毫秒数、DNS 解析 IP 及错误详情；
2. **升级依赖外网 GitHub**：现有升级机制需要输入外部下载 URL，国内 VPS 节点拉取 GitHub Releases 经常超时失败；由于主控端在构建时已必然包含当前版本的 `riri-agent`，应当默认直接从主控秒级直连下载，Sing-box 内核也支持由主控中转与托管下发；
3. **节点详情页运维能力不足**：缺少一键升级中心、内核热重载快捷操作、内核崩溃/错误日志（`lastError`）格式化分析、以及历史网络质量快照沉淀。

本规划旨在**彻底重塑节点详情页为全功能运维控制台**，并建立**主控自包含零外部依赖升级分发体系**。

---

## 📋 里程碑与任务清单

### 里程碑 1：Master 主控自包含二进制分发中心与探针快照服务
- [x] **任务 1.1: 实现主控内置二进制分发模块 (`BinariesService` / `BinariesController`)**
  - 统一托管当前版本各架构 `riri-agent`（`linux_amd64`, `linux_arm64` 等）与 `sing-box` 官方内核；
  - 启动时自动扫描/计算二进制 SHA-256，提供 `GET /api/v1/downloads/binaries/:target` 内部下载端点；
  - 提供 `GET /api/v1/admin/binaries/info` 查询主控内置版本元数据；
- [x] **任务 1.2: 升级任务分发协议与服务升级 (`UpgradeTask`)**
  - 支持「默认直接下发主控自带版本」，Master 自动装配内部下载 URL 与 SHA-256；
  - 支持从面板上传/导入自定义 Sing-box 内核版本并向节点一键下发；
- [x] **任务 1.3: 数据模型与节点服务扩展 (`Node` 模型)**
  - Prisma `Node` 模型新增 `lastProbeResult`（存储最近一次诊断结果 JSON）、`agentVersion`（Agent 版本）、`osArch`（系统架构）；
  - 创建数据库迁移脚本；
- [x] **任务 1.4: 完善网络探针诊断结果回调与持久化**
  - 无论节点走 WSS 还是 HTTP 轮询，回传探针测试结果时自动落库 `lastProbeResult`；
- [x] **任务 1.5: 编写服务端单元测试**
  - 覆盖二进制元数据服务、探针结果落库、主控直供升级任务下发与节点运维接口。

---

### 里程碑 2：Go Agent 客户端版本画像与探针/升级增强
- [x] **任务 2.1: Agent 软硬件与版本画像上报**
  - 心跳与轮询上报增加 `agentVersion`（来自编译期 `-ldflags` 注入的 `Version`）与 `osArch`（如 `linux/amd64`）；
- [x] **任务 2.2: 升级模块 (`internal/upgrade`) 与探针模块优化**
  - 完善流式下载、断点/超时保护、哈希校验与原子进程切换；
- [x] **任务 2.3: 编写 Go Agent 单元测试**。

---

### 里程碑 3：Web 控制台节点详情页（Node Detail）全功能运维重塑
- [x] **任务 3.1: 详情页头部全功能运维工具栏**
  - 提供「一键版本升级中心」、「网络探针诊断」、「内核热重载 (Reload)」、「Agent 快捷重启」、「查看一键安装命令」；
- [x] **任务 3.2: 交互式网络探针诊断弹窗组件升级 (`ProbeNodeDialog`)**
  - 内置丰富预设（Cloudflare Anycast, Google DNS, 境外落地连通性等）与自定义目标；
  - 执行过程动态加载动画，实时展示 TCP 延迟卡片（带绿/黄/红健康标色）、DNS 解析出的 IP 清单、丢包率与错误原因；
- [x] **任务 3.3: 「一键版本升级中心」弹窗组件 (`UpgradeNodeDialog`)**
  - 直观呈现「当前 Agent vs 主控版本」（落后时一键升级）与「当前 Sing-box vs 推荐内核」（一键升级）；
  - 支持自定义内核版本上传下发；
- [x] **任务 3.4: 节点详情 Tab 2 / Tab 3 运维面板全面增强**
  - 「最近一次网络质量诊断快照」卡片与时间戳；
  - 「内核最近一次错误日志抽样 (lastError)」格式化代码块与复制；
  - 「节点软硬件与连接画像」卡片（系统架构、通信模式、已生效配置版本）；
- [x] **任务 3.5: 前端构建与交互测试**。

---

### 里程碑 4：全链路端到端联调、文档治理与质量门禁
- [x] **任务 4.1: 更新系统设计与运维文档**
  - 更新 `docs/ARCHITECTURE.md`（主控二进制分发中心与探针回调时序）；
  - 更新 `docs/API_AND_PROTOCOLS.md`（二进制下载与探针/升级 DTO）；
  - 更新 `docs/DATA_MODELS.md`（Node 模型新增字段）；
  - 更新 `docs/DEPLOYMENT_GUIDE.md`；
  - 登记 `CHANGELOG.md` 的 `[Unreleased]` 小节；
- [x] **任务 4.2: 运行端到端联调测试**
  - 验证主控直供一键升级全链路与探针诊断实时回显；
- [x] **任务 4.3: 四端质量门禁全绿（`pnpm gate`）**。

---

## 🧪 验收标准与测试记录

- [x] 服务端单元测试 100% 通过（`pnpm gate:server`）；
- [x] 前端构建与代码检查 100% 通过（`pnpm gate:web`）；
- [x] Go Agent 单元测试与编译 100% 通过（`pnpm gate:agent`）；
- [x] 文档治理门禁全绿（`pnpm gate:docs`）；
- [x] 本地 E2E 探针诊断闭环与主控直供升级验证通过。
