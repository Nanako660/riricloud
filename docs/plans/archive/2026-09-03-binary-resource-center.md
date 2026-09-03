---
title: "二进制资源中心与 Sing-box 版本解耦"
type: plan
status: completed
target_version: v0.5.0
created_at: "2026-09-03"
author: "Antigravity & Maintainers"
archived_at: "2026-09-03"
---
# 二进制资源中心与 Sing-box 版本解耦

## 🎯 目标与背景

将 Master 内置 Agent/Sing-box 从应用版本发布流程中解耦，建立可持久化、可视化、可回滚的本地二进制资源中心。Sing-box 以独立的上游版本与内部修订号管理，Agent 继续记录构建来源应用版本；既有下载与升级接口保持兼容。

---

## 📋 里程碑与任务清单

### 里程碑 1：核心业务设计与开发
- [x] 任务 1.1: 定义 BinaryRelease、BinaryAsset、BinaryAssetFile 与 BinaryDeploymentTask 持久化模型
- [x] 任务 1.2: 实现资源导入、状态管理、默认资源、下载与兼容性校验 API
- [x] 任务 1.3: 将升级任务、重试、失败、回滚和 WS 重连恢复持久化
- [x] 任务 1.4: Agent 对 Sing-box 主文件与 libcronet.so 执行成组替换和整体回滚

### 里程碑 2：前端交互与联调
- [x] 任务 2.1: 新增 /admin/binaries 资源中心、导航入口与资源操作
- [x] 任务 2.2: 节点升级入口改为选择资源版本，并保留旧参数兼容
- [x] 任务 2.3: 完成 Server/Agent 资源与升级测试

### 里程碑 3：发布、文档与质量门禁
- [x] 任务 3.1: 构建产物生成独立 manifest，Sing-box 使用版本化目录
- [x] 任务 3.2: bundle、release 与 Docker 保留独立 Sing-box/Cronet 参数
- [x] 任务 3.3: 同步更新相关设计文档与 CHANGELOG
- [x] 任务 3.4: 执行全量门禁并处理所有失败项
- [x] 任务 3.5: 归档规划并刷新规划台账

---

## 🧪 验收标准与测试记录

- [x] Server 资源与持久任务测试通过
- [x] Agent Sing-box 成组替换与回滚测试通过
- [x] `pnpm gate` 全绿
- [x] 文档治理门禁通过并完成规划归档
