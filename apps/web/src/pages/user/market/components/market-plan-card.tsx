import { useState, type ReactNode } from 'react';
import {
  Zap,
  Rocket,
  Crown,
  Shield,
  Sparkles,
  Star,
  Check,
  ArrowRight,
  type LucideIcon
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { formatBytes, formatCurrency } from '@/lib/utils';
import { cn } from '@/lib/utils';
import type { PlanCardConfig, PlanThemeColor } from '@/pages/admin/plans/use-plans';
import type { UserPlan } from '@/pages/user/subscription/use-user-subscription';
import { PLAN_ICONS, THEME_COLOR_CONFIGS } from './market-plan-constants';

const RESET_LABELS = {
  NONE: '不自动重置',
  CALENDAR_MONTH: '自然月重置',
  SUBSCRIPTION_CYCLE: '订阅周期重置'
} as const;

export interface MarketPlanCardProps {
  plan: UserPlan;
  isCurrent?: boolean;
  isLowerPriced?: boolean;
  activeSubscription?: boolean;
  onSelect?: (plan: UserPlan) => void;
  actionSlot?: ReactNode;
  isPreview?: boolean;
}

/**
 * 解析特性微标记语法:
 * [zap] [rocket] [crown] [shield] [sparkles] [star] 或行首 ! 加粗高亮
 */
function parseFeatureItem(raw: string) {
  let text = raw.trim();
  let IconComponent: LucideIcon = Check;
  let iconColor = 'text-emerald-500';
  let isHighlighted = false;

  if (text.startsWith('[zap]')) {
    IconComponent = Zap;
    iconColor = 'text-amber-500';
    text = text.replace('[zap]', '').trim();
  } else if (text.startsWith('[rocket]')) {
    IconComponent = Rocket;
    iconColor = 'text-blue-500';
    text = text.replace('[rocket]', '').trim();
  } else if (text.startsWith('[crown]')) {
    IconComponent = Crown;
    iconColor = 'text-yellow-500';
    text = text.replace('[crown]', '').trim();
  } else if (text.startsWith('[shield]')) {
    IconComponent = Shield;
    iconColor = 'text-emerald-500';
    text = text.replace('[shield]', '').trim();
  } else if (text.startsWith('[sparkles]')) {
    IconComponent = Sparkles;
    iconColor = 'text-purple-500';
    text = text.replace('[sparkles]', '').trim();
  } else if (text.startsWith('[star]')) {
    IconComponent = Star;
    iconColor = 'text-amber-400';
    text = text.replace('[star]', '').trim();
  }

  if (text.startsWith('!')) {
    isHighlighted = true;
    text = text.substring(1).trim();
  }

  return { IconComponent, iconColor, text, isHighlighted };
}

export function MarketPlanCard({
  plan,
  isCurrent = false,
  isLowerPriced = false,
  activeSubscription = false,
  onSelect,
  actionSlot,
  isPreview = false
}: MarketPlanCardProps) {
  const [mousePos, setMousePos] = useState({ x: -999, y: -999 });

  const cardConfig: PlanCardConfig = plan.cardConfig || {};
  const themeKey = (cardConfig.themeColor || 'default') as PlanThemeColor;
  const theme = THEME_COLOR_CONFIGS[themeKey] || THEME_COLOR_CONFIGS.default;

  const effect = cardConfig.animationEffect || 'none';
  const hasBeam = effect === 'beam' || effect === 'beam_pulse';
  const hasPulse = effect === 'pulse' || effect === 'beam_pulse';
  const isRainbow = cardConfig.beamColor === 'rainbow';
  const hasShimmer = cardConfig.shimmerButton ?? (plan.isFeatured || hasBeam);

  // Icon Resolution
  const selectedIconKey = cardConfig.icon || (plan.isFeatured ? 'Crown' : 'Zap');
  const IconComponent = PLAN_ICONS[selectedIconKey]?.icon || Zap;

  // Pricing
  const currentPrice = plan.price;
  const originalPrice = cardConfig.originalPrice;
  const hasDiscount = originalPrice != null && originalPrice > currentPrice;
  const discountText = cardConfig.discountText || (hasDiscount ? `立省 ${Math.round(((originalPrice - currentPrice) / originalPrice) * 100)}%` : null);

  // Button text
  const defaultActionText = isCurrent
    ? '当前使用中'
    : isLowerPriced
      ? '暂不支持降级'
      : activeSubscription
        ? '立即升配'
        : '立即订购';
  const buttonLabel = (!isCurrent && !isLowerPriced && cardConfig.buttonText) ? cardConfig.buttonText : defaultActionText;

  // Features
  const features = plan.features && plan.features.length > 0 ? plan.features : [
    `${formatBytes(plan.trafficLimitBytes)} 流量配额`,
    `流量规则：${RESET_LABELS[plan.trafficResetMode] || '自动重置'}`,
    '全格式支持 (Clash Meta / Sing-box / 通用订阅)',
    '智能授权接入所有高速节点'
  ];

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const handleMouseLeave = () => {
    setMousePos({ x: -999, y: -999 });
  };

  return (
    <div
      className={cn(
        'group relative flex flex-col justify-between transition-all duration-300',
        'rounded-2xl',
        hasBeam ? 'p-[1.5px] overflow-hidden' : 'p-0',
        hasPulse && 'hover:scale-[1.01]'
      )}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {/* 呼吸弥散光晕 (Ambient Pulse) */}
      {hasPulse && (
        <div
          className={cn(
            'absolute -inset-1.5 rounded-3xl blur-xl pointer-events-none -z-10 animate-ambient-pulse',
            theme.pulseBgClass
          )}
        />
      )}

      {/* 环绕流光边框 (Border Beam) */}
      {hasBeam && (
        <div
          className="absolute -inset-[160%] animate-border-beam pointer-events-none opacity-90"
          style={{
            background: isRainbow
              ? 'conic-gradient(from 0deg, transparent 0 240deg, #ec4899 280deg, #8b5cf6 315deg, #06b6d4 345deg, #3b82f6 360deg)'
              : `conic-gradient(from 0deg, transparent 0 270deg, ${theme.beamColor}55 315deg, ${theme.beamColor} 360deg)`
          }}
        />
      )}

      {/* 卡片主体 */}
      <Card
        className={cn(
          'relative flex flex-col justify-between h-full w-full overflow-hidden transition-all duration-300',
          'bg-card/95 backdrop-blur-sm',
          hasBeam ? 'rounded-[calc(1rem-1.5px)] border-0' : cn('rounded-2xl border', theme.borderClass),
          isCurrent && 'ring-2 ring-primary shadow-lg',
          plan.isFeatured && !isCurrent && !hasBeam && 'ring-1 ring-primary/40 shadow-md'
        )}
      >
        {/* 鼠标悬停光斑追踪 (Spotlight) */}
        <div
          className="pointer-events-none absolute -inset-px opacity-0 transition-opacity duration-300 group-hover:opacity-100 z-0"
          style={{
            background: `radial-gradient(280px circle at ${mousePos.x}px ${mousePos.y}px, ${theme.spotlightRgba}, transparent 80%)`
          }}
        />

        <div className="relative z-10 flex flex-col flex-1">
          <CardHeader className="pb-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-3">
                {/* 专业 Lucide 图标底座 */}
                <div
                  className={cn(
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border shadow-sm transition-transform duration-300 group-hover:scale-110',
                    theme.iconBgClass
                  )}
                >
                  <IconComponent className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-lg font-bold tracking-tight text-foreground">
                    {plan.name}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                    {plan.description || '全能代理高速网络订阅方案'}
                  </p>
                </div>
              </div>

              {/* 徽章组 */}
              <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                {isCurrent && (
                  <Badge variant="default" className="text-xs">
                    当前套餐
                  </Badge>
                )}
                {plan.badgeText && (
                  <Badge
                    variant={cardConfig.badgeVariant === 'outline' ? 'outline' : 'default'}
                    className={cn(
                      'text-xs px-2 py-0.5 font-medium',
                      cardConfig.badgeVariant === 'gradient' || !cardConfig.badgeVariant
                        ? theme.badgeGradient
                        : cardConfig.badgeVariant === 'glow'
                          ? 'bg-primary/10 text-primary border border-primary/30 shadow-sm'
                          : ''
                    )}
                  >
                    {plan.badgeText}
                  </Badge>
                )}
                {isPreview && (
                  <Badge variant="outline" className="text-[10px] text-muted-foreground border-dashed">
                    预览效果
                  </Badge>
                )}
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-4 flex-1">
            {/* 价格与折扣对比 */}
            <div className="flex items-baseline justify-between rounded-xl bg-muted/40 p-3 border border-border/50">
              <div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-3xl font-extrabold tracking-tight text-foreground">
                    {currentPrice === 0 ? '免费' : formatCurrency(Math.round(currentPrice * 100))}
                  </span>
                  <span className="text-xs font-normal text-muted-foreground">
                    / {plan.durationDays} 天
                  </span>
                </div>
                {hasDiscount && (
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                    <span>原价</span>
                    <span className="line-through">{formatCurrency(Math.round(originalPrice * 100))}</span>
                  </div>
                )}
              </div>

              {discountText && (
                <div className="shrink-0 text-right">
                  <span className="inline-block rounded-full bg-rose-500/10 px-2 py-0.5 text-xs font-bold text-rose-500 border border-rose-500/20">
                    {discountText}
                  </span>
                </div>
              )}
            </div>

            {/* 特性清单 */}
            <div className="space-y-2.5 text-sm pt-1">
              {features.map((featureRaw, idx) => {
                const { IconComponent: FeatureIcon, iconColor, text, isHighlighted } = parseFeatureItem(featureRaw);
                return (
                  <div key={idx} className="flex items-start gap-2.5">
                    <div className="mt-0.5 shrink-0">
                      <FeatureIcon className={cn('h-4 w-4', iconColor)} />
                    </div>
                    <span
                      className={cn(
                        'text-xs leading-relaxed',
                        isHighlighted ? 'font-semibold text-foreground' : 'text-foreground/80'
                      )}
                    >
                      {text}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </div>

        {/* 底部行动区域 */}
        <CardFooter className="relative z-10 pt-2 pb-5">
          {actionSlot ? (
            actionSlot
          ) : (
            <Button
              className={cn(
                'relative w-full overflow-hidden transition-all duration-300 font-medium group/btn',
                isCurrent || isLowerPriced ? 'variant-outline' : theme.buttonGradient
              )}
              variant={isCurrent || isLowerPriced ? 'outline' : 'default'}
              onClick={() => onSelect?.(plan)}
              disabled={isCurrent || isLowerPriced}
            >
              {/* 按钮金属扫光动效 (Shimmer) */}
              {hasShimmer && !isCurrent && !isLowerPriced && (
                <div className="absolute inset-0 -translate-x-full animate-shimmer pointer-events-none bg-gradient-to-r from-transparent via-white/25 to-transparent" />
              )}
              <span className="relative z-10 flex items-center justify-center gap-1.5">
                {buttonLabel}
                {!isCurrent && !isLowerPriced && (
                  <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover/btn:translate-x-0.5" />
                )}
              </span>
            </Button>
          )}
        </CardFooter>

        {isLowerPriced && (
          <p className="px-6 pb-4 text-center text-xs text-muted-foreground">
            目标套餐价格低于当前套餐，暂不支持直接降级
          </p>
        )}
      </Card>
    </div>
  );
}
