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
  let iconColor = 'text-emerald-400';
  let isHighlighted = false;

  if (text.startsWith('[zap]')) {
    IconComponent = Zap;
    iconColor = 'text-amber-500 dark:text-amber-400';
    text = text.replace('[zap]', '').trim();
  } else if (text.startsWith('[rocket]')) {
    IconComponent = Rocket;
    iconColor = 'text-sky-500 dark:text-sky-400';
    text = text.replace('[rocket]', '').trim();
  } else if (text.startsWith('[crown]')) {
    IconComponent = Crown;
    iconColor = 'text-amber-600 dark:text-amber-300';
    text = text.replace('[crown]', '').trim();
  } else if (text.startsWith('[shield]')) {
    IconComponent = Shield;
    iconColor = 'text-emerald-500 dark:text-emerald-400';
    text = text.replace('[shield]', '').trim();
  } else if (text.startsWith('[sparkles]')) {
    IconComponent = Sparkles;
    iconColor = 'text-purple-500 dark:text-purple-400';
    text = text.replace('[sparkles]', '').trim();
  } else if (text.startsWith('[star]')) {
    IconComponent = Star;
    iconColor = 'text-yellow-600 dark:text-yellow-300';
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
  const hasSheen = effect === 'beam' || effect === 'beam_pulse';
  const hasAurora = effect === 'pulse' || effect === 'beam_pulse' || plan.isFeatured;
  const isRainbow = cardConfig.beamColor === 'rainbow';
  const hasShimmer = cardConfig.shimmerButton ?? (plan.isFeatured || hasSheen);

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
        hasSheen ? 'p-[1.5px] overflow-hidden' : 'p-0',
        'hover:scale-[1.012]'
      )}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {/* 晶体边缘漫射折射微光 (Crystal Sheen) */}
      {hasSheen && (
        <div
          className="absolute -inset-[140%] animate-crystal-sheen pointer-events-none opacity-85 blur-[0.8px]"
          style={{
            background: isRainbow
              ? 'conic-gradient(from 0deg, transparent 0 220deg, rgba(99,102,241,0.25) 260deg, rgba(168,85,247,0.6) 295deg, rgba(6,182,212,0.7) 330deg, rgba(16,185,129,0.4) 355deg, transparent 360deg)'
              : `conic-gradient(from 0deg, transparent 0 250deg, ${theme.beamColor}25 290deg, ${theme.beamColor}75 335deg, transparent 360deg)`
          }}
        />
      )}

      {/* 微透磨砂卡片主体 (Smoked Glassmorphism) */}
      <Card
        className={cn(
          'relative flex flex-col justify-between h-full w-full overflow-hidden transition-all duration-300',
          'bg-card/95 dark:bg-card/75 backdrop-blur-xl',
          theme.cardShadowClass,
          hasSheen
            ? 'rounded-[calc(1rem-1.5px)] border border-border/80 dark:border-white/10'
            : cn('rounded-2xl border', theme.borderClass),
          isCurrent && 'ring-2 ring-primary/80 shadow-md shadow-primary/10',
          plan.isFeatured && !isCurrent && 'ring-1 ring-primary/30 dark:ring-primary/20'
        )}
      >
        {/* 流体极光内衬光池 (Fluid Aurora Engine) */}
        {hasAurora && (
          <div className="pointer-events-none absolute inset-0 overflow-hidden z-0 opacity-80 dark:opacity-100 transition-opacity duration-300">
            {/* 主流体极光光池 1 */}
            <div
              className={cn(
                'absolute -top-12 -left-12 h-64 w-64 rounded-full bg-gradient-to-br blur-3xl animate-aurora-1',
                isRainbow
                  ? 'from-indigo-400/50 via-purple-500/40 to-transparent'
                  : theme.auroraOrb1
              )}
            />
            {/* 辅助逆向流体极光光池 2 */}
            <div
              className={cn(
                'absolute -bottom-12 -right-12 h-60 w-60 rounded-full bg-gradient-to-tl blur-3xl animate-aurora-2',
                isRainbow
                  ? 'from-cyan-400/45 via-emerald-500/35 to-transparent'
                  : theme.auroraOrb2
              )}
            />
          </div>
        )}

        {/* 顶部 1px 倒角微光折射微线 (Chamfered Edge Light) */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/80 dark:via-white/20 to-transparent z-20" />

        {/* 鼠标悬停光斑追踪 (Spotlight) */}
        <div
          className="pointer-events-none absolute -inset-px opacity-0 transition-opacity duration-300 group-hover:opacity-100 z-10"
          style={{
            background: `radial-gradient(240px circle at ${mousePos.x}px ${mousePos.y}px, ${theme.spotlightRgba}, transparent 80%)`
          }}
        />

        <div className="relative z-10 flex flex-col flex-1">
          <CardHeader className="pb-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-3">
                {/* 专业 Lucide 矢量图标微光底座 */}
                <div
                  className={cn(
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-all duration-300 group-hover:scale-105',
                    theme.iconBgClass
                  )}
                >
                  <IconComponent className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-base font-bold tracking-tight text-foreground">
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
                          ? 'bg-primary/10 text-primary border border-primary/25 shadow-sm'
                          : ''
                    )}
                  >
                    {plan.badgeText}
                  </Badge>
                )}
                {isPreview && (
                  <Badge variant="outline" className="text-[10px] text-muted-foreground border-dashed bg-muted/20">
                    实机预览
                  </Badge>
                )}
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-4 flex-1">
            {/* 价格与折扣对比（微透晶体面板） */}
            <div
              className={cn(
                'flex items-baseline justify-between rounded-xl backdrop-blur-md p-3 border shadow-xs dark:shadow-inner transition-colors duration-300',
                theme.priceBoxClass
              )}
            >
              <div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-extrabold tracking-tight text-foreground">
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
                  <span className="inline-block rounded-full bg-rose-500/15 dark:bg-rose-500/15 px-2.5 py-0.5 text-xs font-bold text-rose-700 dark:text-rose-400 border border-rose-500/30 dark:border-rose-500/25 shadow-xs">
                    {discountText}
                  </span>
                </div>
              )}
            </div>

            {/* 特性清单 */}
            <div className="space-y-2 text-sm pt-1">
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
                        isHighlighted ? 'font-semibold text-foreground' : 'text-foreground/85'
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
                'relative w-full overflow-hidden transition-all duration-300 font-medium group/btn h-10',
                isCurrent || isLowerPriced ? 'variant-outline' : theme.buttonGlassClass
              )}
              variant={isCurrent || isLowerPriced ? 'outline' : 'ghost'}
              onClick={() => onSelect?.(plan)}
              disabled={isCurrent || isLowerPriced}
            >
              {/* 按钮金属微光扫光动效 (Shimmer) */}
              {hasShimmer && !isCurrent && !isLowerPriced && (
                <div className="absolute inset-0 -translate-x-full animate-shimmer pointer-events-none bg-gradient-to-r from-transparent via-white/20 to-transparent" />
              )}
              <span className="relative z-10 flex items-center justify-center gap-1.5 text-sm tracking-wide">
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
