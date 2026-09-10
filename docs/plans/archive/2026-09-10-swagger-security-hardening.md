---
title: "swagger-security-hardening"
type: plan
status: completed
target_version: v0.8.1
created_at: "2026-09-10"
author: "Antigravity & Maintainers"
archived_at: "2026-09-10"
---
# swagger-security-hardening

## 🎯 目标与背景

生产公开部署时，主控端无条件向公网暴露 `/api/docs` 及 OpenAPI JSON 结构，存在接口测绘、精准指纹识别及未授权探测风险。
本任务旨在实现「生产环境默认关闭、开发测试开箱即用、双命名环境变量受控开启、反向代理层纵深防御」。

---

## 📋 里程碑与任务清单

### 里程碑 1：核心判定逻辑与单元测试
- [x] 任务 1.1: 创建 `apps/server/src/common/swagger-config.ts` 纯函数 `shouldEnableSwagger`，实现环境变量解析与环境判定
- [x] 任务 1.2: 编写 `apps/server/src/common/swagger-config.spec.ts` 覆盖开发默认、生产默认、显式开关、回退别名及边界值单测

### 里程碑 2：主控挂载改造与配置模板同步
- [x] 任务 2.1: 在 `apps/server/src/main.ts` 中基于 `shouldEnableSwagger` 受控挂载 SwaggerModule
- [x] 任务 2.2: 同步更新 `apps/server/.env.example` 与 `scripts/master-bundle/.env.example`
- [x] 任务 2.3: 在 `docker-compose.yml` 与 `docker-compose.image.yml` 中透传 `ENABLE_SWAGGER`
- [x] 任务 2.4: 在 `scripts/nginx/riricloud.conf.example` 中补充反代层可选拦截示例

### 里程碑 3：文档同步与质量门禁自查
- [x] 任务 3.1: 更新 `docs/DEPLOYMENT_GUIDE.md`、`docs/API_AND_PROTOCOLS.md`、`README.md` 与 `scripts/master-bundle/README.md`
- [x] 任务 3.2: 维护 `CHANGELOG.md` 顶部的 `## [Unreleased]`
- [x] 任务 3.3: 运行门禁（包含 docs、version、server、web）通过
- [x] 任务 3.4: 归档本计划文件（`pnpm plan:archive docs/plans/swagger-security-hardening.md`）

---

## 🧪 验收标准与测试记录

- [x] 单元测试 `swagger-config.spec.ts` 100% 通过（10/10 通过）
- [x] 本地开发模式下 `/api/docs` 默认可用
- [x] 生产模拟环境下 `/api/docs` 默认返回 404
- [x] 服务端、前端、文档治理及版本门禁全量通过
