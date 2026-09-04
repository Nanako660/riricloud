---
title: 订阅模板全链路闭环优化与现代化工作台
type: plan
status: completed
target_version: 0.6.2
created_at: "2026-09-04"
author: "Antigravity & Maintainers"
archived_at: "2026-09-04"
---
# 订阅模板全链路闭环优化与现代化工作台 (Subscription Template Full-Stack Refactor)

## 🎯 目标与背景

当前 RiriCloud 的订阅模板模块作为多协议节点（Line / Node）向客户端分流配置（Clash Meta / Sing-box）编译的核心枢纽，在早期快速落地后暴露出诸多协议规范、分流生态、系统状态一致性与管理端交互体验上的严重短板：

### 核心痛点与缺陷分析
1. **Sing-box 语法严重不兼容（P0 级 Bug）**：
   - **DNS 格式错位**：数据库中存储的 `dnsConfig` 均为 Clash 专有语法（`enhanced-mode: fake-ip`、`nameserver`、`fallback`、`fallback-filter`）。在编译 Sing-box 配置时，后端直接将其赋给顶层 `dns` 字段，导致导出的 Sing-box JSON 语法不合法，客户端解析报错或静默丢失 DNS 分流。
   - **缺少 `route.rule_set` 顶层声明**：默认模板配置了 `type: "geosite"` 与 `rules: ["cn", "private"]`，在编译为 Sing-box 时直接输出 `{ "rule_set": ["cn", "private"], "outbound": "direct" }`。自 **Sing-box 1.8+** 起，已废弃隐式内置规则，引用任何规则集必须在顶层 `route.rule_set` 显式声明数据源；缺失顶层声明导致现代 Sing-box 客户端启动直接抛出 `rule-set not found: cn` 异常崩溃。
2. **规则集生态与分流维护成本过高（P1 级短板）**：
   - 目前 Clash 与 Sing-box 仅支持内联硬编码数百条域名，无法接入开源社区规则集生态（如 Loyalsoldier / MetaCubeX / SagerNet）。
   - 缺少对 Clash `rule-providers` 与 Sing-box 远程 `.srs` Rule-Set 的协同编译支持，规则难以动态更新且订阅文本臃肿。
3. **策略组筛选能力极度受限（P1 级短板）**：
   - 现有 `matchesProxyFilter()` 仅支持对节点名称与入站 tag 进行单一正则表达式匹配。
   - 无法按**线路标签 (`line.tags`)**（如 `iplc`、`gaming`、`vip`）归集节点；无法按**协议类型 (`protocols`)**（如 `HYSTERIA2`、`VLESS`）分类；无法按**倍率 (`maxRate`)** 筛选低倍率经济组；策略组类型缺少 `fallback`（故障转移）与 `load-balance`（负载均衡）的完整映射。
4. **默认模板状态双重事实来源裂脑（P1 级缺陷）**：
   - `SubscriptionTemplate.isDefault` 与 `SystemSettings.defaultTemplateId` 处于分裂状态，在模板页设为默认不会同步系统设置，在系统设置页变更不会同步模板表；`TemplatesService.getDefault()` 甚至直接忽略了系统设置，导致前端呈现与订阅编译解析出现分歧。
5. **管理端体验原始且无预览调试（P2 级体验问题）**：
   - 管理员编辑模板时面对 5 个纯原生 HTML `<Textarea>`，手写数百行裸 JSON/YAML，极易因逗号、引号语法错误导致保存失败；
   - 缺少“实时配置渲染预览”功能，管理员调整过滤规则后无法即时查看编译出的实际 YAML/JSON，必须通过外部客户端试错；缺乏“复制/克隆模板”基础能力。

---

## 🏗️ 核心架构设计与技术契约

### 1. 语义化 DNS 配置契约与双端编译映射
在数据层将 `dnsConfig` 统一升级为平台语义化抽象（同时通过升级脚本迁移存量旧配置）：
```typescript
export interface SemanticDnsConfig {
  enable?: boolean;
  fakeIp?: boolean;
  directDns?: string[]; // 国内直连 DNS 服务器，例如 ["https://223.5.5.5/dns-query", "223.5.5.5"]
  proxyDns?: string[];  // 远程代理 DNS 服务器，例如 ["https://1.1.1.1/dns-query", "8.8.8.8"]
  ipv6?: boolean;
}
```
* **编译为 Clash Meta (YAML)**：
  - `enhanced-mode: fake-ip`（fakeIp=true 时）；
  - `nameserver: [...directDns, ...proxyDns]`；
  - `fallback: [...proxyDns]`；
  - `fallback-filter: { geoip: true, geoip-code: "CN", ipcidr: ["240.0.0.0/4"] }`。
* **编译为 Sing-box 1.8+ (JSON)**：
  - `servers`:
    - `{ "tag": "dns_direct", "address": directDns[0], "detour": "direct" }`
    - `{ "tag": "dns_proxy", "address": proxyDns[0], "detour": primaryGroup }`
    - `{ "tag": "dns_fakeip", "address": "fakeip" }`
  - `rules`:
    - `{ "outbound": "any", "server": "dns_direct" }`
    - `{ "rule_set": ["geosite-cn"], "server": "dns_direct" }`
    - `{ "query_type": ["A", "AAAA"], "server": "dns_fakeip" }`
  - `fakeip: { "enabled": true, "inet4_range": "198.18.0.0/15" }`
  - `strategy: "prefer_ipv4"`, `independent_cache: true`。

### 2. 规则集扩展与双端 Rule-Set 协同生成契约
规则集数组项支持**内联规则 (Inline)** 与**远程规则集 (Remote Rule-Set)**：
```typescript
export interface TemplateRuleItem {
  name: string;
  type: 'domain-suffix' | 'domain-keyword' | 'ip-cidr' | 'geosite' | 'match' | 'remote-rule-set';
  target: string;              // 目标策略组或 DIRECT / REJECT
  enabled?: boolean;
  rules?: string[];            // 内联规则值
  url?: string;                // Clash 远程规则提供者 URL
  singboxUrl?: string;         // Sing-box 远程二进制 SRS 或 JSON URL
  format?: 'binary' | 'source'; // 远程规则格式
}
```
* **编译为 Clash**：
  - 若为 `remote-rule-set`，自动在顶层注入 `rule-providers.<name>`（`type: http`, `behavior: domain/ipcidr`, `interval: 86400`），并在 `rules` 中生成 `RULE-SET,<name>,<target>`。
* **编译为 Sing-box**：
  - 若为 `remote-rule-set` 或引用 `geosite`，自动在顶层 `route.rule_set` 中追加 `{ "tag": <tag>, "type": "remote", "format": "binary", "url": <url>, "download_detour": "direct" }`；
  - 规则区生成 `{ "rule_set": [<tag>], "outbound": <target> }`，彻底终结客户端缺失声明崩溃问题。

### 3. 策略组结构化多维过滤算法
策略组对象扩展结构化属性：
```typescript
export interface TemplateProxyGroupConfig {
  name: string;
  type: 'select' | 'url-test' | 'fallback' | 'load-balance';
  proxies?: string | string[]; // "all" | "$nodes" | ["DIRECT", "REJECT", ...]
  filter?: string;             // 节点名/Tag 正则表达式（向下兼容）
  includeTags?: string[];      // 必须包含的线路标签 (Line.tags)
  excludeTags?: string[];      // 必须排除的线路标签
  protocols?: string[];        // 限定协议类型 (ProtocolType)
  maxRate?: number;            // 最高流量倍率 (Line.trafficRate)
  url?: string;
  interval?: number;
  tolerance?: number;
}
```
* **过滤匹配算法 (`matchesProxyFilter`)**：
  - 首先校验 `filter` 正则；
  - 若配置了 `includeTags`，条目所属线路标签必须包含指定标签；
  - 若配置了 `excludeTags`，条目所属线路标签不能包含指定标签；
  - 若配置了 `protocols`，条目协议类型必须命中列表；
  - 若配置了 `maxRate`，条目倍率必须小于等于该阈值；
  - 多条件取逻辑**与 (AND)** 运算。

### 4. 默认模板原子同步状态机
* 当调用 `TemplatesService.update(id, { isDefault: true })` 或 `create({ isDefault: true })`：
  - 模板表内执行 `updateMany({ data: { isDefault: false } })`；
  - 联动调用 `SettingsService.updateSettings({ defaultTemplateId: id })`。
* 当管理员在系统设置页变更 `defaultTemplateId`：
  - `SettingsService` 联动执行事务，将目标模板设为 `isDefault: true`，其余模板取消默认。
* `SubscriptionService.resolveTemplate` 统一解析优先级：
  `Plan.template` -> `SettingsService.defaultTemplateId` -> `findFirst(isDefault: true)` -> `undefined`。

### 5. 渲染预览仿真架构 (Preview API)
* `POST /api/admin/subscription-templates/preview`
  - **请求入参**：`{ format: 'clash' | 'singbox', template: Partial<CreateTemplateDto> }`。
  - **仿真上下文加载机制**：
    1. 优先从数据库查询所有状态为 `ACTIVE` 且配置了公共入站端口的真实生效线路（`SubLine`）；
    2. 若系统为初始环境、没有任何可用线路，自动回退至内置的 **全协议标准 Mock 节点池**（涵盖香港/日本/美国，包含 VLESS Reality, Hysteria2, Trojan, Shadowsocks, VMess 等主流协议各 1~2 条）；
    3. 构建虚拟仿真凭证，调用编译引擎生成最终输出。
  - **返回体**：
    ```json
    {
      "format": "clash",
      "content": "mixed-port: 7890\n...",
      "stats": { "totalNodes": 12, "matchedNodes": 12, "proxyGroupsCount": 8, "rulesCount": 24 },
      "warnings": []
    }
    ```

### 6. 前端双模工作台与预览抽屉设计
* 基于已有的 `@radix-ui/react-tabs` 将弹窗拆分为 5 个选项卡：
  - 🗂️ **【基本信息】**：模板名称、描述、设为默认 Switch；
  - 🧭 **【策略组设计】**：
    - **可视化卡片模式**：策略组卡片列表，可增删重排，下拉选择类型（select, url-test, fallback, load-balance），勾选线路标签，设定正则，限定协议；
    - **源码模式 (CodeMirror)**：一键切换为 JSON 源码视图，双向实时同步与校验；
  - 🛡️ **【分流规则】**：
    - **可视化卡片模式**：内联规则与远程 Rule-Set 列表，目标策略组下拉选择，快捷勾选内置权威规则集；
    - **源码模式 (CodeMirror)**：JSON 源码视图；
  - 🌐 **【DNS 与高级覆写】**：
    - 语义化 DNS 开关、国内/国外 DNS 列表；
    - 集成 CodeMirror 的 Clash YAML 顶层覆写与 Sing-box JSON 顶层覆写输入区；
  - 👁️ **【实时渲染预览】**：
    - 弹窗内直接提供快速预览 Tab，亦可在外部列表卡片点击“快速预览”唤起独立抽屉；
    - 支持 Clash YAML 与 Sing-box JSON 一键切换，具备代码高亮、行号、一键复制到剪贴板与命中节点统计。

---

## 📋 里程碑与详细任务清单

### 里程碑 1：核心编译适配引擎重构与数据迁移 (Phase 1)
- [x] 任务 1.1: **语义化 DNS 编译适配器与双端转译**
  - 在 `apps/server/src/subscription/builders.ts` 中实现 `buildSemanticClashDns()` 与 `buildSemanticSingboxDns()`。
  - 支持 `enhanced-mode: fake-ip` 与 Sing-box 1.8+ `servers/rules/fakeip` 链式结构。
- [x] 任务 1.2: **双端 Rule-Set 规则适配器与顶层依赖自动注入**
  - 在 `builders.ts` 中实现 `buildClashRuleProviders()` 与 `buildSingboxRouteRuleSets()`。
  - 自动向 Clash 生成 `rule-providers` 与 `RULE-SET` 规则；
  - 自动向 Sing-box 生成顶层 `route.rule_set` 远程定义与 `rule_set: [tag]` 规则。
- [x] 任务 1.3: **策略组结构化过滤算法与类型扩展**
  - 在 `builders.ts` 中升级 `matchesProxyFilter()`：支持 `includeTags`、`excludeTags`、`protocols`、`maxRate` 多条件复合匹配。
  - 补全策略组类型映射：Clash 支持 `fallback`、`load-balance`；Sing-box 对应转译并设置合理健康检查探测。
- [x] 任务 1.4: **存量数据规范化升级脚本与内嵌模板刷新**
  - 彻底重构 `apps/server/prisma/default-template.js`，升级内置全能模板为语义化 DNS 与现代 Rule-Set 结构。
  - 编写启动数据规范化迁移方法 `migrateLegacyTemplates(prisma)`，在服务启动时自动扫描并平滑转换存量旧格式 JSON。
- [x] 任务 1.5: **核心编译引擎单元测试矩阵**
  - 在 `apps/server/src/subscription/builders.template-groups.spec.ts` 中编写测试套件：
    - 验证 Sing-box DNS 输出符合 1.8+ 规范，无 Clash 废弃字段；
    - 验证包含 `geosite` 或 `remote-rule-set` 时，Sing-box 正确生成顶层 `route.rule_set` 且规则引用一致；
    - 验证 Clash 包含远程规则集时，正确输出顶层 `rule-providers` 与 `RULE-SET`；
    - 验证策略组按 tags、protocols、maxRate 复合过滤的正确性。

### 里程碑 2：默认模板状态原子同步与配置预览 API (Phase 2)
- [x] 任务 2.1: **默认模板双向原子同步状态机**
  - 在 `apps/server/src/subscription-templates/templates.service.ts` 中注入 `SettingsService`：在设置或取消默认模板时联动更新 `SystemSettings`；
  - 在 `apps/server/src/system/settings.service.ts` 中增加与 `SubscriptionTemplate` 的联动事务；
  - 重构 `getDefault()`，优先以统一的权威规则查询当前生效的默认模板。
- [x] 任务 2.2: **订阅链接动态调试参数支持**
  - 在 `apps/server/src/subscription/subscription.service.ts` 与控制器中，扩展订阅端点支持可选 query 参数 `?templateId=<uuid>`，方便调试指定模板的分流效果。
- [x] 任务 2.3: **配置渲染预览 API (`POST /admin/subscription-templates/preview`)**
  - 创建 `apps/server/src/subscription-templates/dto/preview-template.dto.ts`。
  - 在 `templates.service.ts` 中实现 `previewTemplate(dto)`：
    - 查询当前系统活跃的真实可用线路（`SubLine`）；
    - 若真实线路为空，自动载入预设的标准多协议 Mock 节点池；
    - 虚拟测试用户凭证，调用 `buildClashYaml` 或 `buildSingboxJson` 执行真实编译；
    - 返回最终编译产物、统计指标与语法错误警告。
  - 在 `templates.controller.ts` 中暴露端点与 Swagger 声明。
- [x] 任务 2.4: **模板克隆接口 (`POST /admin/subscription-templates/:id/duplicate`)**
  - 在 `templates.service.ts` 与控制器中增加模板复制逻辑，自动命名为 `"${template.name} (副本)"`，重置 `isDefault: false` 并保存。
- [x] 任务 2.5: **服务层单元测试补全**
  - 编写 `templates.service.spec.ts` 覆盖预览接口、克隆接口与状态双向同步逻辑。

### 里程碑 3：前端现代化工作台与实时渲染预览 (Phase 3)
- [x] 任务 3.1: **前端 API Hook 与 Mutation 扩展**
  - 在 `apps/web/src/pages/admin/templates/use-templates.ts` 中增加 `useTemplatePreview()` 与 `useDuplicateTemplate()` 请求钩子。
- [x] 任务 3.2: **5-Tab 结构化工作台弹窗重构**
  - 重构 `apps/web/src/pages/admin/templates/components/template-form-dialog.tsx`：
    - 引入 `@radix-ui/react-tabs` 构建 5 大选项卡；
    - 规范化表单数据流（基本信息、策略组、规则集、DNS、高级覆写）。
- [x] 任务 3.3: **策略组与分流规则“可视化卡片 + CodeMirror 源码”双模组件**
  - 新建可视化策略组编辑列表与卡片表单项（类型下拉、标签 Tag 勾选、协议多选、倍率限制）；
  - 提供一键切换至 CodeMirror 源码视图模式，实现格式化、语法校验与双向数据流同步。
- [x] 任务 3.4: **实时渲染预览抽屉组件**
  - 新建 `apps/web/src/pages/admin/templates/components/template-preview-drawer.tsx`：
    - 挂载 CodeMirror 渲染只读 YAML / JSON 代码；
    - 顶部提供格式切换 Tab（Clash / Sing-box）、节点匹配统计徽标、一键复制配置按钮。
- [x] 任务 3.5: **模板列表卡片交互增强**
  - 在 `apps/web/src/pages/admin/templates/index.tsx` 的卡片操作区，补充“复制模板”、“快速预览”按钮，并完善删除限制提示。
- [x] 任务 3.6: **响应式移动端自适应与视觉规范核验**
  - 按照 `docs/FRONTEND_UI_GUIDELINES.md` 核验移动端弹窗/抽屉展示、浅色与暗色模式主题适配。

### 里程碑 4：规约同步、质量门禁与发布准备 (Phase 4)
- [x] 任务 4.1: **文档同步更新（强制门禁映射）**
  - 同步更新 `docs/API_AND_PROTOCOLS.md`：记录 `/preview`、`/:id/duplicate` 接口与 `?templateId` 调试参数。
  - 同步更新 `docs/DATA_MODELS.md`：更新 `SubscriptionTemplate` 的 JSON 结构语义规约。
  - 同步更新 `docs/FRONTEND_UI_GUIDELINES.md` 与 `docs/VISUAL_VERIFICATION.md`：更新 UI-18（模板列表）、UI-19（模板编辑器与预览抽屉）台账。
  - 在 `CHANGELOG.md` 顶部的 `[Unreleased]` 缓冲区记录完整变更。
- [x] 任务 4.2: **五合一质量门禁全绿验证**
  - 在 Git Bash 中执行 `pnpm gate`：
    - `pnpm gate:version`（版本号合规性）；
    - `pnpm gate:docs`（文档治理与规划索引一致性）；
    - `pnpm gate:server`（NestJS TypeScript、ESLint 与 Jest 测试全绿）；
    - `pnpm gate:web`（React TypeScript、ESLint 与 Vite 构建全绿）；
    - `pnpm gate:agent`（Go 守护进程门禁全绿）。

---

## 📂 变更文件清单预估 (Impacted Files Checklist)

```
apps/server/
├── prisma/
│   └── default-template.js                                 # [MODIFY] 升级内置默认模板为语义化 DNS 与现代规则集
├── src/
│   ├── subscription/
│   │   ├── builders.ts                                     # [MODIFY] 语义化 DNS、Rule-Set 自动生成、策略组多维过滤
│   │   ├── builders.template-groups.spec.ts                # [MODIFY] 扩充编译引擎单元测试矩阵
│   │   └── subscription.service.ts                         # [MODIFY] ?templateId 调试支持与模板回退逻辑统一
│   ├── subscription-templates/
│   │   ├── dto/
│   │   │   ├── create-template.dto.ts                      # [MODIFY] 扩展策略组与规则结构类型定义
│   │   │   ├── update-template.dto.ts                      # [MODIFY] 扩展更新 DTO
│   │   │   └── preview-template.dto.ts                     # [NEW]    新增预览请求 DTO
│   │   ├── templates.controller.ts                         # [MODIFY] 暴露 /preview 与 /:id/duplicate 路由
│   │   ├── templates.service.ts                            # [MODIFY] 双默认同步、数据规范化、预览与克隆
│   │   └── templates.service.spec.ts                       # [MODIFY] 补充服务层单元测试
│   └── system/
│       └── settings.service.ts                             # [MODIFY] 默认模板变更时原子联动模板表
apps/web/
├── src/
│   └── pages/admin/templates/
│       ├── index.tsx                                       # [MODIFY] 增加复制模板与独立预览抽屉入口
│       ├── use-templates.ts                                # [MODIFY] 增加 preview / duplicate 请求 Mutation
│       ├── components/
│       │   ├── template-form-dialog.tsx                    # [MODIFY] 重构为 5-Tab 双模（可视化卡片 + CodeMirror）工作台
│       │   ├── template-groups-editor.tsx                  # [NEW]    策略组可视化卡片编辑组件
│       │   ├── template-rules-editor.tsx                   # [NEW]    分流规则可视化卡片编辑组件
│       │   └── template-preview-drawer.tsx                 # [NEW]    实时渲染预览抽屉组件
docs/
├── plans/
│   └── subscription-template-full-refactor.md              # [NEW]    本规划文件
├── API_AND_PROTOCOLS.md                                    # [MODIFY] 记录模板新 API 与动态调试参数
├── DATA_MODELS.md                                          # [MODIFY] 记录模板数据结构语义抽象
├── FRONTEND_UI_GUIDELINES.md                               # [MODIFY] 记录模板工作台与预览抽屉交互规范
├── VISUAL_VERIFICATION.md                                  # [MODIFY] 更新 UI-18 与 UI-19 台账
└── CHANGELOG.md                                            # [MODIFY] [Unreleased] 缓冲区变更记录
```

---

## 🧪 验收标准与测试用例矩阵

| 编号 | 测试场景 | 核心输入 / 操作 | 预期验证指标 |
| :--- | :--- | :--- | :--- |
| **TC-01** | Sing-box DNS 合规性 | 导出格式为 Sing-box，模板配置 `directDns` 与 `proxyDns` | 输出 JSON 包含合法 `servers`、`rules`、`fakeip` 对象；绝无 `enhanced-mode` 等 Clash 专有键 |
| **TC-02** | Sing-box RuleSet 报错修复 | 模板包含 `geosite` 或 `remote-rule-set` 规则 | 导出的 Sing-box JSON 顶层 `route.rule_set` 自动存在对应 remote 声明，现代 Sing-box 客户端加载零报错 |
| **TC-03** | Clash Rule Providers 注入 | 模板配置 `type: "remote-rule-set"` 与对应 URL | 导出的 Clash YAML 顶层自动生成 `rule-providers` 声明，且 rules 列表包含 `RULE-SET` 引用 |
| **TC-04** | 策略组复合过滤 | 策略组配置 `includeTags: ["iplc"]`, `protocols: ["VLESS"]`, `maxRate: 1.0` | 仅同时满足标签、协议、倍率条件的节点被拉入该组，其他节点不入组 |
| **TC-05** | 默认模板原子双向同步 | 1. 在模板页将模板 A 设为默认<br>2. 在系统设置页将默认模板改为模板 B | 1. 系统设置 `defaultTemplateId` 变为模板 A ID<br>2. 模板 B 变为 `isDefault=true`，模板 A 变为 `false` |
| **TC-06** | 预览接口仿真保底 | 在无可用活跃线路的全新安装主控中调用 `/preview` | 接口平稳返回内置标准 Mock 节点池编译的产物，`stats.totalNodes > 0`，不抛 500 异常 |
| **TC-07** | 实时渲染预览与复制 | 打开编辑弹窗，调整规则后点击预览 | 快速生成 Clash/Sing-box 高亮视图，一键复制可用，节点命中数准确反映 |
| **TC-08** | 模板克隆复制 | 在列表页对模板 A 点击“复制” | 新增名称为 `"${name} (副本)"` 的模板，除 `isDefault: false` 外各项配置完整继承 |
| **TC-09** | 质量门禁全绿 | 执行 `pnpm gate` | 版本、文档、服务端、前端、Agent 五大门禁 100% 通过 |
