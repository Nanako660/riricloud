---
title: "Master 内置本机 Agent"
type: plan
status: completed
target_version: v0.4.0
created_at: "2026-08-31"
author: "Antigravity & Maintainers"
archived_at: "2026-08-31"
---
# Master 内置本机 Agent

## 🎯 目标与背景

让 Master 的 Docker 镜像和自包含发行包默认携带并启动本机 Agent，初始化时自动创建不可删除的 `Master-Local` 节点，同时保留远程 Agent 独立部署能力。

---

## 📋 里程碑与任务清单

### 里程碑 1：核心业务与启动流程
- [x] 任务 1.1: 实现 Master-Local 节点 bootstrap 并与演示 seed 分离
- [x] 任务 1.2: 实现 Master 镜像与发行包内置 Agent 生命周期管理
- [x] 任务 1.3: 补齐本机节点公网地址与代理端口映射配置

### 里程碑 2：部署编排与兼容性
- [x] 任务 2.1: 更新 Docker Compose、离线镜像模板和发行包脚本
- [x] 任务 2.2: 保留远程 Agent profile 并验证旧部署路径

### 里程碑 3：文档与质量门禁
- [x] 任务 3.1: 同步更新相关设计文档与 CHANGELOG
- [x] 任务 3.2: 补充回归测试并在 WSL 完成镜像构建、导出和 Compose 验证

---

## 🧪 验收标准与测试记录

- [x] 单元测试 / 门禁全绿
- [x] Docker 与发行包本机 Agent 联调验收通过
