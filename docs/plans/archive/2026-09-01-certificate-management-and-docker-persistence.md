---
title: "证书管理中心与 Docker 本地持久化路径改造"
type: plan
status: completed
target_version: v0.4.15
created_at: "2026-09-01"
author: "Antigravity & Maintainers"
archived_at: "2026-09-01"
---
# 证书管理中心与 Docker 本地持久化路径改造

## 🎯 目标与背景

1. **主控证书管理系统 (Certificate Management)**：
   - 在主控端建立统一的 TLS 证书管理能力，支持手动粘贴与文件上传 PEM 格式证书及私钥。
   - 利用 Node.js 原生 `crypto.X509Certificate` 自动解析并校验域名 (SANs)、生效期、过期时间、签发机构，并校验公私钥匹配性。
   - 在创建/编辑线路（Line）时支持快捷下拉选择已有证书（强关联模式），下发 Sing-box 配置时以内嵌 `certificate` / `key` 文本数组形式同步，消除 VPS 节点手动分发证书文件的运维负担。
   - 证书更新时自动级联同步关联线路所属节点的 Sing-box 配置，证书被线路引用时提供删除保护与拦截。
   - 详情支持明文回显与查看已上传私钥。
2. **Docker 本地路径持久化 (Docker Host Bind Mount)**：
   - 将 `docker-compose.yml` 与 `docker-compose.image.yml` 中的 Docker 命名卷（`master-data`、`agent-data`）迁移为宿主机本地路径映射（`${MASTER_DATA_PATH:-./data}:/app/data` 与 `${AGENT_DATA_PATH:-./data/agent}:/var/lib/riri-agent`）。
   - 移除顶层 `volumes:` 块并同步更新部署与运维文档。

---

## 📋 里程碑与任务清单

### 里程碑 1：数据模型与后端核心服务
- [x] 1.1 在 `apps/server/prisma/schema.prisma` 新增 `Certificate` 模型，并在 `Line` 模型追加 `certificateId` 关联字段
- [x] 1.2 执行 Prisma 数据库迁移并生成客户端
- [x] 1.3 扩展 `apps/server/src/common/inbound.ts` 的 `InboundTlsConfig` 结构，并在 `buildServerTls` 中支持内嵌 PEM 证书与私钥生成 Sing-box TLS 配置
- [x] 1.4 实现 `CertificatesModule`、`CertificatesService` 与 `CertificatesController`：
  - X.509 证书解析与公私钥匹配校验
  - 证书列表查询（包含关联线路计数与状态分类）
  - 证书详情查询（支持私钥明文回显）
  - 证书创建与编辑（更新时自动向受影响节点推流 `config_sync`）
  - 证书删除防护（检测关联线路并拦截）
  - 前端预解析辅助接口 `POST /api/v1/admin/certificates/parse`
- [x] 1.5 改造 `LinesService`：创建/更新线路时关联 `certificateId`，注入内嵌 TLS 证书参数，并在详情/列表中输出证书简要关联信息
- [x] 1.6 在 `AppModule` 中注册 `CertificatesModule`
- [x] 1.7 编写 `certificates.service.spec.ts` 单元测试，并更新 `inbound.spec.ts` 与 `lines.service.spec.ts`

### 里程碑 2：前端 Web 控制台与线路表单交互
- [x] 2.1 新增证书管理页面 `apps/web/src/pages/admin/certificates/index.tsx`：
  - 数据表格：名称、SAN 域名标签、签发者、到期时间（有效/即将到期/已过期状态徽章）、关联线路数、操作按钮
  - 新增/编辑对话框：PEM 证书与私钥粘贴/上传、实时解析反馈预览、私钥查看
- [x] 2.2 实现 `apps/web/src/pages/admin/certificates/use-certificates.ts`（React Query hooks）
- [x] 2.3 在 `apps/web/src/components/layout/app-sidebar.tsx` 与路由表中注册 `/admin/certificates`
- [x] 2.4 改造线路表单 `line-security-fields.tsx` 与 `line-form-schema.ts`：
  - 切换标准 TLS 时支持“管理证书（快捷选择）”与“节点本地路径”
  - 选择证书后自动建议/回填 TLS SNI

### 里程碑 3：Docker 持久化改造与工程治理
- [x] 3.1 修改 `docker-compose.yml` 与 `docker-compose.image.yml`，将命名存储卷改造为本地路径映射 `${MASTER_DATA_PATH:-./data}:/app/data` 与 `${AGENT_DATA_PATH:-./data/agent}:/var/lib/riri-agent`，移除顶层 `volumes:`
- [x] 3.2 同步更新数据模型文档 `docs/DATA_MODELS.md`（新增 Certificate 实体与 Line 关联）
- [x] 3.3 同步更新 API 协议文档 `docs/API_AND_PROTOCOLS.md`（新增证书管理 REST API 契约与内嵌 TLS 结构）
- [x] 3.4 同步更新部署文档 `docs/DEPLOYMENT_GUIDE.md`（更新 Docker 持久化映射路径说明）
- [x] 3.5 在 `CHANGELOG.md` 顶部的 `## [Unreleased]` 维护新增功能条目
- [x] 3.6 运行并确保全套质量门禁 `pnpm gate`（version + docs + server + web + agent）全绿

---

## 🧪 验收标准与测试记录

- [x] 后端单元测试覆盖证书解析、公私钥匹配、CRUD、级联配置下发与删除拦截
- [x] 前端类型检查与构建 `pnpm gate:web` 通过，UI 风格严格遵循 shadcn/ui 规范
- [x] 线路创建能够成功选择证书，下发的 Sing-box 配置包含正确的内嵌 `certificate` 和 `key`
- [x] 更新证书内容后，关联节点自动完成配置更新生效
- [x] Docker Compose 本地数据映射 `./data` 与 `./data/agent` 生效
- [x] `pnpm gate` 五合一门禁全部通过
