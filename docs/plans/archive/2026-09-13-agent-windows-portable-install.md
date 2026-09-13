---
title: "agent-windows-portable-install"
type: plan
status: completed
target_version: v0.8.9
created_at: "2026-09-13"
author: "Antigravity & Maintainers"
archived_at: "2026-09-13"
---
# agent-windows-portable-install

## 🎯 目标与背景

Windows 节点此前无法正常安装 Agent：Agent 二进制缺少 Windows SCM 服务端入口，SCM 拉起 `riri-agent run` 后从未上报 `SERVICE_RUNNING`，服务启动/停止一律报错误 1053 超时。同时主控下发的安装命令为纯 POSIX/bash 语法（`/tmp`、`install -m 0755`、`/usr/local/bin`），不区分目标操作系统，Windows 上不可执行；且缺少免注册服务的快速运行路径。

本规划交付三件事：

1. 修复 Agent Windows 服务入口（SCM 生命周期接入）。
2. 主控安装命令按目标操作系统（Linux / macOS / Windows）与部署方式（原生安装 / 免安装运行 / Docker）生成。
3. Agent 支持免安装直接运行（`riri-agent run` 仅凭环境变量启动，sing-box 内核后台自举下载）。

---

## 📋 里程碑与任务清单

### 里程碑 1：Agent 端（apps/agent）
- [x] 任务 1.1: 抽取 `internal/kernel` 包（sing-box 下载逻辑自 install.go 迁出），暴露 `Ensure`/`Download`
- [x] 任务 1.2: 新增 `internal/runner/service.go`：`agentProgram` 包装器（Start 非阻塞 goroutine、Stop 取消上下文限时等待）与 `runAsService`
- [x] 任务 1.3: `runner.Run` 按 `runtime.GOOS == "windows" && !service.Interactive()` 分流至服务模式；Linux/macOS 行为不变
- [x] 任务 1.4: 免安装内核自举：内核缺失且未显式指定 `SINGBOX_BINARY_PATH` 时后台下载（source auto/master/github/none，失败 5 分钟重试）；`run` 命令新增 `--singbox-source/--singbox-url/--singbox-version`
- [x] 任务 1.5: 日志目录创建失败错误信息附带 `RIRICLOUD_DATA_DIR` / `RIRICLOUD_LOG_PATH` 提示
- [x] 任务 1.6: 单元测试（agentProgram 生命周期、kernel Ensure/Download 校验、install 委托）

### 里程碑 2：服务端（apps/server）
- [x] 任务 2.1: `NodesService.buildInstallCommands` 返回 `native.{linux,macos,windows}` 与 `portable.{linux,macos,windows}` 命令对（保留旧键 ws/http/dockerWs/dockerHttp）
- [x] 任务 2.2: Windows 原生安装（PowerShell）、Windows 免安装运行、`windowsUninstallCommand` 生成器；下载 UA 按目标 OS 归一（OS 匹配复用节点 arch，否则 amd64）
- [x] 任务 2.3: spec 测试覆盖按 OS 生成、arch 复用与回退、免安装命令形态

### 里程碑 3：前端（apps/web）
- [x] 任务 3.1: `use-nodes.ts` 扩展 `NodeInstallCommands`（native/portable）与 `windowsUninstallCommand` 类型
- [x] 任务 3.2: 新增共享组件 `install-commands-picker.tsx`（三部署方式 Tab × 系统选择 × WS/HTTP + 场景提示）
- [x] 任务 3.3: 创建节点弹窗、节点详情安装弹窗、Token 轮换弹窗三处接入共享组件；详情弹窗补 Windows 卸载命令展示

### 里程碑 4：文档与质量门禁
- [x] 任务 4.1: `API_AND_PROTOCOLS.md` installCommands 结构、`DEPLOYMENT_GUIDE.md` Windows 安装与便携模式、`VISUAL_VERIFICATION.md` 台账、`CHANGELOG.md` [Unreleased]
- [x] 任务 4.2: `pnpm gate` 全绿并归档本规划

---

## 🧪 验收标准与测试记录

- [x] 单元测试 / 门禁全绿（agent go vet + gofmt + go test 全通过；server nodes.service.spec 12 用例通过；web tsc/eslint/vite build 通过）
- [x] 联调验收通过：`agentProgram` Start 非阻塞、Stop 取消退出；kernel 下载校验与已存在跳过；安装命令按 OS/部署方式正确分流（见 spec 断言）

> 归档说明：随实现 PR 合入后执行 `pnpm plan:archive docs/plans/agent-windows-portable-install.md`。
