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
  cardBgClass: string;
  cardShadowClass: string;
  priceBoxClass: string;
  iconBgClass: string;
  badgeGradient: string;
  buttonGlassClass: string;
  buttonGradient: string; // 回退兼容
  featureIconColor: string;
  topAmbientGlow: string;
  topRimHighlight: string;
  auroraOrb1: string;
  auroraOrb2: string;
  beamColor: string;
  spotlightRgba: string;
  shineBorderGradient: string;
  ambientNeonGlow: string;
  holographicFoilStyle: string;
}

export const RAINBOW_SHINE_GRADIENT =
  'conic-gradient(from 0deg, transparent 0deg 180deg, rgba(56,189,248,0.2) 220deg, #38bdf8 260deg, #a855f7 295deg, #f43f5e 330deg, #fbbf24 355deg, #ffffff 360deg)';

export const RAINBOW_HOLOGRAPHIC_FOIL =
  'linear-gradient(115deg, transparent 0%, rgba(244,63,94,0.4) 18%, rgba(168,85,247,0.48) 36%, rgba(56,189,248,0.52) 54%, rgba(52,211,153,0.45) 72%, rgba(251,191,36,0.48) 90%, transparent 100%)';

export const THEME_COLOR_CONFIGS: Record<PlanThemeColor, ThemeColorConfig> = {
  default: {
    name: '极简暗黑',
    borderClass: 'border-zinc-200/90 hover:border-zinc-300 dark:border-white/12 dark:hover:border-white/25',
    cardBgClass: 'bg-gradient-to-b from-white/95 via-white/85 to-slate-50/75 dark:from-zinc-900/75 dark:via-zinc-950/85 dark:to-neutral-950/95',
    cardShadowClass: 'shadow-[0_8px_30px_rgb(0,0,0,0.06),inset_0_1px_1.5px_rgba(255,255,255,0.8)] dark:shadow-[inset_0_1px_1.5px_rgba(255,255,255,0.18),0_12px_40px_-8px_rgba(0,0,0,0.85)]',
    priceBoxClass: 'bg-black/[0.02] border-black/[0.06] dark:bg-white/[0.03] dark:border-white/10 dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)]',
    iconBgClass: 'bg-zinc-100/80 text-foreground border-zinc-200/80 dark:bg-white/[0.06] dark:text-zinc-200 dark:border-white/10 shadow-xs',
    badgeGradient: 'bg-zinc-100 text-foreground border-zinc-200/80 dark:bg-white/10 dark:text-zinc-200 dark:border-white/15 backdrop-blur-md',
    buttonGlassClass: 'bg-zinc-900 hover:bg-zinc-800 text-zinc-50 font-semibold shadow-sm dark:bg-white/10 dark:hover:bg-white/15 dark:text-foreground dark:border-white/15 backdrop-blur-md',
    buttonGradient: 'bg-primary hover:bg-primary/90 text-primary-foreground',
    featureIconColor: 'text-zinc-500 dark:text-zinc-400',
    topAmbientGlow: 'from-zinc-400/15 via-zinc-400/[0.03] to-transparent dark:from-white/15 dark:via-white/[0.03] to-transparent',
    topRimHighlight: 'via-white/70 dark:via-white/50',
    auroraOrb1: 'from-zinc-400/20 via-slate-500/10 to-transparent',
    auroraOrb2: 'from-slate-600/15 via-zinc-700/10 to-transparent',
    beamColor: '#a1a1aa',
    spotlightRgba: 'rgba(255, 255, 255, 0.22)',
    shineBorderGradient: 'conic-gradient(from 0deg, transparent 0deg 200deg, rgba(255,255,255,0.15) 260deg, rgba(255,255,255,0.5) 320deg, rgba(255,255,255,0.95) 355deg, #ffffff 360deg)',
    ambientNeonGlow: 'from-zinc-400/25 via-slate-400/15 to-transparent dark:from-white/20 dark:via-zinc-400/10 to-transparent',
    holographicFoilStyle: 'linear-gradient(115deg, transparent 0%, rgba(186,230,253,0.3) 25%, rgba(244,114,182,0.35) 50%, rgba(253,224,71,0.35) 75%, rgba(167,243,208,0.3) 90%, transparent 100%)'
  },
  amber: {
    name: '金珀香槟',
    borderClass: 'border-amber-500/30 hover:border-amber-500/55 dark:border-amber-500/30 dark:hover:border-amber-500/50',
    cardBgClass: 'bg-gradient-to-b from-amber-50/40 via-white/85 to-white/95 dark:from-zinc-900/75 dark:via-zinc-950/85 dark:to-neutral-950/95',
    cardShadowClass: 'shadow-[0_8px_30px_rgba(245,158,11,0.08),inset_0_1px_1.5px_rgba(255,255,255,0.8)] dark:shadow-[inset_0_1px_1.5px_rgba(255,255,255,0.2),0_12px_40px_-8px_rgba(0,0,0,0.85)]',
    priceBoxClass: 'bg-amber-500/[0.04] border-amber-500/20 dark:bg-amber-500/[0.06] dark:border-amber-500/25 dark:shadow-[inset_0_1px_1px_rgba(245,158,11,0.1)]',
    iconBgClass: 'bg-amber-500/10 text-amber-600 border-amber-500/25 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30 shadow-xs',
    badgeGradient: 'bg-amber-500/15 text-amber-700 border-amber-500/30 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-400/30 font-semibold backdrop-blur-md',
    buttonGlassClass: 'bg-amber-500 hover:bg-amber-600 text-white font-semibold shadow-md shadow-amber-500/20 border border-amber-400/40 dark:bg-amber-500/20 dark:hover:bg-amber-500/30 dark:text-amber-200 dark:hover:text-amber-100 dark:border-amber-400/40 dark:shadow-[0_0_20px_-3px_rgba(245,158,11,0.3)] backdrop-blur-md',
    buttonGradient: 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white shadow-lg shadow-amber-500/20',
    featureIconColor: 'text-amber-600 dark:text-amber-400',
    topAmbientGlow: 'from-amber-400/25 via-amber-500/10 to-transparent dark:from-amber-400/30 dark:via-amber-500/[0.08] to-transparent',
    topRimHighlight: 'via-amber-300/90 dark:via-amber-300/70',
    auroraOrb1: 'from-amber-400/25 via-amber-500/10 to-transparent',
    auroraOrb2: 'from-yellow-400/20 via-orange-400/10 to-transparent',
    beamColor: '#f59e0b',
    spotlightRgba: 'rgba(245, 158, 11, 0.28)',
    shineBorderGradient: 'conic-gradient(from 0deg, transparent 0deg 190deg, rgba(245,158,11,0.15) 230deg, rgba(245,158,11,0.5) 280deg, rgba(251,191,36,0.95) 340deg, #ffffff 360deg)',
    ambientNeonGlow: 'from-amber-400/40 via-yellow-500/25 to-transparent dark:from-amber-500/35 dark:via-orange-500/20 to-transparent',
    holographicFoilStyle: 'linear-gradient(115deg, transparent 0%, rgba(245,158,11,0.25) 20%, rgba(251,191,36,0.45) 45%, rgba(255,255,255,0.4) 60%, rgba(249,115,22,0.4) 80%, transparent 100%)'
  },
  blue: {
    name: '极速冰蓝',
    borderClass: 'border-sky-500/30 hover:border-sky-500/55 dark:border-sky-500/30 dark:hover:border-sky-500/50',
    cardBgClass: 'bg-gradient-to-b from-sky-50/40 via-white/85 to-white/95 dark:from-zinc-900/75 dark:via-zinc-950/85 dark:to-slate-950/95',
    cardShadowClass: 'shadow-[0_8px_30px_rgba(56,189,248,0.08),inset_0_1px_1.5px_rgba(255,255,255,0.8)] dark:shadow-[inset_0_1px_1.5px_rgba(255,255,255,0.2),0_12px_40px_-8px_rgba(0,0,0,0.85)]',
    priceBoxClass: 'bg-sky-500/[0.04] border-sky-500/20 dark:bg-sky-500/[0.06] dark:border-sky-500/25 dark:shadow-[inset_0_1px_1px_rgba(56,189,248,0.1)]',
    iconBgClass: 'bg-sky-500/10 text-sky-600 border-sky-500/25 dark:bg-sky-500/15 dark:text-sky-300 dark:border-sky-500/30 shadow-xs',
    badgeGradient: 'bg-sky-500/15 text-sky-700 border-sky-500/30 dark:bg-sky-500/20 dark:text-sky-300 dark:border-sky-400/30 font-semibold backdrop-blur-md',
    buttonGlassClass: 'bg-sky-600 hover:bg-sky-700 text-white font-semibold shadow-md shadow-sky-500/20 border border-sky-500/40 dark:bg-sky-500/20 dark:hover:bg-sky-500/30 dark:text-sky-200 dark:hover:text-sky-100 dark:border-sky-400/40 dark:shadow-[0_0_20px_-3px_rgba(56,189,248,0.3)] backdrop-blur-md',
    buttonGradient: 'bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white shadow-lg shadow-blue-500/20',
    featureIconColor: 'text-sky-600 dark:text-sky-400',
    topAmbientGlow: 'from-sky-400/25 via-sky-500/10 to-transparent dark:from-sky-400/30 dark:via-sky-500/[0.08] to-transparent',
    topRimHighlight: 'via-sky-300/90 dark:via-sky-300/70',
    auroraOrb1: 'from-sky-400/25 via-blue-500/10 to-transparent',
    auroraOrb2: 'from-cyan-400/20 via-teal-400/10 to-transparent',
    beamColor: '#38bdf8',
    spotlightRgba: 'rgba(56, 189, 248, 0.28)',
    shineBorderGradient: 'conic-gradient(from 0deg, transparent 0deg 190deg, rgba(56,189,248,0.15) 230deg, rgba(56,189,248,0.5) 280deg, rgba(14,165,233,0.95) 340deg, #ffffff 360deg)',
    ambientNeonGlow: 'from-sky-400/40 via-blue-500/25 to-transparent dark:from-sky-500/40 dark:via-blue-600/25 to-transparent',
    holographicFoilStyle: 'linear-gradient(115deg, transparent 0%, rgba(56,189,248,0.25) 20%, rgba(147,197,253,0.45) 45%, rgba(255,255,255,0.4) 60%, rgba(34,211,238,0.4) 80%, transparent 100%)'
  },
  purple: {
    name: '星云薄暮',
    borderClass: 'border-purple-500/30 hover:border-purple-500/55 dark:border-purple-500/30 dark:hover:border-purple-500/50',
    cardBgClass: 'bg-gradient-to-b from-purple-50/40 via-white/85 to-white/95 dark:from-zinc-900/75 dark:via-zinc-950/85 dark:to-zinc-950/95',
    cardShadowClass: 'shadow-[0_8px_30px_rgba(168,85,247,0.08),inset_0_1px_1.5px_rgba(255,255,255,0.8)] dark:shadow-[inset_0_1px_1.5px_rgba(255,255,255,0.2),0_12px_40px_-8px_rgba(0,0,0,0.85)]',
    priceBoxClass: 'bg-purple-500/[0.04] border-purple-500/20 dark:bg-purple-500/[0.06] dark:border-purple-500/25 dark:shadow-[inset_0_1px_1px_rgba(168,85,247,0.1)]',
    iconBgClass: 'bg-purple-500/10 text-purple-600 border-purple-500/25 dark:bg-purple-500/15 dark:text-purple-300 dark:border-purple-500/30 shadow-xs',
    badgeGradient: 'bg-purple-500/15 text-purple-700 border-purple-500/30 dark:bg-purple-500/20 dark:text-purple-300 dark:border-purple-400/30 font-semibold backdrop-blur-md',
    buttonGlassClass: 'bg-purple-600 hover:bg-purple-700 text-white font-semibold shadow-md shadow-purple-500/20 border border-purple-500/40 dark:bg-purple-500/20 dark:hover:bg-purple-500/30 dark:text-purple-200 dark:hover:text-purple-100 dark:border-purple-400/40 dark:shadow-[0_0_20px_-3px_rgba(168,85,247,0.3)] backdrop-blur-md',
    buttonGradient: 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white shadow-lg shadow-purple-500/20',
    featureIconColor: 'text-purple-600 dark:text-purple-400',
    topAmbientGlow: 'from-purple-400/25 via-purple-500/10 to-transparent dark:from-purple-400/30 dark:via-purple-500/[0.08] to-transparent',
    topRimHighlight: 'via-purple-300/90 dark:via-purple-300/70',
    auroraOrb1: 'from-purple-400/25 via-fuchsia-500/10 to-transparent',
    auroraOrb2: 'from-indigo-400/20 via-purple-500/10 to-transparent',
    beamColor: '#a855f7',
    spotlightRgba: 'rgba(168, 85, 247, 0.28)',
    shineBorderGradient: 'conic-gradient(from 0deg, transparent 0deg 190deg, rgba(168,85,247,0.15) 230deg, rgba(168,85,247,0.5) 280deg, rgba(192,132,252,0.95) 340deg, #ffffff 360deg)',
    ambientNeonGlow: 'from-purple-400/40 via-fuchsia-500/25 to-transparent dark:from-purple-500/40 dark:via-fuchsia-600/25 to-transparent',
    holographicFoilStyle: 'linear-gradient(115deg, transparent 0%, rgba(168,85,247,0.25) 20%, rgba(216,180,254,0.45) 45%, rgba(255,255,255,0.4) 60%, rgba(244,114,182,0.4) 80%, transparent 100%)'
  },
  emerald: {
    name: '碧翠翡冷',
    borderClass: 'border-emerald-500/30 hover:border-emerald-500/55 dark:border-emerald-500/30 dark:hover:border-emerald-500/50',
    cardBgClass: 'bg-gradient-to-b from-emerald-50/40 via-white/85 to-white/95 dark:from-zinc-900/75 dark:via-zinc-950/85 dark:to-zinc-950/95',
    cardShadowClass: 'shadow-[0_8px_30px_rgba(16,185,129,0.08),inset_0_1px_1.5px_rgba(255,255,255,0.8)] dark:shadow-[inset_0_1px_1.5px_rgba(255,255,255,0.2),0_12px_40px_-8px_rgba(0,0,0,0.85)]',
    priceBoxClass: 'bg-emerald-500/[0.04] border-emerald-500/20 dark:bg-emerald-500/[0.06] dark:border-emerald-500/25 dark:shadow-[inset_0_1px_1px_rgba(16,185,129,0.1)]',
    iconBgClass: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/25 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30 shadow-xs',
    badgeGradient: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-amber-400/30 font-semibold backdrop-blur-md',
    buttonGlassClass: 'bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-md shadow-emerald-500/20 border border-emerald-500/40 dark:bg-emerald-500/20 dark:hover:bg-emerald-500/30 dark:text-emerald-200 dark:hover:text-emerald-100 dark:border-emerald-400/40 dark:shadow-[0_0_20px_-3px_rgba(16,185,129,0.3)] backdrop-blur-md',
    buttonGradient: 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-lg shadow-emerald-500/20',
    featureIconColor: 'text-emerald-600 dark:text-emerald-400',
    topAmbientGlow: 'from-emerald-400/25 via-emerald-500/10 to-transparent dark:from-emerald-400/30 dark:via-emerald-500/[0.08] to-transparent',
    topRimHighlight: 'via-emerald-300/90 dark:via-emerald-300/70',
    auroraOrb1: 'from-emerald-400/25 via-teal-500/10 to-transparent',
    auroraOrb2: 'from-teal-400/20 via-cyan-400/10 to-transparent',
    beamColor: '#10b981',
    spotlightRgba: 'rgba(16, 185, 129, 0.28)',
    shineBorderGradient: 'conic-gradient(from 0deg, transparent 0deg 190deg, rgba(16,185,129,0.15) 230deg, rgba(16,185,129,0.5) 280deg, rgba(52,211,153,0.95) 340deg, #ffffff 360deg)',
    ambientNeonGlow: 'from-emerald-400/40 via-teal-500/25 to-transparent dark:from-emerald-500/35 dark:via-teal-600/20 to-transparent',
    holographicFoilStyle: 'linear-gradient(115deg, transparent 0%, rgba(16,185,129,0.25) 20%, rgba(110,231,183,0.45) 45%, rgba(255,255,255,0.4) 60%, rgba(45,212,191,0.4) 80%, transparent 100%)'
  },
  rose: {
    name: '炽焰宝石',
    borderClass: 'border-rose-500/30 hover:border-rose-500/55 dark:border-rose-500/30 dark:hover:border-rose-500/50',
    cardBgClass: 'bg-gradient-to-b from-rose-50/40 via-white/85 to-white/95 dark:from-zinc-900/75 dark:via-zinc-950/85 dark:to-neutral-950/95',
    cardShadowClass: 'shadow-[0_8px_30px_rgba(244,63,94,0.08),inset_0_1px_1.5px_rgba(255,255,255,0.8)] dark:shadow-[inset_0_1px_1.5px_rgba(255,255,255,0.2),0_12px_40px_-8px_rgba(0,0,0,0.85)]',
    priceBoxClass: 'bg-rose-500/[0.04] border-rose-500/20 dark:bg-rose-500/[0.06] dark:border-rose-500/25 dark:shadow-[inset_0_1px_1px_rgba(244,63,94,0.1)]',
    iconBgClass: 'bg-rose-500/10 text-rose-600 border-rose-500/25 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30 shadow-xs',
    badgeGradient: 'bg-rose-500/15 text-rose-700 border-rose-500/30 dark:bg-rose-500/20 dark:text-rose-300 dark:border-rose-400/30 font-semibold backdrop-blur-md',
    buttonGlassClass: 'bg-rose-600 hover:bg-rose-700 text-white font-semibold shadow-md shadow-rose-500/20 border border-rose-500/40 dark:bg-rose-500/20 dark:hover:bg-rose-500/30 dark:text-rose-200 dark:hover:text-rose-100 dark:border-rose-400/40 dark:shadow-[0_0_20px_-3px_rgba(244,63,94,0.3)] backdrop-blur-md',
    buttonGradient: 'bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-700 hover:to-red-700 text-white shadow-lg shadow-rose-500/20',
    featureIconColor: 'text-rose-600 dark:text-rose-400',
    topAmbientGlow: 'from-rose-400/25 via-rose-500/10 to-transparent dark:from-rose-400/30 dark:via-rose-500/[0.08] to-transparent',
    topRimHighlight: 'via-rose-300/90 dark:via-rose-300/70',
    auroraOrb1: 'from-rose-400/25 via-pink-500/10 to-transparent',
    auroraOrb2: 'from-pink-400/20 via-rose-500/10 to-transparent',
    beamColor: '#f43f5e',
    spotlightRgba: 'rgba(244, 63, 94, 0.28)',
    shineBorderGradient: 'conic-gradient(from 0deg, transparent 0deg 190deg, rgba(244,63,94,0.15) 230deg, rgba(244,63,94,0.5) 280deg, rgba(251,113,133,0.95) 340deg, #ffffff 360deg)',
    ambientNeonGlow: 'from-rose-400/40 via-pink-500/25 to-transparent dark:from-rose-500/40 dark:via-pink-600/25 to-transparent',
    holographicFoilStyle: 'linear-gradient(115deg, transparent 0%, rgba(244,63,94,0.25) 20%, rgba(253,164,175,0.45) 45%, rgba(255,255,255,0.4) 60%, rgba(249,115,22,0.4) 80%, transparent 100%)'
  },
  indigo: {
    name: '深邃星空',
    borderClass: 'border-indigo-500/30 hover:border-indigo-500/55 dark:border-indigo-500/30 dark:hover:border-indigo-500/50',
    cardBgClass: 'bg-gradient-to-b from-indigo-50/40 via-white/85 to-white/95 dark:from-zinc-900/75 dark:via-zinc-950/85 dark:to-slate-950/95',
    cardShadowClass: 'shadow-[0_8px_30px_rgba(99,102,241,0.08),inset_0_1px_1.5px_rgba(255,255,255,0.8)] dark:shadow-[inset_0_1px_1.5px_rgba(255,255,255,0.2),0_12px_40px_-8px_rgba(0,0,0,0.85)]',
    priceBoxClass: 'bg-indigo-500/[0.04] border-indigo-500/20 dark:bg-indigo-500/[0.06] dark:border-indigo-500/25 dark:shadow-[inset_0_1px_1px_rgba(99,102,241,0.1)]',
    iconBgClass: 'bg-indigo-500/10 text-indigo-600 border-indigo-500/25 dark:bg-indigo-500/15 dark:text-indigo-300 dark:border-indigo-500/30 shadow-xs',
    badgeGradient: 'bg-indigo-500/15 text-indigo-700 border-indigo-500/30 dark:bg-indigo-500/20 dark:text-indigo-300 dark:border-indigo-400/30 font-semibold backdrop-blur-md',
    buttonGlassClass: 'bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-md shadow-indigo-500/20 border border-indigo-500/40 dark:bg-indigo-500/20 dark:hover:bg-indigo-500/30 dark:text-indigo-200 dark:hover:text-indigo-100 dark:border-indigo-400/40 dark:shadow-[0_0_20px_-3px_rgba(99,102,241,0.3)] backdrop-blur-md',
    buttonGradient: 'bg-gradient-to-r from-indigo-600 to-sky-600 hover:from-indigo-700 hover:to-sky-700 text-white shadow-lg shadow-indigo-500/20',
    featureIconColor: 'text-indigo-600 dark:text-indigo-400',
    topAmbientGlow: 'from-indigo-400/25 via-indigo-500/10 to-transparent dark:from-indigo-400/30 dark:via-indigo-500/[0.08] to-transparent',
    topRimHighlight: 'via-indigo-300/90 dark:via-indigo-300/70',
    auroraOrb1: 'from-indigo-400/25 via-violet-500/10 to-transparent',
    auroraOrb2: 'from-blue-400/20 via-indigo-500/10 to-transparent',
    beamColor: '#6366f1',
    spotlightRgba: 'rgba(99, 102, 241, 0.28)',
    shineBorderGradient: 'conic-gradient(from 0deg, transparent 0deg 190deg, rgba(99,102,241,0.15) 230deg, rgba(99,102,241,0.5) 280deg, rgba(129,140,248,0.95) 340deg, #ffffff 360deg)',
    ambientNeonGlow: 'from-indigo-400/40 via-violet-500/25 to-transparent dark:from-indigo-500/40 dark:via-violet-600/25 to-transparent',
    holographicFoilStyle: 'linear-gradient(115deg, transparent 0%, rgba(99,102,241,0.25) 20%, rgba(165,180,252,0.45) 45%, rgba(255,255,255,0.4) 60%, rgba(56,189,248,0.4) 80%, transparent 100%)'
  }
};
