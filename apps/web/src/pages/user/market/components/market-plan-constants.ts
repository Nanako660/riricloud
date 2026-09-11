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
    borderClass: 'border-border/80 dark:border-white/10 hover:border-border dark:hover:border-white/20',
    iconBgClass: 'bg-zinc-100 dark:bg-white/5 text-foreground border-zinc-200 dark:border-white/10 shadow-xs dark:shadow-inner',
    badgeGradient: 'bg-zinc-100 dark:bg-white/10 text-foreground border-zinc-200 dark:border-white/15 backdrop-blur-md',
    buttonGlassClass: 'bg-zinc-900/5 hover:bg-zinc-900/10 dark:bg-white/10 dark:hover:bg-white/15 text-foreground border border-zinc-900/15 dark:border-white/15 shadow-xs dark:shadow-sm backdrop-blur-md',
    buttonGradient: 'bg-primary hover:bg-primary/90 text-primary-foreground',
    auroraOrb1: 'from-zinc-400/25 via-slate-500/20 to-transparent',
    auroraOrb2: 'from-slate-600/20 via-zinc-700/25 to-transparent',
    beamColor: '#a1a1aa',
    spotlightRgba: 'rgba(255, 255, 255, 0.08)'
  },
  amber: {
    name: '金珀香槟',
    borderClass: 'border-amber-500/35 dark:border-amber-500/25 hover:border-amber-500/55 dark:hover:border-amber-500/45 shadow-xs dark:shadow-[0_0_25px_-5px_rgba(245,158,11,0.12)]',
    iconBgClass: 'bg-gradient-to-br from-amber-500/15 to-amber-500/5 text-amber-600 dark:text-amber-300 border-amber-500/25 dark:border-amber-500/30 shadow-xs dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)]',
    badgeGradient: 'bg-gradient-to-r from-amber-500/90 to-yellow-500/90 text-zinc-950 border-amber-300/30 font-semibold shadow-sm',
    buttonGlassClass: 'bg-gradient-to-r from-amber-500/15 via-amber-500/10 to-amber-600/15 dark:from-amber-500/25 dark:via-amber-500/15 dark:to-amber-600/25 hover:from-amber-500/25 hover:to-amber-600/25 dark:hover:from-amber-500/40 dark:hover:to-amber-600/40 text-amber-950 dark:text-amber-200 hover:text-amber-900 dark:hover:text-amber-100 border border-amber-500/35 dark:border-amber-400/40 hover:border-amber-500/60 dark:hover:border-amber-400/70 shadow-xs dark:shadow-[0_0_20px_-3px_rgba(245,158,11,0.25)] backdrop-blur-md font-semibold',
    buttonGradient: 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white shadow-lg shadow-amber-500/20',
    auroraOrb1: 'from-amber-400/40 via-amber-500/30 to-transparent',
    auroraOrb2: 'from-yellow-500/30 via-orange-500/25 to-transparent',
    beamColor: '#f59e0b',
    spotlightRgba: 'rgba(245, 158, 11, 0.14)'
  },
  blue: {
    name: '极速冰蓝',
    borderClass: 'border-sky-500/35 dark:border-sky-500/25 hover:border-sky-500/55 dark:hover:border-sky-500/45 shadow-xs dark:shadow-[0_0_25px_-5px_rgba(56,189,248,0.12)]',
    iconBgClass: 'bg-gradient-to-br from-sky-500/15 to-sky-500/5 text-sky-600 dark:text-sky-300 border-sky-500/25 dark:border-sky-500/30 shadow-xs dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)]',
    badgeGradient: 'bg-gradient-to-r from-sky-500/90 to-blue-500/90 text-white border-sky-300/30 font-semibold shadow-sm',
    buttonGlassClass: 'bg-gradient-to-r from-sky-500/15 via-blue-500/10 to-indigo-500/15 dark:from-sky-500/25 dark:via-blue-500/15 dark:to-indigo-500/25 hover:from-sky-500/25 hover:to-indigo-500/25 dark:hover:from-sky-500/40 dark:hover:to-indigo-500/40 text-sky-950 dark:text-sky-200 hover:text-sky-900 dark:hover:text-sky-100 border border-sky-500/35 dark:border-sky-400/40 hover:border-sky-500/60 dark:hover:border-sky-400/70 shadow-xs dark:shadow-[0_0_20px_-3px_rgba(56,189,248,0.25)] backdrop-blur-md font-semibold',
    buttonGradient: 'bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white shadow-lg shadow-blue-500/20',
    auroraOrb1: 'from-sky-400/40 via-blue-500/30 to-transparent',
    auroraOrb2: 'from-cyan-400/30 via-teal-500/25 to-transparent',
    beamColor: '#38bdf8',
    spotlightRgba: 'rgba(56, 189, 248, 0.14)'
  },
  purple: {
    name: '星云薄暮',
    borderClass: 'border-purple-500/35 dark:border-purple-500/25 hover:border-purple-500/55 dark:hover:border-purple-500/45 shadow-xs dark:shadow-[0_0_25px_-5px_rgba(168,85,247,0.12)]',
    iconBgClass: 'bg-gradient-to-br from-purple-500/15 to-purple-500/5 text-purple-600 dark:text-purple-300 border-purple-500/25 dark:border-purple-500/30 shadow-xs dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)]',
    badgeGradient: 'bg-gradient-to-r from-purple-500/90 to-fuchsia-500/90 text-white border-purple-300/30 font-semibold shadow-sm',
    buttonGlassClass: 'bg-gradient-to-r from-purple-500/15 via-fuchsia-500/10 to-purple-600/15 dark:from-purple-500/25 dark:via-fuchsia-500/15 dark:to-purple-600/25 hover:from-purple-500/25 hover:to-purple-600/25 dark:hover:from-purple-500/40 dark:hover:to-purple-600/40 text-purple-950 dark:text-purple-200 hover:text-purple-900 dark:hover:text-purple-100 border border-purple-500/35 dark:border-purple-400/40 hover:border-purple-500/60 dark:hover:border-purple-400/70 shadow-xs dark:shadow-[0_0_20px_-3px_rgba(168,85,247,0.25)] backdrop-blur-md font-semibold',
    buttonGradient: 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white shadow-lg shadow-purple-500/20',
    auroraOrb1: 'from-purple-400/40 via-fuchsia-500/30 to-transparent',
    auroraOrb2: 'from-indigo-400/30 via-purple-600/25 to-transparent',
    beamColor: '#a855f7',
    spotlightRgba: 'rgba(168, 85, 247, 0.14)'
  },
  emerald: {
    name: '碧翠翡冷',
    borderClass: 'border-emerald-500/35 dark:border-emerald-500/25 hover:border-emerald-500/55 dark:hover:border-emerald-500/45 shadow-xs dark:shadow-[0_0_25px_-5px_rgba(16,185,129,0.12)]',
    iconBgClass: 'bg-gradient-to-br from-emerald-500/15 to-emerald-500/5 text-emerald-600 dark:text-emerald-300 border-emerald-500/25 dark:border-emerald-500/30 shadow-xs dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)]',
    badgeGradient: 'bg-gradient-to-r from-emerald-500/90 to-teal-500/90 text-white border-emerald-300/30 font-semibold shadow-sm',
    buttonGlassClass: 'bg-gradient-to-r from-emerald-500/15 via-teal-500/10 to-emerald-600/15 dark:from-emerald-500/25 dark:via-teal-500/15 dark:to-emerald-600/25 hover:from-emerald-500/25 hover:to-emerald-600/25 dark:hover:from-emerald-500/40 dark:hover:to-emerald-600/40 text-emerald-950 dark:text-emerald-200 hover:text-emerald-900 dark:hover:text-emerald-100 border border-emerald-500/35 dark:border-emerald-400/40 hover:border-emerald-500/60 dark:hover:border-emerald-400/70 shadow-xs dark:shadow-[0_0_20px_-3px_rgba(16,185,129,0.25)] backdrop-blur-md font-semibold',
    buttonGradient: 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-lg shadow-emerald-500/20',
    auroraOrb1: 'from-emerald-400/40 via-teal-500/30 to-transparent',
    auroraOrb2: 'from-teal-400/30 via-cyan-600/25 to-transparent',
    beamColor: '#10b981',
    spotlightRgba: 'rgba(16, 185, 129, 0.14)'
  },
  rose: {
    name: '炽焰宝石',
    borderClass: 'border-rose-500/35 dark:border-rose-500/25 hover:border-rose-500/55 dark:hover:border-rose-500/45 shadow-xs dark:shadow-[0_0_25px_-5px_rgba(244,63,94,0.12)]',
    iconBgClass: 'bg-gradient-to-br from-rose-500/15 to-rose-500/5 text-rose-600 dark:text-rose-300 border-rose-500/25 dark:border-rose-500/30 shadow-xs dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)]',
    badgeGradient: 'bg-gradient-to-r from-rose-500/90 to-red-500/90 text-white border-rose-300/30 font-semibold shadow-sm',
    buttonGlassClass: 'bg-gradient-to-r from-rose-500/15 via-pink-500/10 to-rose-600/15 dark:from-rose-500/25 dark:via-pink-500/15 dark:to-rose-600/25 hover:from-rose-500/25 hover:to-rose-600/25 dark:hover:from-rose-500/40 dark:hover:to-rose-600/40 text-rose-950 dark:text-rose-200 hover:text-rose-900 dark:hover:text-rose-100 border border-rose-500/35 dark:border-rose-400/40 hover:border-rose-500/60 dark:hover:border-rose-400/70 shadow-xs dark:shadow-[0_0_20px_-3px_rgba(244,63,94,0.25)] backdrop-blur-md font-semibold',
    buttonGradient: 'bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-700 hover:to-red-700 text-white shadow-lg shadow-rose-500/20',
    auroraOrb1: 'from-rose-400/40 via-red-500/30 to-transparent',
    auroraOrb2: 'from-pink-400/30 via-rose-600/25 to-transparent',
    beamColor: '#f43f5e',
    spotlightRgba: 'rgba(244, 63, 94, 0.14)'
  },
  indigo: {
    name: '深邃星空',
    borderClass: 'border-indigo-500/35 dark:border-indigo-500/25 hover:border-indigo-500/55 dark:hover:border-indigo-500/45 shadow-xs dark:shadow-[0_0_25px_-5px_rgba(99,102,241,0.12)]',
    iconBgClass: 'bg-gradient-to-br from-indigo-500/15 to-indigo-500/5 text-indigo-600 dark:text-indigo-300 border-indigo-500/25 dark:border-indigo-500/30 shadow-xs dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)]',
    badgeGradient: 'bg-gradient-to-r from-indigo-500/90 to-sky-500/90 text-white border-indigo-300/30 font-semibold shadow-sm',
    buttonGlassClass: 'bg-gradient-to-r from-indigo-500/15 via-violet-500/10 to-indigo-600/15 dark:from-indigo-500/25 dark:via-violet-500/15 dark:to-indigo-600/25 hover:from-indigo-500/25 hover:to-violet-500/25 dark:hover:from-indigo-500/40 dark:hover:to-violet-500/40 text-indigo-950 dark:text-indigo-200 hover:text-indigo-900 dark:hover:text-indigo-100 border border-indigo-500/35 dark:border-indigo-400/40 hover:border-indigo-500/60 dark:hover:border-indigo-400/70 shadow-xs dark:shadow-[0_0_20px_-3px_rgba(99,102,241,0.25)] backdrop-blur-md font-semibold',
    buttonGradient: 'bg-gradient-to-r from-indigo-600 to-sky-600 hover:from-indigo-700 hover:to-sky-700 text-white shadow-lg shadow-indigo-500/20',
    auroraOrb1: 'from-indigo-400/40 via-violet-500/30 to-transparent',
    auroraOrb2: 'from-blue-400/30 via-indigo-600/25 to-transparent',
    beamColor: '#6366f1',
    spotlightRgba: 'rgba(99, 102, 241, 0.14)'
  }
};
