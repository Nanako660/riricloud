---
title: "内置二进制资源生命周期完全优化"
type: plan
status: active
target_version: "v0.8.9"
created_at: "2026-09-13"
author: "Antigravity & Maintainers"
---

# 内置二进制资源生命周期完全优化

## 🎯 目标与背景

Docker 部署升级镜像后，资源管理页出现大量历史"内置"Agent 版本（每个部署过的镜像积累一条 `BinaryRelease`），且多条记录同时挂"默认"徽标，旧记录指向的 STATIC 路径已被新版本文件占用（sha256 失配）但列表仍显示"启用"。

根因（`apps/server/src/binaries/binary-resources.service.ts`）：

1. `syncManifests()` 每次启动把当前镜像 manifest 资源 upsert 为新 BUILTIN/ACTIVE 记录，旧记录永不清理（BUILTIN 禁止删除）；
2. manifest 创建分支写死 `isDefault: true` 却不清同类型旧默认；
3. 无任何机制感知"DB 记录指向的磁盘文件已失效/被替换"。

目标：升级镜像后自动归档被替代的内置旧资源（可恢复、审计可查）、全局每类型唯一默认、失效资产可见，并移除 Docker 镜像与离线主控包中的冗余扁平二进制副本。已确认决策：自动归档（RETIRED）策略 + 全部三项配套优化。无 Prisma schema 变更，存量脏数据由新逻辑首次启动自动收敛。

---

## 📋 里程碑与任务清单

### 里程碑 1：服务端生命周期修复（apps/server）
- [ ] 任务 1.1: `syncManifests()` 解析失败补 warn 日志，返回成功解析的资源键集合
- [ ] 任务 1.2: 新增 `retireSupersededBuiltins()`——staticDir manifest 成功解析时，归档不在当前 manifest 中的 BUILTIN 资源并转移默认（幂等，不触碰 UPLOAD/REMOTE）
- [ ] 任务 1.3: 新增 `normalizeDefaults()`——每类型 ACTIVE 默认唯一化（保留最新，零条时补设）
- [ ] 任务 1.4: 新增 `verifyAssetsAvailability()`——启动时校验 ACTIVE/DRAFT 资产文件存在性与 sha256，失效标 `available=false`，无可用资产的 ACTIVE 降级 DISABLED
- [ ] 任务 1.5: 单元测试覆盖上述场景（归档/幂等/默认收敛/失效校验/无 manifest 跳过）

### 里程碑 2：产物瘦身与前端标识
- [ ] 任务 2.1: Dockerfile 移除扁平 `singbox-linux-<arch>`、顶层 `libcronet.so`、`/app/binaries/mihomo-linux-*` 冗余副本（保留版本化布局、AGENT_VERSION、/usr/local/bin 三件套）
- [ ] 任务 2.2: `scripts/bundle-master.sh` 同步移除 agent/singbox/libcronet 扁平副本，修正 `scripts/master-bundle/README.md` 过时描述
- [ ] 任务 2.3: 前端资源列表/详情基于 `asset.available` 展示"文件失效"标识，总体积仅累计可用资产

### 里程碑 3：文档与质量门禁
- [ ] 任务 3.1: 同步更新 ARCHITECTURE / API_AND_PROTOCOLS / DATA_MODELS / DEPLOYMENT_GUIDE / VISUAL_VERIFICATION 与 CHANGELOG `[Unreleased]`
- [ ] 任务 3.2: `pnpm gate` 五门禁全绿，提 PR 合并后归档本规划

---

## 🧪 验收标准与测试记录

- [ ] `pnpm gate` 全绿；新增单测全过
- [ ] 升级部署首次启动后：仅当前镜像版本"启用+默认"，历史内置版本全部"归档"（默认徽标唯一，审计含 `reason=builtin-superseded`）
- [ ] 镜像与离线包不含冗余扁平二进制；节点升级/下载分发行为不回归
- [ ] 失效资产在列表与详情可见"文件失效"标识
- [ ] 单元测试 / 门禁全绿
- [ ] 联调验收通过
