import type { LandingFeatureItem, LandingFaqItem } from './types';

export const DEFAULT_FEATURES_ZH: LandingFeatureItem[] = [
  {
    id: 'speed',
    icon: 'Zap',
    title: '极速高清体验',
    description: '优化骨干网络与大带宽保障，4K/8K 视频即开即播，告别加载等待。'
  },
  {
    id: 'cross-platform',
    icon: 'Smartphone',
    title: '全平台一键接入',
    description: '支持 Windows、macOS、iOS、Android 等主流系统，无需复杂设置，新手几分钟即可轻松上手。'
  },
  {
    id: 'smart-routing',
    icon: 'Sparkles',
    title: '智能分流免配置',
    description: '智能识别访问流量，本地应用直连不减速，境外服务智能加速，无需繁琐切换。'
  },
  {
    id: 'multi-device',
    icon: 'Laptop',
    title: '多端协同稳定畅联',
    description: '单个账号支持手机、电脑、平板等多设备同时在线，随时随地保持稳定不断联。'
  },
  {
    id: 'transparent-quota',
    icon: 'Activity',
    title: '清晰透明用量账单',
    description: '直观展示已用流量、剩余额度与到期时间，无隐藏规则，随时随地清楚掌握。'
  },
  {
    id: 'privacy',
    icon: 'ShieldCheck',
    title: '严格隐私安全防护',
    description: '全程高强度加密传输，不记录、不保存您的个人浏览轨迹，坚决守护网络隐私。'
  }
];

export const DEFAULT_FEATURES_EN: LandingFeatureItem[] = [
  {
    id: 'speed',
    icon: 'Zap',
    title: 'Ultra-Fast 4K Experience',
    description: 'Optimized backbone network with ample bandwidth for instant 4K/8K streaming with zero buffering.'
  },
  {
    id: 'cross-platform',
    icon: 'Smartphone',
    title: 'One-Click Setup on All Devices',
    description: 'Compatible with Windows, macOS, iOS, Android and more. No complex setup required—get online in minutes.'
  },
  {
    id: 'smart-routing',
    icon: 'Sparkles',
    title: 'Smart & Seamless Routing',
    description: 'Automatically distinguishes traffic—keeps local apps fast on direct routes while accelerating overseas services seamlessly.'
  },
  {
    id: 'multi-device',
    icon: 'Laptop',
    title: 'Multi-Device, Always Online',
    description: 'Use your single subscription across your phone, tablet, and PC simultaneously with dependable all-day uptime.'
  },
  {
    id: 'transparent-quota',
    icon: 'Activity',
    title: 'Transparent Usage Tracking',
    description: 'Crystal-clear dashboard displaying data usage, remaining quota, and renewal dates with zero hidden traps.'
  },
  {
    id: 'privacy',
    icon: 'ShieldCheck',
    title: 'Privacy First & Zero Logs',
    description: 'High-strength end-to-end encryption with a strict zero-log policy, protecting your digital footprint and personal privacy.'
  }
];

export const DEFAULT_FAQS_ZH: LandingFaqItem[] = [
  {
    id: 'faq-1',
    question: '我是新手小白，该如何开始使用？',
    answer: '非常简单，只需 3 步：① 选购适合您的套餐计划；② 按照新手引导下载适用于您设备的客户端；③ 一键导入专属订阅，点击连接即可开启高速网络。'
  },
  {
    id: 'faq-2',
    question: '我的手机、平板和电脑可以同时使用吗？',
    answer: '完全可以。单个订阅支持在您的多台常用设备上配置使用，满足居家、办公及出行的全场景无缝切换需求。'
  },
  {
    id: 'faq-3',
    question: '看视频或玩游戏会卡顿吗？',
    answer: '我们采用多区域高速网络节点与智能容灾切换技术，带宽充裕延迟低，满足 4K 超清视频播放与日常浏览的丝滑体验。'
  },
  {
    id: 'faq-4',
    question: '我的上网隐私是否安全？',
    answer: '我们高度重视您的隐私安全。所有网络传输均采用国际标准的端到端高强度加密，且平台严格遵循零日志原则，不记录您的任何上网活动。'
  }
];

export const DEFAULT_FAQS_EN: LandingFaqItem[] = [
  {
    id: 'faq-1',
    question: 'How do I get started as a beginner?',
    answer: 'Super easy in 3 steps: ① Choose a plan that fits your needs; ② Download the recommended client for your device; ③ Import your subscription link with one click and connect.'
  },
  {
    id: 'faq-2',
    question: 'Can I use it on multiple devices simultaneously?',
    answer: 'Absolutely. A single subscription can be configured across your phone, laptop, and tablet, enabling seamless connectivity at home, work, and on the go.'
  },
  {
    id: 'faq-3',
    question: 'Will it lag when watching videos or streaming?',
    answer: 'We deploy multi-region high-speed edge nodes with smart failover. With ample bandwidth and low latency, 4K streaming and daily browsing stay silky-smooth.'
  },
  {
    id: 'faq-4',
    question: 'Is my personal browsing privacy safe?',
    answer: 'We take your privacy seriously. All data is protected by industry-standard encryption, and our platform strictly operates under a zero-log policy with no browsing records retained.'
  }
];

export function getEffectiveFeatures(customJson?: string, lang = 'zh-CN'): LandingFeatureItem[] {
  if (customJson && customJson.trim() && customJson !== '[]') {
    try {
      const parsed: unknown = JSON.parse(customJson);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.filter(
          (item): item is LandingFeatureItem =>
            Boolean(item && typeof item === 'object' && typeof item.title === 'string' && typeof item.description === 'string')
        );
      }
    } catch {
      // 忽略解析错误并回退为默认
    }
  }
  return lang.toLowerCase().startsWith('en') ? DEFAULT_FEATURES_EN : DEFAULT_FEATURES_ZH;
}

export function getEffectiveFaqs(customJson?: string, lang = 'zh-CN'): LandingFaqItem[] {
  if (customJson && customJson.trim() && customJson !== '[]') {
    try {
      const parsed: unknown = JSON.parse(customJson);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.filter(
          (item): item is LandingFaqItem =>
            Boolean(item && typeof item === 'object' && typeof item.question === 'string' && typeof item.answer === 'string')
        );
      }
    } catch {
      // 忽略解析错误并回退为默认
    }
  }
  return lang.toLowerCase().startsWith('en') ? DEFAULT_FAQS_EN : DEFAULT_FAQS_ZH;
}
