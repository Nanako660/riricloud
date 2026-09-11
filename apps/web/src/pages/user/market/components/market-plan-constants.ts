import {
  Zap,
  Rocket,
  Crown,
  Shield,
  Sparkles,
  Flame,
  Globe,
  Gauge,
  Gem,
  Server,
  Cpu,
  Plane,
  type LucideIcon
} from 'lucide-react';
import type { PlanThemeColor } from '@/pages/admin/plans/use-plans';

export const PLAN_ICONS: Record<string, { label: string; icon: LucideIcon }> = {
  Zap: { label: '极速闪电', icon: Zap },
  Rocket: { label: '冲刺火箭', icon: Rocket },
  Crown: { label: '尊享王冠', icon: Crown },
  Shield: { label: '安全盾牌', icon: Shield },
  Sparkles: { label: '特惠星芒', icon: Sparkles },
  Flame: { label: '热门爆款', icon: Flame },
  Globe: { label: '全球节点', icon: Globe },
  Gauge: { label: '性能狂飙', icon: Gauge },
  Gem: { label: '至尊黑钻', icon: Gem },
  Server: { label: '专享机房', icon: Server },
  Cpu: { label: '强悍核心', icon: Cpu },
  Plane: { label: '极速出海', icon: Plane }
};

export interface ThemeColorConfig {
  name: string;
  borderClass: string;
  cardShadowClass: string;
  priceBoxClass: string;
  iconBgClass: string;
  badgeGradient: string;
  buttonGlassClass: string;
  buttonGradient: string; // 回退兼容
  auroraOrb1: string;
  auroraOrb2: string;
  beamColor: string;
  spotlightRgba: string;
}

export const THEME_COLOR_CONFIGS: Record<PlanThemeColor, ThemeColorConfig> = {
  default: {
    name: '极简暗黑',
    borderClass: 'border-border hover:border-foreground/30 dark:border-white/10 dark:hover:border-white/20',
    cardShadowClass: 'shadow-md shadow-zinc-950/5 hover:shadow-xl hover:shadow-zinc-950/10 dark:shadow-none',
    priceBoxClass: 'bg-muted/50 border-border/80 dark:bg-background/50 dark:border-white/10',
    iconBgClass: 'bg-zinc-100 dark:bg-white/5 text-foreground border-zinc-200 dark:border-white/10 shadow-xs dark:shadow-inner',
    badgeGradient: 'bg-zinc-100 dark:bg-white/10 text-foreground border-zinc-200 dark:border-white/15 backdrop-blur-md',
    buttonGlassClass: 'bg-zinc-900 hover:bg-zinc-800 text-zinc-50 font-semibold shadow-md shadow-zinc-950/20 dark:bg-white/10 dark:hover:bg-white/15 dark:text-foreground dark:border-white/15 dark:shadow-sm backdrop-blur-md',
    buttonGradient: 'bg-primary hover:bg-primary/90 text-primary-foreground',
    auroraOrb1: 'from-zinc-400/30 via-slate-500/25 to-transparent',
    auroraOrb2: 'from-slate-600/25 via-zinc-700/25 to-transparent',
    beamColor: '#a1a1aa',
    spotlightRgba: 'rgba(255, 255, 255, 0.08)'
  },
  amber: {
    name: '金珀香槟',
    borderClass: 'border-amber-500/40 dark:border-amber-500/25 hover:border-amber-500/65 dark:hover:border-amber-500/45',
    cardShadowClass: 'shadow-md shadow-amber-500/10 hover:shadow-xl hover:shadow-amber-500/20 dark:shadow-none',
    priceBoxClass: 'bg-gradient-to-r from-amber-500/10 via-yellow-500/5 to-amber-500/10 border-amber-500/30 dark:bg-background/50 dark:border-white/10',
    iconBgClass: 'bg-gradient-to-br from-amber-500/15 to-amber-500/5 text-amber-600 dark:text-amber-300 border-amber-500/25 dark:border-amber-500/30 shadow-xs dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)]',
    badgeGradient: 'bg-gradient-to-r from-amber-500/90 to-yellow-500/90 text-zinc-950 border-amber-300/30 font-semibold shadow-sm',
    buttonGlassClass: 'bg-gradient-to-r from-amber-400 via-amber-500 to-yellow-500 hover:from-amber-500 hover:to-yellow-600 text-zinc-950 font-bold shadow-md shadow-amber-500/30 hover:shadow-lg hover:shadow-amber-500/40 border border-amber-400/50 dark:from-amber-500/25 dark:via-amber-500/15 dark:to-amber-600/25 dark:hover:from-amber-500/40 dark:hover:to-amber-600/40 dark:text-amber-200 dark:hover:text-amber-100 dark:border-amber-400/40 dark:hover:border-amber-400/70 dark:shadow-[0_0_20px_-3px_rgba(245,158,11,0.25)] backdrop-blur-md',
    buttonGradient: 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white shadow-lg shadow-amber-500/20',
    auroraOrb1: 'from-amber-400/45 via-amber-500/35 to-transparent',
    auroraOrb2: 'from-yellow-400/40 via-orange-400/30 to-transparent',
    beamColor: '#f59e0b',
    spotlightRgba: 'rgba(245, 158, 11, 0.14)'
  },
  blue: {
    name: '极速冰蓝',
    borderClass: 'border-sky-500/40 dark:border-sky-500/25 hover:border-sky-500/65 dark:hover:border-sky-500/45',
    cardShadowClass: 'shadow-md shadow-sky-500/10 hover:shadow-xl hover:shadow-sky-500/20 dark:shadow-none',
    priceBoxClass: 'bg-gradient-to-r from-sky-500/10 via-blue-500/5 to-indigo-500/10 border-sky-500/30 dark:bg-background/50 dark:border-white/10',
    iconBgClass: 'bg-gradient-to-br from-sky-500/15 to-sky-500/5 text-sky-600 dark:text-sky-300 border-sky-500/25 dark:border-sky-500/30 shadow-xs dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)]',
    badgeGradient: 'bg-gradient-to-r from-sky-500/90 to-blue-500/90 text-white border-sky-300/30 font-semibold shadow-sm',
    buttonGlassClass: 'bg-gradient-to-r from-sky-500 via-blue-600 to-indigo-600 hover:from-sky-600 hover:to-indigo-700 text-white font-bold shadow-md shadow-sky-500/30 hover:shadow-lg hover:shadow-blue-500/40 border border-sky-400/50 dark:from-sky-500/25 dark:via-blue-500/15 dark:to-indigo-500/25 dark:hover:from-sky-500/40 dark:hover:to-indigo-500/40 dark:text-sky-200 dark:hover:text-sky-100 dark:border-sky-400/40 dark:hover:border-sky-400/70 dark:shadow-[0_0_20px_-3px_rgba(56,189,248,0.25)] backdrop-blur-md font-semibold',
    buttonGradient: 'bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white shadow-lg shadow-blue-500/20',
    auroraOrb1: 'from-sky-400/45 via-blue-500/35 to-transparent',
    auroraOrb2: 'from-cyan-400/40 via-teal-400/30 to-transparent',
    beamColor: '#38bdf8',
    spotlightRgba: 'rgba(56, 189, 248, 0.14)'
  },
  purple: {
    name: '星云薄暮',
    borderClass: 'border-purple-500/40 dark:border-purple-500/25 hover:border-purple-500/65 dark:hover:border-purple-500/45',
    cardShadowClass: 'shadow-md shadow-purple-500/10 hover:shadow-xl hover:shadow-purple-500/20 dark:shadow-none',
    priceBoxClass: 'bg-gradient-to-r from-purple-500/10 via-fuchsia-500/5 to-purple-500/10 border-purple-500/30 dark:bg-background/50 dark:border-white/10',
    iconBgClass: 'bg-gradient-to-br from-purple-500/15 to-purple-500/5 text-purple-600 dark:text-purple-300 border-purple-500/25 dark:border-purple-500/30 shadow-xs dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)]',
    badgeGradient: 'bg-gradient-to-r from-purple-500/90 to-fuchsia-500/90 text-white border-purple-300/30 font-semibold shadow-sm',
    buttonGlassClass: 'bg-gradient-to-r from-purple-500 via-fuchsia-600 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white font-bold shadow-md shadow-purple-500/30 hover:shadow-lg hover:shadow-purple-500/40 border border-purple-400/50 dark:from-purple-500/25 dark:via-fuchsia-500/15 dark:to-purple-600/25 dark:hover:from-purple-500/40 dark:hover:to-purple-600/40 dark:text-purple-200 dark:hover:text-purple-100 dark:border-purple-400/40 dark:hover:border-purple-400/70 dark:shadow-[0_0_20px_-3px_rgba(168,85,247,0.25)] backdrop-blur-md font-semibold',
    buttonGradient: 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white shadow-lg shadow-purple-500/20',
    auroraOrb1: 'from-purple-400/45 via-fuchsia-500/35 to-transparent',
    auroraOrb2: 'from-indigo-400/40 via-purple-500/30 to-transparent',
    beamColor: '#a855f7',
    spotlightRgba: 'rgba(168, 85, 247, 0.14)'
  },
  emerald: {
    name: '碧翠翡冷',
    borderClass: 'border-emerald-500/40 dark:border-emerald-500/25 hover:border-emerald-500/65 dark:hover:border-emerald-500/45',
    cardShadowClass: 'shadow-md shadow-emerald-500/10 hover:shadow-xl hover:shadow-emerald-500/20 dark:shadow-none',
    priceBoxClass: 'bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-emerald-500/10 border-emerald-500/30 dark:bg-background/50 dark:border-white/10',
    iconBgClass: 'bg-gradient-to-br from-emerald-500/15 to-emerald-500/5 text-emerald-600 dark:text-emerald-300 border-emerald-500/25 dark:border-emerald-500/30 shadow-xs dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)]',
    badgeGradient: 'bg-gradient-to-r from-emerald-500/90 to-teal-500/90 text-white border-emerald-300/30 font-semibold shadow-sm',
    buttonGlassClass: 'bg-gradient-to-r from-emerald-500 via-teal-600 to-cyan-600 hover:from-emerald-600 hover:to-cyan-700 text-white font-bold shadow-md shadow-emerald-500/30 hover:shadow-lg hover:shadow-emerald-500/40 border border-emerald-400/50 dark:from-emerald-500/25 dark:via-teal-500/15 dark:to-emerald-600/25 dark:hover:from-emerald-500/40 dark:hover:to-emerald-600/40 dark:text-emerald-200 dark:hover:text-emerald-100 dark:border-emerald-400/40 dark:hover:border-emerald-400/70 dark:shadow-[0_0_20px_-3px_rgba(16,185,129,0.25)] backdrop-blur-md font-semibold',
    buttonGradient: 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-lg shadow-emerald-500/20',
    auroraOrb1: 'from-emerald-400/45 via-teal-500/35 to-transparent',
    auroraOrb2: 'from-teal-400/40 via-cyan-400/30 to-transparent',
    beamColor: '#10b981',
    spotlightRgba: 'rgba(16, 185, 129, 0.14)'
  },
  rose: {
    name: '炽焰宝石',
    borderClass: 'border-rose-500/40 dark:border-rose-500/25 hover:border-rose-500/65 dark:hover:border-rose-500/45',
    cardShadowClass: 'shadow-md shadow-rose-500/10 hover:shadow-xl hover:shadow-rose-500/20 dark:shadow-none',
    priceBoxClass: 'bg-gradient-to-r from-rose-500/10 via-pink-500/5 to-rose-500/10 border-rose-500/30 dark:bg-background/50 dark:border-white/10',
    iconBgClass: 'bg-gradient-to-br from-rose-500/15 to-rose-500/5 text-rose-600 dark:text-rose-300 border-rose-500/25 dark:border-rose-500/30 shadow-xs dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)]',
    badgeGradient: 'bg-gradient-to-r from-rose-500/90 to-red-500/90 text-white border-rose-300/30 font-semibold shadow-sm',
    buttonGlassClass: 'bg-gradient-to-r from-rose-500 via-pink-600 to-red-600 hover:from-rose-600 hover:to-red-700 text-white font-bold shadow-md shadow-rose-500/30 hover:shadow-lg hover:shadow-rose-500/40 border border-rose-400/50 dark:from-rose-500/25 dark:via-pink-500/15 dark:to-rose-600/25 dark:hover:from-rose-500/40 dark:hover:to-rose-600/40 dark:text-rose-200 dark:hover:text-rose-100 dark:border-rose-400/40 dark:hover:border-rose-400/70 dark:shadow-[0_0_20px_-3px_rgba(244,63,94,0.25)] backdrop-blur-md font-semibold',
    buttonGradient: 'bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-700 hover:to-red-700 text-white shadow-lg shadow-rose-500/20',
    auroraOrb1: 'from-rose-400/45 via-pink-500/35 to-transparent',
    auroraOrb2: 'from-pink-400/40 via-rose-500/30 to-transparent',
    beamColor: '#f43f5e',
    spotlightRgba: 'rgba(244, 63, 94, 0.14)'
  },
  indigo: {
    name: '深邃星空',
    borderClass: 'border-indigo-500/40 dark:border-indigo-500/25 hover:border-indigo-500/65 dark:hover:border-indigo-500/45',
    cardShadowClass: 'shadow-md shadow-indigo-500/10 hover:shadow-xl hover:shadow-indigo-500/20 dark:shadow-none',
    priceBoxClass: 'bg-gradient-to-r from-indigo-500/10 via-violet-500/5 to-indigo-500/10 border-indigo-500/30 dark:bg-background/50 dark:border-white/10',
    iconBgClass: 'bg-gradient-to-br from-indigo-500/15 to-indigo-500/5 text-indigo-600 dark:text-indigo-300 border-indigo-500/25 dark:border-indigo-500/30 shadow-xs dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)]',
    badgeGradient: 'bg-gradient-to-r from-indigo-500/90 to-sky-500/90 text-white border-indigo-300/30 font-semibold shadow-sm',
    buttonGlassClass: 'bg-gradient-to-r from-indigo-500 via-purple-600 to-sky-600 hover:from-indigo-600 hover:to-sky-700 text-white font-bold shadow-md shadow-indigo-500/30 hover:shadow-lg hover:shadow-indigo-500/40 border border-indigo-400/50 dark:from-indigo-500/25 dark:via-violet-500/15 dark:to-indigo-600/25 dark:hover:from-indigo-500/40 dark:hover:to-violet-500/40 dark:text-indigo-200 dark:hover:text-indigo-100 dark:border-indigo-400/40 dark:hover:border-indigo-400/70 dark:shadow-[0_0_20px_-3px_rgba(99,102,241,0.25)] backdrop-blur-md font-semibold',
    buttonGradient: 'bg-gradient-to-r from-indigo-600 to-sky-600 hover:from-indigo-700 hover:to-sky-700 text-white shadow-lg shadow-indigo-500/20',
    auroraOrb1: 'from-indigo-400/45 via-violet-500/35 to-transparent',
    auroraOrb2: 'from-blue-400/40 via-indigo-500/30 to-transparent',
    beamColor: '#6366f1',
    spotlightRgba: 'rgba(99, 102, 241, 0.14)'
  }
};
