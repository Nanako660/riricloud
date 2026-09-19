---
title: "docker-startup-diagnostics"
type: plan
status: completed
target_version: v0.8.22
created_at: "2026-09-20"
author: "Antigravity & Maintainers"
archived_at: "2026-09-20"
---
# Docker 容器启动诊断、运行身份自适应与项目约束完善

## 🎯 目标与背景

从根本上解决 RiriCloud Docker 容器在宿主机挂载卷权限不匹配导致的启动阻断（如 SQLite / Prisma os error 13）。
通过在容器入口引入全链路前置深度自检与格式化诊断卡片输出，搭配 Compose 环境变量自适应（`DOCKER_USER`），并在 `docs/PROJECT_CONSTRAINTS.md` 固化容器安全与启动诊断规范。

---

## 📋 里程碑与任务清单

### 里程碑 1：容器入口启动深度诊断落地
- [x] 任务 1.1: 在 `scripts/docker-entrypoint.js` 中实现 `runStartupDiagnostics()` 模块，对数据目录、测试锁文件、存量 db/wal/shm、临时目录与核心密钥执行前置体检
- [x] 任务 1.2: 设计并输出结构化中文诊断卡片，提供环境取证与 3 种现成修复命令

### 里程碑 2：编排模板与运行身份自适应
- [x] 任务 2.1: 更新 `docker-compose.yml` 与 `docker-compose.image.yml`，支持 `user: "${DOCKER_USER:-65532:65532}"`
- [x] 任务 2.2: 同步更新 `.env.example` 与 `.env.image.example`，补充环境变量说明

### 里程碑 3：项目约束与运维文档联动
- [x] 任务 3.1: 在 `docs/PROJECT_CONSTRAINTS.md` 新增 §11「容器安全、运行身份与启动诊断约束」
- [x] 任务 3.2: 更新 `docs/DEPLOYMENT_GUIDE.md` 补充启动诊断与挂载权限排查指引
- [x] 任务 3.3: 更新 `CHANGELOG.md` 并在门禁全绿后归档任务

---

## 🧪 验收标准与测试记录

- [x] 模拟异常权限场景，诊断卡片能够精准捕获并输出友好的环境信息与排查指引
- [x] 正常权限场景下静默平滑通过自检
- [x] `pnpm gate` 五合一全量质量门禁通过
