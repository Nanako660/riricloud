---
title: "release-and-ghcr-governance"
type: plan
status: completed
target_version: v0.9.0
created_at: "2026-09-26"
author: "Antigravity & Maintainers"
archived_at: "2026-09-26"
---
# 远端 Release 与 GHCR Docker 镜像治理及错误发版清理

## 🎯 目标与背景

解决 GHCR Docker 镜像在推送 `v*` 主控 Tag 时错误使用 Master 版本号污染 `riricloud-agent` 镜像标签的问题，补齐 `Dockerfile` 与 `Dockerfile.agent` 中缺失的 Sing-box `inboundUser` 补丁及 `with_clash_api` 编译标签，修复本地 `bundle-master.sh` / `apps/server/package.json` 打包范围过宽与 `release.sh` 的 `--latest` 指针隔离，并清理远端错误镜像标签、空壳 Release 与孤立 Tag。

---

## 📋 里程碑与任务清单

### 里程碑 1：CI/CD 工作流与 Docker 镜像构建修复
- [x] 任务 1.1: 改造 `.github/workflows/docker-publish.yml` 实现 `v*`（仅构建 Master）与 `agent-v*`（仅构建 Agent）严格双轨解耦
- [x] 任务 1.2: 在 `Dockerfile` 与 `Dockerfile.agent` 中应用 `sing-box-clashapi-inbound-user.patch`、启用 `with_clash_api` 编译标签并将定制内核内嵌至 `riri-agent`
- [x] 任务 1.3: 更新 `.env.image.example` 默认版本示例至 `0.9.0` / `0.8.0`

### 里程碑 2：本地发布与打包脚本加固
- [x] 任务 2.1: 在 `apps/server/package.json` 声明 `"files": ["dist", "prisma"]` 白名单，并在 `scripts/bundle-master.sh` 增加敏感文件与临时目录清理
- [x] 任务 2.2: 在 `scripts/release.sh` 显式区分 `--latest`（Master）与 `--latest=false`（Agent），并增加配套 Agent Release 前置检查

### 里程碑 3：文档同步、质量门禁与远端清理重发
- [x] 任务 3.1: 同步更新 `docs/VERSIONING.md`、`docs/DEPLOYMENT_GUIDE.md` 与 `CHANGELOG.md`
- [x] 任务 3.2: 通过全量质量门禁 `pnpm gate` 并归档规划文档
- [x] 任务 3.3: 合并 PR 后清理远端空壳 Release、孤立 Tag 与污染的 GHCR 镜像，重新标准发布 `agent-v0.8.0` 与 `v0.9.0`

---

## 🧪 验收标准与测试记录

- [x] `pnpm bundle:master` 成功生成干净的主控发行包（无 `.env`、`*.db` 与递归目录）
- [x] 六合一质量门禁 `pnpm gate` 全部通过
