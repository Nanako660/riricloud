export interface DefaultHelpArticle {
  slug: string;
  title: string;
  platform: 'WINDOWS' | 'MACOS' | 'IOS' | 'ANDROID' | 'ROUTER' | 'FAQ' | 'GENERAL';
  clientName?: string;
  icon?: string;
  summary?: string;
  sortOrder: number;
  isPublished: boolean;
  locale: string;
  content: string;
}

export const BUILTIN_HELP_ARTICLES: DefaultHelpArticle[] = [
  {
    slug: 'windows-clash-verge',
    title: 'Windows 新手指南：Clash Verge Rev 客户端安装与一键配置',
    platform: 'WINDOWS',
    clientName: 'Clash Verge Rev',
    icon: 'Monitor',
    summary: '面向 Windows 10/11 小白用户，图文手把手教你下载、安装与一键导入订阅。',
    sortOrder: 10,
    isPublished: true,
    locale: 'zh-CN',
    content: `# Windows 新手指南：Clash Verge Rev 教程

Clash Verge Rev 是当前 Windows 平台上现代化、性能出色的图形代理客户端，内置 Meta 内核，界面美观直观，非常适合新手使用。

---

## 快速一键配置（新手推荐）

如果你已经安装好了 Clash Verge Rev，直接点击下方的一键导入按钮即可唤起客户端并自动下载节点配置：

[一键导入到 Clash Verge](clash://install-config?url={{clash_import_url}}&name={{site_name}})

> [!TIP]
> 如果一键导入未能唤起软件，请按照下方的图文步骤手动复制订阅地址导入。

---

## 详细配置步骤

### 第一步：下载并安装客户端
1. 前往官方发布页下载 Windows 安装包：
   - 官方 GitHub 下载：[Clash Verge Rev Releases](https://github.com/clash-verge-rev/clash-verge-rev/releases)
   - 推荐下载以 \`_x64-setup.exe\` 结尾的安装文件。
2. 运行安装程序，按照默认提示点击「下一步」完成安装。
3. 启动 Clash Verge Rev。

> [!NOTE]
> 如果 Windows Defender 弹出「Windows 已保护你的电脑」提示，请点击「更多信息」→「仍要运行」即可正常安装。

### 第二步：导入订阅链接
1. 点击上方或「我的订阅」页面的复制按钮，获取你的专属订阅地址：
   \`\`\`text
   {{subscription_url}}
   \`\`\`
2. 打开 Clash Verge 软件，点击左侧菜单栏的 **「订阅 (Profiles)」**。
3. 在顶部的输入框中粘贴刚刚复制的专属订阅地址，然后点击 **「保存 (Save)」** 或 **「导入」**。
4. 软件将自动拉取最新的节点配置。导入完成后，**单击选中**该订阅配置（选中的配置会有高亮边框提示）。

### 第三步：选择节点并开启代理
1. 点击左侧的 **「代理 (Proxies)」** 标签页。
2. 顶部模式选择 **「规则 (Rule)」** 模式（智能分流：国内网站直连，海外网站走节点）。
3. 在展开的节点分组中，点击延迟测试，选择一个延迟较低（显示绿色数字如 80ms）的节点。
4. 点击左侧的 **「设置 (Settings)」** 页面，找到 **「系统代理 (System Proxy)」** 开关并将其**打开**。
5. 现在打开浏览器访问 [Google](https://www.google.com) 或 [YouTube](https://www.youtube.com)，即可畅游网络！

---

## 常见排错小贴士
- **打开了系统代理却连不上？** 请检查电脑右下角系统时钟是否与网络北京时间完全一致，时间误差超过 1 分钟会导致握手失败。
- **节点显示全红超时？** 回到「订阅」页面，右键点击订阅卡片选择「刷新」，重新获取最新线路即可。
`
  },
  {
    slug: 'macos-clash-verge',
    title: 'macOS 新手指南：Clash Verge Rev 配置教程',
    platform: 'MACOS',
    clientName: 'Clash Verge Rev',
    icon: 'Laptop',
    summary: '适配 Apple Silicon (M1/M2/M3/M4) 与 Intel 架构 Mac，极简一键导入与系统代理设置。',
    sortOrder: 20,
    isPublished: true,
    locale: 'zh-CN',
    content: `# macOS 新手指南：Clash Verge Rev 教程

本教程适用于所有 macOS 用户（包括最新的 macOS Sequoia / Sonoma / Ventura），支持 Apple 芯片与 Intel 芯片机型。

---

## 快速一键配置

如果你已安装好客户端，点击下方按钮直接一键导入：

[一键导入到 Clash Verge](clash://install-config?url={{clash_import_url}}&name={{site_name}})

---

## 详细配置步骤

### 第一步：根据芯片选择下载客户端
1. 访问官方发布地址：[Clash Verge Rev Releases](https://github.com/clash-verge-rev/clash-verge-rev/releases)
2. 根据你的 Mac 处理器型号选择对应的 \`.dmg\` 文件：
   - **Apple 芯片 (M1/M2/M3/M4 系列)**：下载包含 \`_aarch64.dmg\` 的版本。
   - **Intel 芯片机型**：下载包含 \`_x64.dmg\` 的版本。
3. 双击打开下载的 \`.dmg\` 文件，将 **Clash Verge** 图标拖拽到 **Applications (应用程序)** 文件夹中。

> [!TIP]
> 首次打开若系统提示「无法打开，因为无法验证开发者」：请打开 Mac「系统设置」→「隐私与安全性」，滑到下方点击「仍要打开」；或者在终端中运行：\`sudo xattr -r -d com.apple.quarantine /Applications/Clash\\ Verge.app\`。

### 第二步：导入专属订阅
1. 复制你的专属订阅地址：
   \`\`\`text
   {{subscription_url}}
   \`\`\`
2. 打开 Clash Verge，点击左侧 **「Profiles (订阅)」**。
3. 在顶部输入框粘贴你的订阅链接，点击 **「Save (保存)」** 自动下载配置。
4. 点击该订阅卡片将其设置为当前激活状态。

### 第三步：开启系统代理
1. 点击左侧 **「Proxies (代理)」**，路由模式切换为 **「Rule (规则)」**。
2. 展开节点列表，选择你期望使用的节点。
3. 点击左侧 **「Settings (设置)」**，开启 **「System Proxy (系统代理)」** 开关。
4. 若需要更强力的全局流量接管（如命令行、终端或游戏），可在设置中开启 **「Tun Mode (虚拟网卡模式)」** 并授予权限。
`
  },
  {
    slug: 'ios-shadowrocket',
    title: 'iOS (iPhone / iPad) 新手指南：Shadowrocket (小火箭) 配置教程',
    platform: 'IOS',
    clientName: 'Shadowrocket',
    icon: 'Smartphone',
    summary: '苹果手机与平板最通用稳定的代理软件，配合外区 Apple ID 安装与一键唤起导入。',
    sortOrder: 30,
    isPublished: true,
    locale: 'zh-CN',
    content: `# iOS 新手指南：Shadowrocket (小火箭) 教程

Shadowrocket（俗称「小火箭」）是 iOS 平台上功能全面、广受好评的代理客户端，规则分流完善，极其稳定省电。

---

## 快速一键配置（强烈推荐）

在 iPhone / iPad 的 **Safari 浏览器** 中打开本帮助中心页面，点击下方按钮即可自动打开 Shadowrocket 并导入全部节点：

[一键导入到 Shadowrocket](shadowrocket://add/sub://{{shadowrocket_import_url}}?title={{site_name}})

---

## 详细配置步骤

### 第一步：准备并下载客户端
> [!IMPORTANT]
> Shadowrocket 在中国大陆 App Store 暂未上架。您需要准备一个**非国区 Apple ID**（如美区、日区、港区等）登录 App Store 搜索购买下载。
> 官方应用图标为**白色圆圈 + 黑色小火箭图案**，认准原版，请勿下载仿冒的山寨软件。

### 第二步：导入订阅节点
如果你无法通过一键导入自动唤起，请手动导入：
1. 复制你的专属订阅链接：
   \`\`\`text
   {{subscription_url}}
   \`\`\`
2. 打开 Shadowrocket，通常软件在检测到剪贴板有订阅链接时会自动弹出「是否添加」提示，点击 **「添加」** 即可。
3. 若未自动提示：点击软件首页右上角的 **「+」号**：
   - **类型 (Type)**：选择 **「Subscribe (订阅)」**；
   - **URL (链接)**：粘贴上方复制的专属订阅地址；
   - **备注 (Remark)**：填写 \`{{site_name}}\`；
   - 点击右上角 **「完成 (Done)」** 保存，软件将自动更新下载节点。

### 第三步：开启连接与授权
1. 在首页节点列表中，点击任意一个节点进行选中（节点前面出现黄色圆点表示已选中）。
2. 在「全局路由」选项中，建议设置为 **「配置 (Config)」**（智能分流模式，国内应用不消耗代理流量）。
3. 开启最上方的 **「未连接」** 开关。
4. 首次开启时系统会弹出提示 **「“Shadowrocket”想要添加 VPN 配置」**，点击 **「允许」**，并输入手机锁屏密码确认。
5. 状态栏出现 **VPN** 图标即表示连接成功！
`
  },
  {
    slug: 'android-clash-meta',
    title: 'Android (安卓) 新手指南：Clash Meta / v2rayNG 配置教程',
    platform: 'ANDROID',
    clientName: 'Clash Meta',
    icon: 'Smartphone',
    summary: '适配华为、小米、OPPO、vivo、三星等安卓机型，APK 一键下载与导入指南。',
    sortOrder: 40,
    isPublished: true,
    locale: 'zh-CN',
    content: `# Android (安卓) 新手指南：Clash Meta 教程

安卓平台推荐使用 **Clash Meta for Android (CMFA)**，对各类新型代理协议（VLESS、Hysteria 2、TUIC、Shadowsocks）拥有出色的兼容性。

---

## 快速一键配置

如果手机已安装好 Clash Meta，直接点击下方按钮一键导入配置：

[一键导入到 Clash Meta](clash://install-config?url={{clash_import_url}}&name={{site_name}})

---

## 详细配置步骤

### 第一步：下载并安装 APK
1. 前往 GitHub Releases 下载最新的安卓客户端安装包：
   - [Clash Meta for Android Releases](https://github.com/MetaCubeX/ClashMetaForAndroid/releases)
   - 普遍机型请下载以 \`_universal.apk\` 或 \`_arm64-v8a.apk\` 结尾的文件。
2. 安装后打开应用程序。

### 第二步：导入订阅
1. 复制你的专属订阅地址：
   \`\`\`text
   {{subscription_url}}
   \`\`\`
2. 打开软件，点击 **「配置 (Profiles)」**。
3. 点击右上角 **「新配置」** 或 **「+」号**，选择 **「从 URL 导入」**：
   - 名称：\`{{site_name}}\`
   - URL：粘贴上方复制的专属订阅链接
   - 自动更新间隔：建议设置为 1440 分钟（24小时）
4. 点击右上角 **保存图标** 开始下载配置，下载完成后**单选激活**该配置。

### 第三步：开启连接
1. 返回软件主页，点击中间的 **「点击启动」** 灰色按钮。
2. 首次启动时系统会弹出 **「网络连接请求 / 允许 VPN 权限」**，点击 **「确定」** 允许。
3. 启动后，点击 **「代理」** 标签页，切换至 **「规则 (Rule)」** 模式。
4. 展开节点列表选择低延迟节点即可开始使用。

> [!TIP]
> **防杀后台设置**：安卓系统（尤其 MIUI/HyperOS、HarmonyOS、ColorOS）可能会在息屏后后台冻结应用。请在手机「设置」→「应用管理」中找到 Clash，开启「自启动」权限并将电池策略设为「无限制 / 允许后台高耗电」。
`
  },
  {
    slug: 'faq-connection-troubleshooting',
    title: '新手排错宝典：连上后无法上网？节点全红？常见问题排查解答',
    platform: 'FAQ',
    clientName: '常见排错与解答',
    icon: 'HelpCircle',
    summary: '汇集 0 基础用户高频遇到的连不上、打不开网页、节点超时等常见问题与秒级解决方案。',
    sortOrder: 50,
    isPublished: true,
    locale: 'zh-CN',
    content: `# 新手常见问题与排错宝典

如果你在使用代理服务过程中遇到任何问题，请先对照以下常见排查指南解决。

---

## Q1：软件显示已连接，但网页完全打不开（提示无法访问此网站）？

这是新手最常遇到的问题，90% 是由以下三个原因引起的：

### 1. 电脑/手机系统时钟与网络时间不一致（最常见！）
- **原因**：现代加密代理协议（如 VMess/VLESS/Reality/TLS）对系统时间有极其严苛的要求。如果你的系统时钟比真实北京时间快或慢了超过 60 秒，服务器将直接拒绝握手以防重放攻击。
- **解决办法**：打开系统的「日期和时间」设置，关闭并重新开启「自动设置时间」，点击「立即同步」确保时间准确。

### 2. 未开启「系统代理 (System Proxy)」开关
- **原因**：软件虽然启动了，但没有把电脑浏览器的流量导流给软件。
- **解决办法**：在 Clash 软件设置中，检查 **「系统代理 (System Proxy)」** 是否已经勾选并打开。

### 3. 本地 DNS 缓存污染
- **解决办法**：关闭软件，在电脑命令行执行 \`ipconfig /flushdns\` 清理 DNS，或者重启一次浏览器和代理软件。

---

## Q2：节点列表全是红色，测速显示「Timeout」或全部失败？

1. **检查订阅是否已更新**：节点 IP 或端口可能进行了安全轮换。请在软件配置管理中找到订阅，点击 **「刷新 / 更新」** 拉取最新线路。
2. **检查账户套餐状态**：登录本控制台，在「我的订阅」页检查套餐是否已经到期，或者本期高速流量是否已经用尽。
3. **切换网络环境排查**：部分公司企业内网、校园网或公共 Wi-Fi 会拦截特定端口。请尝试使用手机蜂窝数据开启个人热点连接测试。

---

## Q3：规则模式 (Rule)、全局模式 (Global) 与直连模式 (Direct) 有什么区别？

- **规则模式 (Rule，强烈推荐日常使用)**：
  - 系统根据预设的规则自动分流。
  - 访问国内网站（百度、Bilibili、微信、淘宝等）自动走本地宽带直连，保证极速且不消耗套餐流量；
  - 访问海外被阻断网站（Google、YouTube、GitHub、OpenAI 等）自动走代理节点。
- **全局模式 (Global)**：
  - 你的所有网络访问一律走代理节点。适合特定需要全局改变 IP 的场景，但不建议日常开，否则访问国内网站会变慢且白白消耗流量。
- **直连模式 (Direct)**：
  - 所有访问均不走代理，相当于关闭翻墙。

---

## Q4：我的订阅多久需要更新一次？

- 建议在**节点连不上**或**每周一次**手动点击客户端内的「刷新订阅」按钮。
- 大部分现代客户端（如 Clash Verge、Shadowrocket、Clash Meta）支持设置「自动更新间隔」，推荐设置为 **24 小时 (1440 分钟)** 自动静默更新。

---

## Q5：如果还是无法解决，如何联系人工客服？

如果对照上述排查后依然无法正常连接，请点击主控制台左下角的 **「在线客服 / 支持」**，向站长反馈你遇到的具体错误提示与系统版本，我们将尽快协助你排查！
`
  }
];
