# 前端 UI 与设计规范 (Frontend UI & Design Guidelines)

本文档定义 **RiriCloud** 前端（`apps/web`）的 UI 设计规范、组件体系、分层架构与交互标准。
本规范以 **shadcn/ui 官方生态标准** 为基准，旨在保持面板现代化、无边框极简质感（Modern Minimalist Dashboard）的同时，确保代码的高度可维护性与一致性。

---

## 1. 设计哲学与核心原则

1. **拥抱官方标准生态**：以 shadcn/ui 官方推荐的实现范式为唯一基准，杜绝“造轮子”与随意引入非标准三方库。
2. **强制使用原子组件**：严禁在业务页面中随意使用原生 HTML 交互标签（如 `<button>`、`<input>`、`<select>`），必须统一使用 `@/components/ui/` 导出的原子组件。
3. **数据驱动与类型安全**：表单强制通过 Zod Schema 进行端到端运行时类型校验；表格与图表遵循强类型定义。
4. **极简精致与无障碍优先**：遵循 Radix UI 无障碍规范（WAI-ARIA），采用 New York 紧凑精致风格，微交互清晰流畅。

---

## 2. 视觉体系与主题配置 (Theme & Tokens)

### 2.1 风格与基础预设

RiriCloud 采用 shadcn/ui 的 **New York** 风格预设，以更紧凑的内边距、更清晰的边框与更细腻的微排版适配管理后台场景：

| 维度 | 规范选型 | 说明 |
| :--- | :--- | :--- |
| **风格预设 (Style)** | `New York` | 紧凑、细腻边框、适合数据密集型 Dashboard |
| **基础色系 (Base Color)** | `Zinc` (中性冷灰) | 纯净、克制，突出核心业务状态数据 |
| **圆角弧度 (Radius)** | `0.5rem` (`8px` / `rounded-lg`) | 保持现代感与干练感 |
| **主题切换** | 浅色 (Light) / 暗黑 (Dark) / 跟随系统 (System) | 基于 `next-themes` 驱动，默认跟随操作系统偏好；顶栏按钮弹出三态下拉菜单（shadcn 官方主题切换范式），触发按钮图标跟随所选模式（Sun / Moon / Monitor）而非最终生效外观，菜单内当前态以 `Check` 图标标识，勾选「跟随系统」可恢复系统偏好 |

### 2.2 语义色彩与状态色阶规范

全站颜色必须通过 Tailwind 语义变量（如 `bg-background`、`text-foreground`、`border-border`）使用，严禁在业务代码中硬编码 HEX 颜色值（如 `#10b981`）。

业务状态语义对应如下：

| 业务状态 | 语义 Token | 视觉效果（Light / Dark） | 典型应用场景 |
| :--- | :--- | :--- | :--- |
| **正常 / 在线 / 成功** | `success` | `text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20` | 节点在线、同步成功、服务正常、已激活 |
| **警告 / 负载过高 / 临界** | `warning` | `text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20` | 流量达 80%、CPU 负载高、证书即将过期 |
| **危险 / 离线 / 错误 / 封禁** | `destructive` | `text-destructive bg-destructive/10 border-destructive/20` | 节点离线、用户被封禁、鉴权失败、删除操作 |
| **未启用 / 闲置 / 次要** | `secondary` / `muted` | `text-muted-foreground bg-muted border-border` | 未配置节点、未激活用户、无日志 |

### 2.3 全局基础控件与微交互规范 (Scrollbar & Input Controls)

1. **滚动条美化规范 (Scrollbar Standard)**
   - 全站所有发生溢出滚动的容器（弹窗、侧边栏、表格、代码预览区等）统一采用极简细窄圆角设计，严禁出现 Windows 浏览器原生粗灰色轨道与上下箭头按钮。
   - 滚动条颜色基于当前主题变量 `--muted-foreground` 自适应计算（透明背景轨道 + `muted-foreground/0.25` 半透明圆角滑块，悬停提亮至 `0.45`），在明暗主题下无缝融入。
   - 规范样式统一定义于 `apps/web/src/index.css`（WebKit `width: 6px` + 标准 `scrollbar-width: thin`）。

2. **数字输入框规范 (Number Input Spinners)**
   - 全局隐藏 `<input type="number">` 的浏览器原生微调上下箭头（Spinners），由 `index.css` 全局重置（WebKit `-webkit-appearance: none` + Firefox `-moz-appearance: textfield`）。
   - 保持数字输入框（端口、速率、权重等）与普通文本输入框完全一致的对齐排版与间距。

3. **页面与卡片进场动效规范 (Page & Card Transition)**
   - 全站子页面容器（`PageContainer`）与独立全屏卡片（`LoginPage` / `RegisterPage`）统一配置 `300ms ease-out` 的微景深淡入动效（`animate-in fade-in-0 zoom-in-[0.985] duration-300 ease-out`）。
   - 严禁生硬无动效的瞬切，同时杜绝产生 `translateY` 纵向位移以防止触发浏览器滚动条瞬时闪烁与页面抖动。

---

## 3. 组件分层与目录组织架构

`apps/web/src/components` 目录按严格分层管理：

```
apps/web/src/
├── components/
│   ├── ui/                 # 【底层原子组件】shadcn CLI 生成并维护，严禁侵入业务逻辑
│   │   ├── button.tsx
│   │   ├── input.tsx
│   │   ├── dialog.tsx
│   │   ├── form.tsx
│   │   ├── sidebar.tsx
│   │   └── ...
│   ├── shared/             # 【业务通用复合组件】全站多模块复用的高阶组件
│   │   ├── page-container.tsx   # 统一页面容器与页头插槽
│   │   ├── data-table.tsx       # TanStack Table 统一封装组件
│   │   ├── stat-card.tsx        # 统计指标卡片
│   │   ├── empty-state.tsx      # 空状态插槽组件
│   │   ├── copy-button.tsx      # 订阅链接一键复制按钮
│   │   ├── line-card.tsx        # 统一线路展示卡片（compact/full 双变体）
│   │   ├── announcement-card.tsx # 用户订阅页系统公告卡片
│   │   ├── client-guide-card.tsx # 客户端三步使用指引
│   │   └── traffic-badge.tsx    # 流量单位格式化与状态胶囊
│   └── layout/             # 【全局框架布局】
│       ├── app-layout.tsx       # 主控端侧边栏 + 主内容区 Inset 总布局
│       ├── app-sidebar.tsx      # 左侧菜单导航与品牌头部 (h-14)
│       ├── app-header.tsx       # 顶部全局微操作栏 (h-14，位于主大卡片上方)
│       ├── user-menu.tsx        # 顶栏独立小巧用户头像与退出菜单
│       └── theme-toggle.tsx     # 顶栏小巧明暗主题三态切换（浅色/深色/跟随系统）
├── pages/                  # 【页面级视图组件】仅负责数据获取、状态编排与子组件组装
│   ├── nodes/
│   ├── user/subscription/
│   ├── users/
│   └── settings/
```

---

## 4. 强制使用规范与禁止清单 (Hard Constraints & Banned Practices)

### 4.1 强制规范 (Do's)

1. **通过 CLI 安装原子组件**：基础组件一律通过 `pnpm dlx shadcn@latest add <component>` 生成至 `src/components/ui/`，保持标准实现。
2. **统一使用 `cn()` 合并样式**：使用 `clsx` + `tailwind-merge` 导出的 `cn(...)` 工具函数处理条件样式，避免类名冲突。
3. **复合组件采用 CVA 模式**：所有具有变体（variant / size）属性的自定义组件，必须基于 `class-variance-authority` (cva) 编写。
4. **唯一图标库使用**：全站仅允许引入 `lucide-react`，图标统一使用以下尺寸阶梯：
   - **Micro (14px / `size-3.5`)**：徽标内小图标、表格行内辅助说明。
   - **Regular (16px / `size-4`)**：按钮内部图标、表单输入框前后缀、常规文本行。
   - **Medium (20px / `size-5`)**：卡片标题图标、导航菜单项图标。
   - **Large (24px / `size-6`)**：统计面板大卡片图标、状态占位图。
5. **操作区域层级统一**：表单中承载 `Switch`、`Checkbox` 或操作按钮的区域必须使用 shadcn/ui `FormItem` / `Card` 结构；普通页面按既有卡片规范保持层级一致，线路编辑弹窗使用平面 `FormItem` 与 `Separator`，不增加边框容器或嵌套卡片。

### 4.2 严格禁止清单 (Don'ts)

| # | 禁止行为 | 正确做法 | 违规判定 |
| :-: | :--- | :--- | :--- |
| **B1** | 业务代码中直接手写 `<button>` 标签 | 必须 `import { Button } from "@/components/ui/button"` | ❌ 立即打回 |
| **B2** | 业务代码中手写 `<input>`、`<select>`、`<textarea>` | 必须使用 `@/components/ui/input` 等对应 shadcn 组件 | ❌ 立即打回 |
| **B3** | 引入 Ant Design / Element / MUI / Mantine 等外部重型 UI 库 | 统一使用 shadcn/ui 原生体系 | ❌ 立即打回 |
| **B4** | 在 Tailwind 类名中手写硬编码 HEX 色值（如 `bg-[#1a1a1a]`） | 必须使用语义变量（如 `bg-background`、`text-card-foreground`） | ❌ 立即打回 |
| **B5** | 高危破坏性操作仅用简单 `window.confirm` 或直接执行 | 必须使用 `@/components/ui/alert-dialog` 提供二次拦截弹窗 | ❌ 立即打回 |
| **B6** | 表单通过裸 `useState` 分散管理字段与手动判断报错 | 必须使用 `react-hook-form` + `zod` + shadcn `<Form>` | ❌ 立即打回 |
| **B7** | 内部页面跳转手写原生 HTML `<a>` 标签 | 站内导航必须使用 `react-router-dom` 的 `<Link>` 或 `<NavLink>`，严禁原生 `<a>` 引发整页刷新与白屏闪烁 | ❌ 立即打回 |

---

## 5. 表单与数据校验标准 (Form & Validation System)

所有录入、编辑与配置表单均须遵守：

```tsx
// 标准表单结构范式示例
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const nodeFormSchema = z.object({
  name: z.string().min(2, "节点名称至少2个字符").max(32, "节点名称最多32个字符"),
  serverHost: z.string().min(1, "请输入节点主机域名或IP"),
  serverPort: z.coerce.number().int().min(1).max(65535, "端口范围为 1-65535"),
});

type NodeFormValues = z.infer<typeof nodeFormSchema>;

export function NodeCreateForm({ onSubmit }: { onSubmit: (data: NodeFormValues) => void }) {
  const form = useForm<NodeFormValues>({
    resolver: zodResolver(nodeFormSchema),
    defaultValues: { name: "", serverHost: "", serverPort: 443 },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>节点名称</FormLabel>
              <FormControl>
                <Input placeholder="例如：HK-Premium-01" {...field} />
              </FormControl>
              <FormDescription>用于客户端订阅展示的易读名称</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        {/* 更多字段... */}
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? "正在保存..." : "创建节点"}
        </Button>
      </form>
    </Form>
  );
}
```

---

## 6. 全局交互反馈体系 (Feedback & Notifications)

### 6.1 Toast 通知标准 (`sonner`)

全站操作结果提示唯一使用 `sonner`，严禁使用原生 `alert()` 或自写悬浮条：

```tsx
import { toast } from "sonner";

// 成功反馈
toast.success("节点配置下发成功", { description: "Agent 已在 1.2s 内完成热重载" });

// 错误反馈
toast.error("操作失败", { description: error.message });

// 异步加载状态绑定
toast.promise(reloadAgentPromise, {
  loading: "正在向边缘节点发送指令...",
  success: "节点已重载",
  error: "节点重载失败，请检查 Agent 连接状态",
});
```

### 6.2 弹窗边界与选用矩阵

| 场景需求 | 采用组件 | 规范要求 |
| :--- | :--- | :--- |
| **常规数据录入 / 快速编辑** | `Dialog` 或 `Sheet` (抽屉) | 宽表单优先使用右侧 `Sheet` 抽屉，简短录入用居中 `Dialog` |
| **危险/破坏性操作拦截** | `AlertDialog` | 删除节点、清空日志、重置 Token、删除用户等必须使用，确认按钮标红（`variant="destructive"`） |
| **轻量级气泡说明 / 快捷提示** | `Tooltip` / `Popover` | 图标按钮悬浮说明必须加 `Tooltip`；复杂筛选器用 `Popover` |

弹窗尺寸统一使用 `@/components/ui/dialog` 的 `DialogContent` 变体：普通数据表单使用默认 `2xl`，线路和模板等复杂编辑使用 `wide` `3xl`，确实简单的内容才使用 `compact` `lg`。所有弹窗在移动端使用视口两侧留白并限制最大高度，内容超出时在弹窗内部滚动；破坏性确认继续使用固定的 `AlertDialog` `lg` 宽度。

响应式弹窗统一通过 `ResponsiveDialog` / `ResponsiveDialogContent` 承载：桌面端保持 Dialog，`767px` 及以下切换为右侧全高 Sheet，宽度占满视口并在内容区滚动。移动端导航使用 `SidebarProvider` 的 `openMobile` 状态与 Sheet 抽屉，路由切换后关闭抽屉；不得为每个业务页面重复实现媒体查询和抽屉状态。

### 6.3 加载占位 (Skeleton) 与数据平滑补间过渡

1. **初次加载**：页面加载与卡片首次数据请求中，禁止使用全屏巨型 Spinner 打断用户体验，必须使用 `Skeleton` 还原真实 UI 的骨架结构：
```tsx
import { Skeleton } from "@/components/ui/skeleton";

export function NodeCardSkeleton() {
  return (
    <div className="flex items-center space-x-4 p-4 border rounded-lg">
      <Skeleton className="size-10 rounded-full" />
      <div className="space-y-2 flex-1">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
  );
}
```

2. **参数/时间颗粒度切换（防闪屏约束）**：在 Tabs、筛选器、分页或时间跨度（如今日/24h/7d/30d）切换时，严禁使用粗粒度的 `isPending ? <Skeleton /> : ...` 导致整页 DOM 与图表被硬性卸载并闪烁骨架屏；必须配合 TanStack Query 的 `placeholderData: keepPreviousData`，条件渲染仅在首次无数据时触发骨架屏（`isPending && !data`），已有数据更新时保持原有视图并施加微透明过渡（如 `isFetching && 'opacity-85'`），图表通过数据补间平滑更新。

---

## 7. 布局结构与页面容器标准 (Layout & Container)

### 7.1 全局架构与 Inset 沉浸式卡片布局

1. **左侧导航栏 (`AppSidebar`)**：采用 shadcn/ui 官方 `Sidebar` (v4) `variant="inset"` 范式，无右侧贯穿硬分割线（`border-r-0`），与最外层底层底色（`bg-sidebar`）自然融为一体。顶部品牌区高度固定为 `h-14`，底部展示极简版本号；移动端使用左侧 Sheet 抽屉，支持遮罩、Escape 和导航后自动关闭。
2. **顶部全局操作栏 (`AppHeader`)**：位于主内容大卡片上方，高度为 `h-14`，与左侧品牌 Logo 水平高度严格齐平（1:1 对齐）。右侧放置紧凑的微操作按钮组：`ThemeToggle`（明暗三态图标切换）与 `UserMenu`（首字母圆形头像与个人中心下拉菜单）。移动端自动展示抽屉折叠触发器与站点名。
3. **主工作区浮雕大卡片 (`<main>` / Inset Canvas)**：主工作区位于顶部操作栏下方，桌面端（`md:` 及以上）应用 Inset 样式（`md:mr-4 md:mb-4 md:rounded-xl md:border md:border-sidebar-border/40 md:shadow-sm md:bg-background`），页面标题（`PageHeader`）直接作为大卡片顶部内容起始点，避免卡片内部被任何多余横线切断。
4. **明暗双模式三层阶梯景深 (Three-Tier Surface Elevation)**：
   - **L0 底层画框**：`bg-sidebar`（浅色 `zinc-100/60` / 深色 `zinc-950`），顶栏与侧边栏沉浸于底层；
   - **L1 主画布容器**：`main` 浮雕大卡片（浅色纯白 `bg-background` / 深色 `zinc-900`）；
   - **L2 业务内容卡片**：页面内 `Card`、表格、表单（`bg-card`，深色模式微提亮为 `zinc-850/60`），呈现细腻的浮雕凸起质感。
5. **页面容器组件 (`PageContainer`)**：所有子页面统一嵌套标准容器，保证全站间距与页头排版完全一致：

管理员侧边栏固定为 8 项：**用户管理、流量统计、节点管理、线路管理、证书管理、套餐管理、订阅模板、系统设置**。订阅履约操作属于用户管理的综合弹窗；旧地址 `/admin/subscriptions` 仅作为兼容入口重定向至 `/admin/users`，不得再次作为平级菜单展示。

```tsx
interface PageContainerProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

export function PageContainer({ title, description, actions, children }: PageContainerProps) {
  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">{title}</h2>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex items-center space-x-2">{actions}</div>}
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}
```

---

## 8. 数据展示：表格与图表规范

### 8.1 数据表格 (Data Table)
- 底层技术：`@tanstack/react-table` + `@/components/ui/table`。
- 必须具备：列排序（Sorting）、关键词搜索过滤（Filtering）、分页控件（Pagination）、行选择（Row Selection）与列显示切换（Column Visibility）。
- 空数据展示：使用 `@/components/shared/empty-state.tsx` 统一插画与引导按钮。
- 移动端保留完整字段与表格语义，表格外层使用 `overflow-x-auto`，横向滚动只允许发生在表格容器内，不得造成页面主体横向溢出；筛选工具栏在 `sm` 断点前必须允许换行。
- 表格及标签区域使用的 `Badge` 必须保持单行（`whitespace-nowrap`），多个 Badge 可作为完整单元在父级容器中换行，禁止将 chip 文本压缩成逐字竖排。

### 8.2 数据图表 (Data Charts)
- 底层技术：采用 shadcn/ui 官方 `Chart`（封装自 `Recharts`）。
- 色彩绑定：使用预设 CSS 变量 `--chart-1` ~ `--chart-5`，严禁在图表配置中写死十六进制色值，确保暗黑模式完美自适应。
- 交互提示：统一使用 `ChartTooltip` 与 `ChartTooltipContent` 保证悬浮卡片视觉风格与面板整体一致。
- 流量统计使用 `--chart-1` 表示下行、`--chart-2` 表示上行、`--chart-3` 表示计费流量、`--chart-4`/`--chart-5` 表示线路分布；速率图同时展示平均值与近似峰值，面积图必须保留连续零值时隙，避免数据空洞造成折线断裂。
- 字节数统一经过 `formatBytes` 格式化为 B / KB / MB / GB / TB / PB；时序图按小时或天显示 `displayTime`，Tooltip 同时展示上行、下行和当前合计。
- 管理员流量统计位于 `/admin/traffic`，时间范围切换使用紧凑 `Tabs`，线路明细在表格容器内横向滚动；页面明确标注节点网络吞吐不参与计费，用户管理操作列的“流量明细”使用 `Activity` 图标打开响应式下钻弹窗。

---

## 9. 扩展与自定义组件准则

节点运维视图的通信状态使用语义 Badge：在线 WS 显示“WS 在线”，在线 HTTP 显示“HTTP 轮询”，断开显示“离线”；状态旁应展示最近上报时间。详情页工具栏应提供内核重载、Agent 重启、网络探针、升级中心和安装命令；探针弹窗展示预设目标、延迟、丢包率、DNS 地址与错误详情，最近结果在高级运维 Tab 保留时间戳。探针、升级和重启等异步操作沿用 Dialog + Sonner，并在 HTTP 模式下通过任务状态查询给出完成或超时反馈，不在页面内直接使用裸 `fetch`。

如遇 shadcn/ui 官方未收录的特殊场景（例如：流量波形动效、节点拓扑连线图）：
1. **优先查找 Radix UI 原语**：在 Radix UI Primitive 之上使用 Tailwind CSS 进行包装。
2. **严格遵循规范**：组件接口需支持 `className`、`ref` 转发，样式使用 `cva` 维护。
3. **目录归属**：通用组件放入 `@/components/shared/`，页面专用组件就近放在 `pages/<module>/components/` 下。

---

## 10. 官方 CLI 与工程配置规范 (Official CLI & Setup)

依据 [shadcn/ui 官方在线文档](https://ui.shadcn.com/docs)，`apps/web` 采用标准的 `components.json` 配置与 CLI 工作流：

### 10.1 官方 `components.json` 标准配置

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.js",
    "css": "src/index.css",
    "baseColor": "zinc",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "iconLibrary": "lucide"
}
```

### 10.2 常用 CLI 工作流指令

```bash
# 初始化配置（若全新初始化）
pnpm dlx shadcn@latest init

# 批量安装 RiriCloud 核心原子组件
pnpm dlx shadcn@latest add button card dialog alert-dialog dropdown-menu form input select table badge tabs tooltip sheet skeleton progress chart sidebar sonner

# 检查本地组件与官方最新 Registry 的差异与更新
pnpm dlx shadcn@latest diff
```

### 10.3 统一类名工具函数 (`src/lib/utils.ts`)

```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

---

## 11. UI 视觉走查与验证规范 (Visual Verification & Index)

为了确保 UI 规范在后续功能演进中的一致性与无回归，系统建立了全量 UI 验证索引台账与变更感知机制：
- **全量 UI 索引台账**：覆盖现有业务页面、交互模态框及双主题状态；
- **变更感知映射**：根据前端源码文件路径变更自动判定受影响的 UI 范围；
- **按需触发与环境限定**：不作为 CI / 自动化门禁项，仅在用户要求时由 Antigravity Agent 执行走查。

完整规范、索引矩阵与执行 SOP 详见 [docs/VISUAL_VERIFICATION.md](VISUAL_VERIFICATION.md)。

## 12. 订阅业务页面规范 (Subscription UX)

v0.4.0 新增页面均位于已认证的 `AppLayout` 内，继续复用 `PageContainer`、`PageHeader`、Card、Badge、Progress、Dialog、AlertDialog、Select、Switch、Input、Textarea、Checkbox 和 Sonner：

| 页面 | 路由 | 主要内容 | 交互边界 |
| :--- | :--- | :--- | :--- |
| 套餐市场 | `/market` | 公开套餐网格、流量/期限/价格、流量重置策略、当前套餐标记 | 订购或升配必须经 AlertDialog 二次确认 |
| 我的订阅 | `/subscription` | 系统公告、当前套餐完整画像、流量进度、流量重置策略与下次重置时间、到期时间、Token 链接、可用线路紧凑列表、客户端使用指引 | 重置 Token 与取消订阅必须经 AlertDialog；无订阅时展示前往套餐市场的开通引导；消除冗余复制按钮，唯一使用输入框内联 CopyButton；提供前往套餐市场的升配入口；线路仅显示名称、协议类型、在线状态与倍率 |
| 套餐管理 | `/admin/plans` | 套餐卡片、上下架状态、流量重置策略、匹配模式、模板关联 | 删除使用中的套餐只显示服务端错误并建议下架 |
| 线路管理 | `/admin/lines` | 直连/中继线路表格、类型/状态/标签筛选、排序、批量启停、复制、解析测试 | 删除使用 AlertDialog；中继表单必须校验入口节点/端口/机制 |
| 线路编辑弹窗 | `/admin/lines`（点击新建/编辑） | 默认打开的“入站配置”页签与“线路高级设置”页签；入站页集中配置协议、入口节点、监听地址/端口、Transport、TLS/Reality/ACME 与协议专属参数，高级页配置出口拓扑、对外覆盖、倍率与线路属性 | 使用 Tabs 切换；页签内容全部平面展开，以分区标题和 Separator 区分层级，不使用 Accordion 或嵌套卡片；两页共享草稿并统一保存；覆盖开关默认关闭且保留已填值；协议切换清理不适用字段；标准 TLS/ACME 的 ALPN 使用按协议与传输层匹配的 Checkbox 多选，Reality 隐藏 ALPN；Reality 私钥留空表示保留服务端密钥；提交使用 React Hook Form + Zod |
| 订阅模板 | `/admin/templates` | 策略组、规则集、DNS 与 YAML/JSON 覆写编辑 | 内嵌默认模板显示“内嵌”标记，只保留编辑操作；普通模板删除使用 AlertDialog；JSON 采用 Textarea + Zod 预校验，服务端再次校验 |
| 用户管理 | `/admin/users` | 用户、角色、账号状态、当前套餐、订阅状态、流量进度与到期日 | 创建用户可选择初始套餐或暂不绑定；编辑用户通过双 Tab 管理账号安全与订阅，可用“无套餐”彻底移除订阅；订阅管理展示重置策略、下次重置时间并支持额外线路多选 |
| 个人中心 | `/profile` | 账户余额、充值卡密、余额流水、密码修改与用户代理凭据 | 余额与流水以人民币元展示；卡密兑换成功后刷新资产与账本；密码修改和代理凭据重置使用表单校验与危险操作确认 |
| 卡密管理 | `/admin/redeem-codes` | 批量生成、状态筛选、换行复制、有效期与未使用卡密作废 | 面额以元输入与展示，服务端按分保存；批量生成结果仅在弹窗中显示；作废使用 `AlertDialog` 二次确认 |
| 流量统计 | `/admin/traffic` | 时间范围 KPI、节点上/下行速率摘要与历史速率、线路占比和物理/计费流量排行 | 使用 `Tabs` 切换今日/24 小时/7 天/30 天；速率图表和表格在移动端单列或局部滚动 |
| 用户流量下钻 | `/admin/users`（操作列“流量明细”） | 用户配额画像、周期用量走势、线路占比和线路明细 | 桌面端宽屏 Dialog，`767px` 及以下为全高右侧 Sheet；无记录时使用统一 EmptyState |
| 节点升级 | `/admin/nodes/:id` | Sing-box/Agent 目标、当前/推荐版本、主控内置来源、自定义 URL、SHA-256 与主控导入 | 默认使用主控内置版本；自定义来源必须校验 URL/SHA-256；导入或下发中禁用对应按钮 |
| 证书管理 | `/admin/certificates` | TLS 证书列表、SAN 标签、签发者、有效期状态、关联线路与证书操作 | 证书列表使用表格快速扫描有效期与关联数；新建/编辑弹窗支持 PEM 粘贴或上传、解析预览与私钥查看；证书被线路引用时删除需明确拦截 |

### 12.1 用户管理综合弹窗

- 创建用户表单提供可选初始套餐；选择套餐后自动回填流量配额与有效期，选择“暂不绑定套餐”即可先创建无套餐账号，管理员仍可在提交前微调。
- 编辑用户弹窗使用 `Tabs` 分为「账号安全」和「订阅管理」：前者管理角色、启用/封禁与密码重置，后者管理套餐、状态、配额、已用流量、延期、重置策略摘要、下次重置时间、额外线路授权和 Token 重置。
- 订阅管理的套餐 Select 必须提供“无套餐（彻底取消订阅）”选项；已绑定订阅的用户选择该项并保存时必须经危险操作确认，确认后删除订阅实例并使旧 Token 失效。
- 套餐切换默认重置已用流量、状态恢复为 `ACTIVE` 并按套餐周期回填到期日；Token 重置必须经 `AlertDialog` 二次确认并明确旧链接立即失效。
- 流量重置策略使用明确的 `Select` 展示“不自动重置 / 自然月重置 / 订阅周期重置”；额外线路授权使用可滚动的 `Checkbox` 列表，隐藏、禁用或离线线路可以保留授权但应明确标注当前不可用。
- 用户列表优先展示套餐名称、订阅状态 Badge、流量进度条和到期日，并提供邮箱、角色、账号状态、订阅状态与套餐筛选。

### 12.2 页面与响应式要求

- 业务列表优先使用可扫描的网格或表格；套餐、模板和订阅条目保持统一的 `Card` 内边距，不在页面区块外再套装饰性卡片。
- 线路管理列表优先使用表格；管理员侧线路类型、倍率、标签、中继机制和底层健康状态必须可快速扫描，筛选条件使用 `Input` / `Select`，批量状态使用 `Checkbox` + `Button`。
- 线路编辑弹窗默认打开“入站配置”页签；协议、入口节点、监听地址/端口、Transport、TLS/Reality/ACME 和协议专属参数使用可视化控件，标准 TLS/ACME 的 ALPN 使用预设 Checkbox 多选，复杂请求头使用可增删的键值行编辑，不以 JSON 文本框作为主流程；各配置分区平面展开，不使用折叠或嵌套卡片。
- “线路高级设置”页签使用 `Switch` 控制对外地址、端口、SNI、Host 覆盖，并配置直连/中继拓扑、出口节点/端口、倍率、标签、等级、排序和启停状态；选择 `TARGET_LINE` 时改用目标落地线路 `Select`，只展示其他节点上的直连和可作为出站的协议，并显示目标节点/协议/端口摘要，隐藏手填出口字段；两页共享同一份 React Hook Form 草稿，点击一次保存统一提交。
- 线路入口端口可留空，由服务端在 `20000~29999` 范围分配五位端口；直连线路提交前应保持两端节点和端口一致。VLESS/Reality 提供密钥对生成按钮，私钥不从 API 回显。
- 大型模板 JSON/YAML 编辑区使用等宽字体、固定最小高度和弹窗内滚动，不能撑破桌面或移动端视口。
- 移动端列表转为单列，表单在 `sm` 断点前单列布局；表格保留完整字段并在表格容器内横向滚动，筛选器与操作按钮允许多行排列；普通复杂编辑使用全高 `Sheet`，危险操作继续使用 `AlertDialog`。
- 小型确认类 `AlertDialog` 保持默认居中弹窗尺寸；移动端使用基础圆角与左右各 `24px` 安全边距，Footer 覆盖为紧凑横向按钮，按钮使用自然宽度并保持确认操作靠右，取消按钮不得保留纵向堆叠间距。
- 数据加载使用与真实内容相近的骨架或紧凑加载态；我的订阅和管理员用户列表的流量数据每 5 秒自动重新请求，以便反映 Agent 心跳扣减结果；错误和变更结果统一通过 `sonner` 呈现，不使用原生 `alert`。
- Token 仅在已认证的用户/管理员视图显示；复制、重置后必须刷新相关 Query，避免界面继续展示旧链接。
- 账户余额、卡密面额和套餐价格在界面统一使用人民币元与两位小数格式；API 返回的余额/流水金额仍按分传输，前端通过统一格式化工具展示，禁止页面自行拼接金额单位。
- 个人中心的余额摘要、流水表格、密码修改和 UUID 重置保持同一页面信息层级；UUID 重置必须经 `AlertDialog` 二次确认，卡密兑换成功后清空输入并刷新余额、流水和当前用户信息。
- 卡密管理列表使用表格容器内横向滚动，批量生成弹窗使用 React Hook Form + Zod，生成结果使用等宽文本和 `CopyButton` 换行复制；未使用卡密作废必须经 `AlertDialog` 确认。

### 12.3 系统设置与全局品牌

- 系统设置页固定使用「基础与品牌 / 注册与用户 / 订阅与分发 / Agent 运维 / 安全与高级」五个 `Tabs`，Tab 图标统一固定为 `16px`，所有字段由 React Hook Form + Zod 管理，保存和重置操作使用 Sonner 提示结果。
- Logo、Favicon、站点名、公告、页脚和客服入口通过公开站点信息动态感知；登录页、已认证外壳和我的订阅页面共享同一 Query 缓存，不在页面内硬编码品牌文案。
- 公告横幅使用安全的 Markdown 子集渲染，支持本地收起记忆；订阅链接统一通过 `apps/web/src/lib/subscription-url.ts` 构造，优先使用配置的 `subscriptionBaseUrl`，没有有效订阅时必须引导进入套餐市场。
- 系统设置的“基础与品牌”页签提供 `publicBaseUrl` 全站访问 URL，用于主控生成 Agent 安装、升级和二进制下载地址；URL 字段旁提供“使用当前面板地址”快捷填充，并明确说明留空时服务端会按当前反向代理域名自动匹配。
- `subscriptionShortLinksEnabled=false` 时展示标准 `.../api/v1/sub/<UUID>`；开启时展示由 Nginx rewrite 提供的 `.../<UUID>`，`subscriptionBaseUrl` 中的 pathname 必须原样保留并与部署配置一致。系统设置开关旁必须明确提示“先配置 Nginx”，但不在前端检测代理状态。
- CSS 与 HTML/JS 头部代码编辑器使用 CodeMirror，代码区域保持固定高度和等宽字体；头部注入仅接受管理员配置，文案需提示只粘贴可信代码。
- CSS 与 HTML/JS 头部代码编辑器必须读取 `next-themes` 的 `resolvedTheme`，在浅色/深色模式下分别传入 CodeMirror 的 `light` / `dark` 主题，禁止依赖默认浅色主题造成深色页面出现白色编辑区；编辑器外层使用语义化背景与边框 Token。
- JWT 会话有效期的安全说明属于字段辅助信息，应直接使用 shadcn/ui 的 `FormDescription` 放在对应输入框下方，不应在外层设置卡片内再嵌套等宽提示卡片。
- 默认探针目标使用“摘要入口 + 独立 Dialog”提供可视化增删编辑；Dialog 内使用本地 React Hook Form 草稿，点击“应用”后才回填外层设置表单，取消关闭不得污染父表单。每项使用 `Select`、`Input`、`FormMessage` 等原子组件，TCP 才显示端口，最多 32 项，保存顺序与节点探针快速预设顺序一致。列表保持平面表单结构，项之间使用 `Separator`，不得额外套用卡片、列表边框或控件自定义颜色/尺寸。

### 12.4 视觉验证登记

新增页面、弹窗和节点升级入口的编号、源码路径、明暗主题检查点统一登记在 [docs/VISUAL_VERIFICATION.md](VISUAL_VERIFICATION.md) 的 UI-01 至 UI-31。视觉验证仍按需执行，不能接入 CI 或 Git Hook。

### 12.5 资源管理

- `/admin/binaries` 使用 `PageContainer`、`Card`、`Select`、`Badge`、`ResponsiveDialog` 和 `AlertDialog` 组成资源管理视图；筛选条件按资源类型、平台和状态排列，上传/远程导入是明确的带图标命令。
- 资源卡片必须可扫描地展示 Agent/Sing-box 类型、独立资源版本、来源、状态、默认标记、平台资产、文件大小和 SHA-256；详情弹窗展示辅助文件与最近分发任务。
- 启用、停用、归档和设为默认属于状态变更，结果通过 Sonner 提示；资源导入失败不能保留半成品，页面应保持原列表状态并允许重新提交。
- 节点升级弹窗展示当前内核版本、可用资源版本和资源来源；当资源有完整文件清单时应明确显示主文件与辅助依赖，失败任务提供重试/回滚入口。移动端筛选器允许换行，资源详情与导入表单在弹窗内部滚动，不产生页面级横向溢出。
