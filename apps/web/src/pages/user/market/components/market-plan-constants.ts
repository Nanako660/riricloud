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

export const THEME_COLOR_CONFIGS: Record<
  PlanThemeColor,
  {
    name: string;
    borderClass: string;
    iconBgClass: string;
    badgeGradient: string;
    buttonGradient: string;
    beamColor: string;
    pulseBgClass: string;
    spotlightRgba: string;
  }
> = {
  default: {
    name: '经典暗黑 / 极简',
    borderClass: 'border-border hover:border-border/80',
    iconBgClass: 'bg-muted text-foreground border-border',
    badgeGradient: 'bg-muted text-foreground border-border',
    buttonGradient: 'bg-primary hover:bg-primary/90 text-primary-foreground',
    beamColor: '#71717a',
    pulseBgClass: 'bg-zinc-500/15',
    spotlightRgba: 'rgba(255, 255, 255, 0.08)'
  },
  amber: {
    name: '尊享金',
    borderClass: 'border-amber-500/30 hover:border-amber-500/50',
    iconBgClass: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
    badgeGradient: 'bg-gradient-to-r from-amber-500 to-yellow-400 text-black border-transparent font-semibold shadow-sm',
    buttonGradient: 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white shadow-lg shadow-amber-500/20',
    beamColor: '#f59e0b',
    pulseBgClass: 'bg-amber-500/25',
    spotlightRgba: 'rgba(245, 158, 11, 0.15)'
  },
  blue: {
    name: '极速蓝',
    borderClass: 'border-blue-500/30 hover:border-blue-500/50',
    iconBgClass: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
    badgeGradient: 'bg-gradient-to-r from-blue-500 to-cyan-400 text-white border-transparent font-semibold shadow-sm',
    buttonGradient: 'bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white shadow-lg shadow-blue-500/20',
    beamColor: '#3b82f6',
    pulseBgClass: 'bg-blue-500/25',
    spotlightRgba: 'rgba(59, 130, 246, 0.15)'
  },
  purple: {
    name: '星云紫',
    borderClass: 'border-purple-500/30 hover:border-purple-500/50',
    iconBgClass: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
    badgeGradient: 'bg-gradient-to-r from-purple-500 to-pink-500 text-white border-transparent font-semibold shadow-sm',
    buttonGradient: 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white shadow-lg shadow-purple-500/20',
    beamColor: '#a855f7',
    pulseBgClass: 'bg-purple-500/25',
    spotlightRgba: 'rgba(168, 85, 247, 0.15)'
  },
  emerald: {
    name: '碧翠绿',
    borderClass: 'border-emerald-500/30 hover:border-emerald-500/50',
    iconBgClass: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
    badgeGradient: 'bg-gradient-to-r from-emerald-500 to-teal-400 text-white border-transparent font-semibold shadow-sm',
    buttonGradient: 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-lg shadow-emerald-500/20',
    beamColor: '#10b981',
    pulseBgClass: 'bg-emerald-500/25',
    spotlightRgba: 'rgba(16, 185, 129, 0.15)'
  },
  rose: {
    name: '烈焰红',
    borderClass: 'border-rose-500/30 hover:border-rose-500/50',
    iconBgClass: 'bg-rose-500/10 text-rose-500 border-rose-500/20',
    badgeGradient: 'bg-gradient-to-r from-rose-500 to-red-500 text-white border-transparent font-semibold shadow-sm',
    buttonGradient: 'bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-700 hover:to-red-700 text-white shadow-lg shadow-rose-500/20',
    beamColor: '#f43f5e',
    pulseBgClass: 'bg-rose-500/25',
    spotlightRgba: 'rgba(244, 63, 94, 0.15)'
  },
  indigo: {
    name: '深邃靛',
    borderClass: 'border-indigo-500/30 hover:border-indigo-500/50',
    iconBgClass: 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20',
    badgeGradient: 'bg-gradient-to-r from-indigo-500 to-sky-400 text-white border-transparent font-semibold shadow-sm',
    buttonGradient: 'bg-gradient-to-r from-indigo-600 to-sky-600 hover:from-indigo-700 hover:to-sky-700 text-white shadow-lg shadow-indigo-500/20',
    beamColor: '#6366f1',
    pulseBgClass: 'bg-indigo-500/25',
    spotlightRgba: 'rgba(99, 102, 241, 0.15)'
  }
};
