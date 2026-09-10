---
title: "web-form-init-clobber"
type: plan
status: active
target_version: "v0.8.2"
created_at: "2026-09-10"
author: "Antigravity & Maintainers"
---

# web-form-init-clobber

## 🎯 目标与背景

根治「表单/编辑草稿的初始化依赖了会变化的数据」这一整类前端缺陷：轮询（`refetchInterval`）或 refetch 使 query 数据换成新引用，派生数组/对象随之变化，进而触发「打开时初始化」的 `useEffect` 全量回写，清空用户正在输入的内容。

上报现象：`/admin/mirrors` 新增镜像站弹窗输入后约 5 秒被重置。根因链（已定位）：

- `apps/web/src/pages/admin/nodes/use-nodes.ts:241-247` — `useAdminNodes()` 每 5 秒轮询，载荷含 `lastSeenAt/cpuUsage/uploadRate` 等遥测字段，每次响应都不同 → React Query 换新引用；
- `apps/web/src/pages/admin/mirrors/index.tsx:31-34` — `availableNodes = useMemo(filter, [nodes])` 随之换新引用；
- `index.tsx:35-38` — `useEffect(..., [availableNodes, editing, open])` 内 9 个 `setState` 全量回写。

`0.8.1`（`9286552`）只把内联数组改成 `useMemo`，把「每次渲染重置」降级为「每次轮询重置」，依赖形态未变，故复发。

---

## 📋 里程碑与任务清单

### 里程碑 1：统一契约与规范
- [x] 任务 1.1: 新增 `apps/web/src/hooks/use-form-reset.ts`（`useFormResetOnKey`），effect 依赖仅限原始值，`reset/isDirty` 走 ref
- [x] 任务 1.2: `docs/FRONTEND_UI_GUIDELINES.md` 增补 R1–R3 与 §4.2 禁止项 B8

### 里程碑 2：P0 修复（用户可感知）
- [x] 任务 2.1: 镜像站弹窗迁移 RHF + zod + shadcn `<Form>`（同时纠正 §4.2 B6 违规），初始化改走 hook，出网节点选项保持实时
- [x] 任务 2.2: 节点详情页基础信息/配置覆盖迁移 RHF，解除 5 秒轮询回写，保留遥测实时刷新

### 里程碑 3：同类隐患收敛
- [x] 任务 3.1: 系统设置页（`dataRevision + isDirty` 守卫）、证书编辑弹窗（按 `certificateId` 初始化）、用户综合弹窗、个人中心昵称（`isDirty` 守卫）
- [x] 任务 3.2: 探针弹窗改用独立 queryKey（消除与设置页共 key 不同形态的缓存污染）；binaries 导入表单消除派生数组入依赖（联动移入选择事件）
- [x] 任务 3.3: 线路/套餐/模板/节点创建/升级五处机械迁移到 hook（`reset` 内容逐字不变）

### 里程碑 4：机械守卫与文档
- [x] 任务 4.1: `eslint.config.js` 增补 `no-restricted-syntax` 守卫（临时候选文件命中 2 条规则后删除，作为旧形态复现证据）
- [x] 任务 4.2: 同步 `docs/VISUAL_VERIFICATION.md` §3 映射缺漏与 `CHANGELOG.md` `[Unreleased]`

---

## 🧪 验收标准与测试记录

- [x] 镜像站/节点详情：输入后静置 ≥30 秒不丢，遥测与节点下拉仍实时刷新（代码层：初始化仅由 `open` + 实体 id 触发）
- [x] 系统设置/证书编辑：后台 refetch 不清空草稿；保存成功后仍正确回灌服务端值
- [x] ESLint 守卫在旧形态下报错（探针命中 2 条规则）、修复后全绿
- [x] `pnpm gate:version` / `gate:docs` / `gate:web`（eslint + tsc --noEmit + vite build）全绿
- [x] 手工冒烟：受影响索引 UI-09/UI-10、UI-11~13、UI-14、UI-16~19、UI-22~24、UI-26、UI-29、UI-31、UI-34 的弹窗打开/编辑/保存路径未回归
- [ ] 视觉走查按需（仅 Antigravity 环境，不接入 CI）——未执行，按 §11 由维护者按需发起

### 范围内未做（留待独立任务）

> `apps/web/src/pages/admin/binaries/index.tsx` 的导入/上传弹窗本次仅按 §5.1 消除了「派生数组入依赖」隐患（联动移入选择事件、初始化改走 hook）；其「裸 `useState` 管理字段」的 §4.2 B6 合规迁移（RHF + zod + `<Form>`）留待独立的 UI 重构任务，避免在本 PR 内改动该弹窗全部 JSX 造成回归风险。
