---
title: "开发脚本整理与 Docker WSL 约束"
type: plan
status: completed
target_version: 脚本治理
created_at: "2026-09-01"
author: "Antigravity & Maintainers"
archived_at: "2026-09-01"
---
# 开发脚本整理与 Docker WSL 约束

## 🎯 目标与背景

统一 Docker 镜像构建/导出与 Agent 二进制编译的开发入口，减少发布脚本与日常构建之间的重复逻辑，并明确 Windows 开发环境下 Docker 操作必须从 WSL/Linux shell 执行。

---

## 📋 里程碑与任务清单

### 里程碑 1：Agent 编译入口收敛
- [x] 任务 1.1: 为 `build-agent.sh` 增加目标平台、输出路径、版本号与发布模式参数
- [x] 任务 1.2: 让 `release.sh` 复用统一 Agent 编译入口，移除重复编译逻辑

### 里程碑 2：Docker 构建与导出边界
- [x] 任务 2.1: Docker 构建、导出与 Compose 操作增加 Linux/WSL shell 及 Linux daemon 校验
- [x] 任务 2.2: 保留版本/最新双标签、离线导出、manifest 与 SHA-256 校验能力

### 里程碑 3：文档与质量门禁
- [x] 任务 3.1: 同步更新部署指南、README、CHANGELOG 与根目录命令说明
- [x] 任务 3.2: 完成脚本语法、Agent 编译与 WSL Docker 验证并归档规划

---

## 🧪 验收标准与测试记录

- [x] `bash -n` 通过，Agent 当前平台与交叉编译入口可用
- [x] Windows 原生 shell 的 Docker 操作明确失败，WSL/Linux Docker 操作通过
- [x] `pnpm gate` 与 Docker 离线包校验通过

## 验收记录

- `bash -n`、`pnpm gate` 全部通过；Server 为 18 个测试套件、152 个测试全绿。
- Agent 发布模式五平台交叉编译成功：Linux amd64/arm64、Darwin amd64/arm64、Windows amd64；版本命令输出 `0.4.14`。
- WSL Docker 主控镜像实际构建成功，导出 Master/Agent 双标签压缩包、manifest 与 SHA-256，`sha256sum -c` 全部通过。
- 模拟 MSYS shell 执行 Docker 构建时按预期拒绝；Compose 配置校验通过。
