---
title: "docker-ghcr-publish"
type: plan
status: completed
target_version: v0.8.21
created_at: "2026-09-20"
author: "Antigravity & Maintainers"
archived_at: "2026-09-20"
---
# GitHub Actions 自动化发布 Docker 镜像至 GHCR

## 🎯 目标与背景

支持将 RiriCloud Master（主控端）与 Agent（边缘节点）Docker 镜像自动构建并发布到 GitHub Packages Container Registry (GHCR, `ghcr.io`)。
当前阶段优先支持 `linux/amd64` 平台，利用 GitHub 原生 `GITHUB_TOKEN` 简化鉴权并提供 GitHub Actions 缓存加速。

---

## 📋 里程碑与任务清单

### 里程碑 1：GitHub Actions 工作流落地
- [x] 任务 1.1: 创建 `.github/workflows/docker-publish.yml`，声明 `packages: write` 权限与登录 GHCR
- [x] 任务 1.2: 支持多场景触发与标签命名（`v*` 发布打版本与 latest、`agent-v*` 独立发布、`main` 分支推送到 edge、`workflow_dispatch` 手动构建）
- [x] 任务 1.3: 提取版本号与 Git commit，注入 Dockerfile build-args（`TARGETARCH=amd64`、`RIRICLOUD_VERSION` 等）并配置 Buildx GHA 缓存

### 里程碑 2：部署模板与文档联动
- [x] 任务 2.1: 更新 `docker-compose.image.yml` 支持环境变量配置 `IMAGE_PULL_POLICY`，补充 GHCR 镜像使用说明
- [x] 任务 2.2: 更新 `docs/DEPLOYMENT_GUIDE.md` 补充从 GHCR 在线拉取镜像部署完整指引

### 里程碑 3：工程治理与质量门禁
- [x] 任务 3.1: 更新 `CHANGELOG.md` 维护 `[Unreleased]` 变更记录
- [x] 任务 3.2: 运行五合一质量门禁（`pnpm gate`）验证全绿并归档规划任务

---

## 🧪 验收标准与测试记录

- [x] 工作流 YAML 结构完整正确，build-args 与 Dockerfile 定义对齐
- [x] 部署文档与 Compose 模板指引清晰
- [x] 全量质量门禁 `pnpm gate` 通过
