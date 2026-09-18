---
title: "线路多路复用 (Multiplex) 与 TCP Brutal 强力拥塞控制及线路参数更新优化"
type: plan
status: completed
target_version: v0.8.18
created_at: "2026-09-18"
author: "Antigravity & Maintainers"
archived_at: "2026-09-18"
---
# 线路多路复用 (Multiplex) 与 TCP Brutal 强力拥塞控制及线路参数更新优化

## 🎯 目标与背景

针对 SS 等协议线路配置多路复用后报 `sing-box check: FATAL[0000] initialize inbound[1]: brutal: invalid upload speed`，以及取消勾选多路复用后保存依然报错且保持启用的缺陷，实施彻底优化：
1. 解决前端下划线与后端驼峰命名断层导致的速率丢失问题；
2. 强化 Sing-box 服务端与客户端订阅生成器中的 Brutal 契约防御守卫，严禁输出无速率的非法 Brutal 块；
3. 重构服务端 `LinesService` 的 `prepare` 参数合并语义，从盲目 `deepMerge` 改为“新参数为准全量替换 + 敏感字段（Reality 私钥等）继承”，彻底解决配置无法取消与清空的顽疾；
4. 前端表单增加 TCP Brutal 正整数速率强校验，提升交互引导；
5. 建立双向兼容解析与脏数据运行时自愈机制，补充完善自动化测试。

---

## 📋 里程碑与任务清单

### 里程碑 1：服务端协议与配置生成强化
- [x] 任务 1.1: 升级 `apps/server/src/common/inbound.ts` 中的 `normalizeMultiplex`，支持 camelCase 与 snake_case 双向解析，增加 Brutal 速率必填校验。
- [x] 任务 1.2: 升级 `buildServerMultiplex` 与 `apps/server/src/subscription/builders.ts` 中的 `buildSingboxClientMultiplex`，增加 `up_mbps > 0` 契约防御守卫。
- [x] 任务 1.3: 补充 `inbound.spec.ts` 与 `builders.lines.spec.ts` 自动化单元测试。

### 里程碑 2：线路业务服务参数更新重构与历史自愈
- [x] 任务 2.1: 重构 `apps/server/src/lines/lines.service.ts` 的 `prepare` 方法，摒弃粗暴 `deepMerge`，实现参数全量替换与敏感字段继承（Reality 私钥、证书注入）。
- [x] 任务 2.2: 在 `toView` 与脏数据读取阶段提供自愈能力，防止历史错误数据影响运行。
- [x] 任务 2.3: 编写 `lines.service.spec.ts` 针对线路参数更新、多路复用开启与取消、敏感私钥继承的完整单元测试。

### 里程碑 3：前端表单校验与数据提交对齐
- [x] 任务 3.1: 在 `apps/web/src/pages/admin/lines/components/line-form-schema.ts` 中增强 `superRefine`，对开启 Brutal 时必须输入正整数速率实施前端强拦截。
- [x] 任务 3.2: 统一前端 `buildParamsFromValues` 提交标准 camelCase，并在 `lineToFormValues` 中支持 camelCase 与 snake_case 回显兼容。
- [x] 任务 3.3: 优化 `line-network-fields.tsx` 的字段展示与交互提示。

### 里程碑 4：质量门禁与归档
- [x] 任务 4.1: 更新 `CHANGELOG.md` 的 `[Unreleased]` 缓冲区与相关设计文档。
- [x] 任务 4.2: 执行五合一质量门禁 `pnpm gate` 确保全绿。
- [x] 任务 4.3: 使用 `pnpm plan:archive` 归档本任务。

---

## 🧪 验收标准与测试记录

- [x] `normalizeMultiplex` 与 `buildServerMultiplex` 针对非法/缺失速率的防御测试通过
- [x] `lines.service` 取消勾选多路复用后在数据库与生成结果中彻底移除 `multiplex`
- [x] 前端表单空速率提交时被拦截并精准提示错误
- [x] `pnpm gate` 全绿（version, docs, server, web, agent）
