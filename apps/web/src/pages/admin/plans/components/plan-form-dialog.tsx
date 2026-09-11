import { zodResolver } from '@hookform/resolvers/zod';
import { useFormResetOnKey } from '@/hooks/use-form-reset';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ResponsiveDialog, ResponsiveDialogContent } from '@/components/shared/responsive-dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  type Plan,
  type PlanPayload,
  type PlanThemeColor,
  type PlanAnimationEffect,
  type PlanBeamColor,
  type PlanBadgeVariant,
  usePlanMutations
} from '../use-plans';
import type { AdminLine } from '../../lines/use-lines';
import type { UserPlan } from '@/pages/user/subscription/use-user-subscription';
import { MarketPlanCard } from '@/pages/user/market/components/market-plan-card';
import { PLAN_ICONS } from '@/pages/user/market/components/market-plan-constants';
import { Sparkles, Palette, Eye, HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

const PRESET_FEATURES = [
  '[zap] 1000Mbps 极速专线接入',
  '[rocket] 4K / 8K 流媒体晚高峰零卡顿',
  '[crown] 尊享 VIP 专线与原生节点',
  '[shield] 企业级高匿专享防探测保护',
  '[sparkles] 包含全格式智能托管',
  '[star] 独享原生 IP 解锁流媒体',
  '!7x24 小时 SLA 高可用服务保障'
];

const THEME_OPTIONS: Array<{ key: PlanThemeColor; name: string; bgClass: string }> = [
  { key: 'default', name: '极简暗黑', bgClass: 'bg-zinc-600' },
  { key: 'amber', name: '金珀香槟', bgClass: 'bg-amber-500' },
  { key: 'blue', name: '极速冰蓝', bgClass: 'bg-sky-500' },
  { key: 'purple', name: '星云薄暮', bgClass: 'bg-purple-500' },
  { key: 'emerald', name: '碧翠翡冷', bgClass: 'bg-emerald-500' },
  { key: 'rose', name: '炽焰宝石', bgClass: 'bg-rose-500' },
  { key: 'indigo', name: '深邃星空', bgClass: 'bg-indigo-500' }
];

const schema = z.object({
  name: z.string().min(1, '请输入套餐名称'),
  description: z.string().optional(),
  price: z.coerce.number().min(0).multipleOf(0.01, '最多保留两位小数'),
  durationDays: z.coerce.number().int().min(1),
  trafficLimitGB: z.coerce.number().positive('流量必须大于 0'),
  trafficResetMode: z.enum(['NONE', 'CALENDAR_MONTH', 'SUBSCRIPTION_CYCLE']),
  lineMatchMode: z.enum(['ALL', 'TAGS', 'EXPLICIT']),
  lineTags: z.string().optional(),
  lineIds: z.string().optional(),
  templateId: z.string().optional(),
  badgeText: z.string().optional(),
  isFeatured: z.boolean(),
  featuresText: z.string().optional(),
  isPublic: z.boolean(),
  sortOrder: z.coerce.number().int().min(0),
  // 视觉与营销动效配置
  themeColor: z.enum(['default', 'amber', 'blue', 'purple', 'emerald', 'rose', 'indigo']),
  icon: z.string().min(1),
  buttonText: z.string().optional(),
  originalPrice: z.preprocess(
    (val) => (val === '' || val === null || val === undefined ? undefined : Number(val)),
    z.number().min(0).optional().nullable()
  ),
  discountText: z.string().optional(),
  badgeVariant: z.enum(['default', 'outline', 'secondary', 'glow', 'gradient']),
  animationEffect: z.enum(['none', 'beam', 'pulse', 'beam_pulse']),
  beamColor: z.enum(['theme', 'rainbow']),
  shimmerButton: z.boolean()
});

type FormValues = z.infer<typeof schema>;
const GB = 1024 ** 3;

interface PlanFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: Plan | null;
  lineOptions: AdminLine[];
  templateOptions: Array<{ id: string; name: string }>;
}

export function PlanFormDialog({
  open,
  onOpenChange,
  plan,
  lineOptions,
  templateOptions
}: PlanFormDialogProps) {
  const { create, update } = usePlanMutations();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      description: '',
      price: 0,
      durationDays: 30,
      trafficLimitGB: 100,
      trafficResetMode: 'NONE',
      lineMatchMode: 'ALL',
      lineTags: '',
      lineIds: '',
      templateId: '',
      badgeText: '',
      isFeatured: false,
      featuresText: '',
      isPublic: true,
      sortOrder: 0,
      themeColor: 'default',
      icon: 'Zap',
      buttonText: '',
      originalPrice: null,
      discountText: '',
      badgeVariant: 'gradient',
      animationEffect: 'none',
      beamColor: 'theme',
      shimmerButton: true
    }
  });

  const lineTags = Array.from(new Set(lineOptions.flatMap((line) => line.tags))).sort();
  const selectedTags = (form.watch('lineTags') ?? '').split(',').map((tag) => tag.trim()).filter(Boolean);
  const selectedIds = (form.watch('lineIds') ?? '').split(',').map((id) => id.trim()).filter(Boolean);

  const toggleTag = (tag: string) => {
    const next = selectedTags.includes(tag)
      ? selectedTags.filter((item) => item !== tag)
      : [...selectedTags, tag];
    form.setValue('lineTags', next.join(', '), { shouldDirty: true });
  };

  const toggleLine = (id: string) => {
    const next = selectedIds.includes(id)
      ? selectedIds.filter((item) => item !== id)
      : [...selectedIds, id];
    form.setValue('lineIds', next.join(', '), { shouldDirty: true });
  };

  const addPresetFeature = (feature: string) => {
    const current = (form.getValues('featuresText') || '')
      .split('\n')
      .map((f) => f.trim())
      .filter(Boolean);
    if (!current.includes(feature)) {
      const next = [...current, feature].join('\n');
      form.setValue('featuresText', next, { shouldDirty: true });
    }
  };

  useFormResetOnKey({
    open,
    resetKey: plan?.id ?? 'create',
    reset: () =>
      form.reset(
        plan
          ? {
              name: plan.name,
              description: plan.description ?? '',
              price: plan.price,
              durationDays: plan.durationDays,
              trafficLimitGB: plan.trafficLimitBytes / GB,
              trafficResetMode: plan.trafficResetMode ?? 'NONE',
              lineMatchMode: plan.lineMatchMode,
              lineTags: plan.lineTags.join(', '),
              lineIds: plan.lineIds.join(', '),
              templateId: plan.templateId ?? '',
              badgeText: plan.badgeText ?? '',
              isFeatured: plan.isFeatured ?? false,
              featuresText: plan.features?.join('\n') ?? '',
              isPublic: plan.isPublic,
              sortOrder: plan.sortOrder,
              themeColor: plan.cardConfig?.themeColor ?? 'default',
              icon: plan.cardConfig?.icon ?? 'Zap',
              buttonText: plan.cardConfig?.buttonText ?? '',
              originalPrice: plan.cardConfig?.originalPrice ?? null,
              discountText: plan.cardConfig?.discountText ?? '',
              badgeVariant: plan.cardConfig?.badgeVariant ?? 'gradient',
              animationEffect: plan.cardConfig?.animationEffect ?? 'none',
              beamColor: plan.cardConfig?.beamColor ?? 'theme',
              shimmerButton: plan.cardConfig?.shimmerButton ?? true
            }
          : undefined
      )
  });

  const submit = (values: FormValues) => {
    const features = values.featuresText
      ? values.featuresText
          .split('\n')
          .map((item) => item.trim())
          .filter(Boolean)
      : [];

    const payload: PlanPayload = {
      name: values.name,
      description: values.description,
      price: values.price,
      durationDays: values.durationDays,
      trafficLimitBytes: Math.round(values.trafficLimitGB * GB),
      trafficResetMode: values.trafficResetMode,
      lineMatchMode: values.lineMatchMode,
      lineTags: values.lineTags?.split(',').map((tag) => tag.trim()).filter(Boolean) ?? [],
      lineIds: values.lineIds?.split(',').map((id) => id.trim()).filter(Boolean) ?? [],
      templateId: values.templateId || null,
      badgeText: values.badgeText?.trim() || null,
      isFeatured: values.isFeatured,
      features,
      isPublic: values.isPublic,
      sortOrder: values.sortOrder,
      cardConfig: {
        themeColor: values.themeColor,
        icon: values.icon,
        buttonText: values.buttonText?.trim() || null,
        originalPrice: values.originalPrice != null && values.originalPrice > 0 ? Number(values.originalPrice) : null,
        discountText: values.discountText?.trim() || null,
        badgeVariant: values.badgeVariant,
        animationEffect: values.animationEffect,
        beamColor: values.beamColor,
        shimmerButton: values.shimmerButton
      }
    };

    if (plan) {
      update.mutate({ id: plan.id, ...payload }, { onSuccess: () => onOpenChange(false) });
    } else {
      create.mutate(payload, { onSuccess: () => onOpenChange(false) });
    }
  };

  const busy = create.isPending || update.isPending;

  // 构造即时实机预览数据 (Live Preview Plan)
  const watchedValues = form.watch();
  const previewPlan: UserPlan = {
    id: plan?.id || 'preview',
    name: watchedValues.name || '示例套餐名称',
    description: watchedValues.description || '全能代理高速网络订阅方案',
    price: Number(watchedValues.price) || 0,
    durationDays: Number(watchedValues.durationDays) || 30,
    trafficLimitBytes: Math.round((Number(watchedValues.trafficLimitGB) || 100) * GB),
    trafficResetMode: watchedValues.trafficResetMode || 'NONE',
    lineMatchMode: watchedValues.lineMatchMode || 'ALL',
    badgeText: watchedValues.badgeText || null,
    isFeatured: watchedValues.isFeatured,
    features: watchedValues.featuresText
      ? watchedValues.featuresText.split('\n').filter(Boolean)
      : undefined,
    cardConfig: {
      themeColor: watchedValues.themeColor as PlanThemeColor,
      icon: watchedValues.icon,
      buttonText: watchedValues.buttonText,
      originalPrice: watchedValues.originalPrice ? Number(watchedValues.originalPrice) : null,
      discountText: watchedValues.discountText,
      badgeVariant: watchedValues.badgeVariant as PlanBadgeVariant,
      animationEffect: watchedValues.animationEffect as PlanAnimationEffect,
      beamColor: watchedValues.beamColor as PlanBeamColor,
      shimmerButton: watchedValues.shimmerButton
    }
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>{plan ? '编辑套餐' : '新建套餐'}</DialogTitle>
          <DialogDescription>
            配置配额、有效期、线路范围、卡片视觉动效与实机展示效果。
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 lg:grid-cols-12 items-start">
          {/* 左侧配置表单 */}
          <form onSubmit={form.handleSubmit(submit)} className="space-y-6 lg:col-span-7">
            {/* 1. 基础配置 */}
            <div className="space-y-4 rounded-xl border p-4 bg-card">
              <h4 className="text-sm font-semibold flex items-center gap-2 text-foreground">
                基础与网络配额
              </h4>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="plan-name">套餐名称</Label>
                  <Input id="plan-name" placeholder="例如：极速专线月付套餐" {...form.register('name')} />
                  {form.formState.errors.name && (
                    <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
                  )}
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="plan-description">描述信息</Label>
                  <Input
                    id="plan-description"
                    placeholder="针对极速 4K 办公与流媒体设计的入门高性价比方案"
                    {...form.register('description')}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="plan-price">现价售价（元）</Label>
                  <Input id="plan-price" type="number" min="0" step="0.01" {...form.register('price')} />
                  {form.formState.errors.price && (
                    <p className="text-xs text-destructive">{form.formState.errors.price.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="plan-days">有效期（天）</Label>
                  <Input id="plan-days" type="number" min="1" {...form.register('durationDays')} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="plan-traffic">流量配额（GiB）</Label>
                  <Input id="plan-traffic" type="number" min="1" step="0.1" {...form.register('trafficLimitGB')} />
                </div>

                <div className="space-y-2">
                  <Label>流量重置策略</Label>
                  <Controller
                    control={form.control}
                    name="trafficResetMode"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="NONE">不自动重置</SelectItem>
                          <SelectItem value="CALENDAR_MONTH">自然月重置</SelectItem>
                          <SelectItem value="SUBSCRIPTION_CYCLE">订阅周期重置</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="plan-sort">排序权重</Label>
                  <Input id="plan-sort" type="number" min="0" placeholder="0" {...form.register('sortOrder')} />
                  <p className="text-[11px] text-muted-foreground">数值越小在市场中排序越靠前</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="plan-badge">角标文本（可选）</Label>
                  <Input id="plan-badge" placeholder="例如：HOT、镇店之宝、8.5折" {...form.register('badgeText')} />
                </div>
              </div>
            </div>

            {/* 2. 视觉风格与动效配置 */}
            <div className="space-y-4 rounded-xl border p-4 bg-card">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold flex items-center gap-2 text-foreground">
                  <Palette className="h-4 w-4 text-primary" />
                  卡片视觉与流光动效配置
                </h4>
                <Badge variant="secondary" className="text-[11px] gap-1 font-normal">
                  <Sparkles className="h-3 w-3 text-amber-500" />
                  完全可配置
                </Badge>
              </div>

              {/* 主题色系选择 */}
              <div className="space-y-2">
                <Label className="text-xs font-medium text-foreground/90">主题色系</Label>
                <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                  {THEME_OPTIONS.map((theme) => {
                    const isSelected = form.watch('themeColor') === theme.key;
                    return (
                      <button
                        key={theme.key}
                        type="button"
                        onClick={() => form.setValue('themeColor', theme.key, { shouldDirty: true })}
                        className={cn(
                          'flex flex-col items-center gap-1.5 p-2 rounded-lg border text-center transition-all',
                          isSelected
                            ? 'border-primary ring-2 ring-primary/40 bg-accent/40 font-semibold'
                            : 'border-border/60 hover:border-border hover:bg-muted/40'
                        )}
                      >
                        <span className={cn('h-4 w-4 rounded-full shadow-sm', theme.bgClass)} />
                        <span className="text-[11px] leading-tight">{theme.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 专业 Lucide 图标网格 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium text-foreground/90">卡片专属专业图标</Label>
                  <span className="text-[11px] text-muted-foreground">纯 Lucide 矢量图标，杜绝 emoji</span>
                </div>
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                  {Object.entries(PLAN_ICONS).map(([key, info]) => {
                    const IconComp = info.icon;
                    const isSelected = form.watch('icon') === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => form.setValue('icon', key, { shouldDirty: true })}
                        className={cn(
                          'flex flex-col items-center gap-1 p-2 rounded-lg border text-center transition-all',
                          isSelected
                            ? 'border-primary ring-2 ring-primary/40 bg-accent/50 text-foreground font-semibold'
                            : 'border-border/60 hover:border-border hover:bg-muted/40 text-muted-foreground'
                        )}
                      >
                        <IconComp className="h-4 w-4" />
                        <span className="text-[10px] leading-tight">{info.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 动效模式与流光颜色 */}
              <div className="grid gap-3 sm:grid-cols-2 pt-1">
                <div className="space-y-2">
                  <Label className="text-xs font-medium">卡片动效模式</Label>
                  <Controller
                    control={form.control}
                    name="animationEffect"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">无动效（常规极简）</SelectItem>
                          <SelectItem value="pulse">流体极光 (Fluid Aurora)</SelectItem>
                          <SelectItem value="beam">晶体微光漫射 (Crystal Sheen)</SelectItem>
                          <SelectItem value="beam_pulse">北欧极光 + 晶体漫射 (Aurora & Sheen)</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-medium">流光边框光色</Label>
                  <Controller
                    control={form.control}
                    name="beamColor"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="theme">主题宝石单色光晕</SelectItem>
                          <SelectItem value="rainbow">北欧极光幻彩 (Nordic Aurora)</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
              </div>

              {/* 营销对比与文案定制 */}
              <div className="grid gap-3 sm:grid-cols-3 pt-1">
                <div className="space-y-2">
                  <Label htmlFor="plan-orig-price" className="text-xs">划线原价（元）</Label>
                  <Input
                    id="plan-orig-price"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="例如：68.00"
                    {...form.register('originalPrice')}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="plan-discount-text" className="text-xs">折扣文案（可选）</Label>
                  <Input
                    id="plan-discount-text"
                    placeholder="例如：限时 7.5 折"
                    {...form.register('discountText')}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="plan-btn-text" className="text-xs">自定义按钮文案</Label>
                  <Input
                    id="plan-btn-text"
                    placeholder="默认：立即订购"
                    {...form.register('buttonText')}
                  />
                </div>
              </div>

              {/* 角标风格与开关 */}
              <div className="grid gap-3 sm:grid-cols-2 pt-2">
                <div className="space-y-2">
                  <Label className="text-xs font-medium">角标视觉样式</Label>
                  <Controller
                    control={form.control}
                    name="badgeVariant"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="gradient">质感渐变高光 (Gradient)</SelectItem>
                          <SelectItem value="glow">微光柔和 (Glow)</SelectItem>
                          <SelectItem value="outline">线框精致 (Outline)</SelectItem>
                          <SelectItem value="default">经典纯色 (Default)</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>

                <div className="flex items-center justify-between rounded-lg border p-2.5 bg-muted/20 self-end h-9">
                  <Label htmlFor="plan-shimmer" className="text-xs font-medium cursor-pointer">
                    按钮金属微光扫光 (Shimmer)
                  </Label>
                  <Controller
                    control={form.control}
                    name="shimmerButton"
                    render={({ field }) => (
                      <Switch id="plan-shimmer" checked={field.value} onCheckedChange={field.onChange} />
                    )}
                  />
                </div>
              </div>

              {/* 主推推荐开关 */}
              <div className="rounded-lg border p-3 bg-muted/20 flex items-center justify-between">
                <div>
                  <Label htmlFor="plan-featured" className="font-medium text-xs">
                    设为主推热卖套餐
                  </Label>
                  <p className="text-[11px] text-muted-foreground">
                    主推套餐在套餐市场拥有高亮外框与景深阴影，引导用户优先选购
                  </p>
                </div>
                <Controller
                  control={form.control}
                  name="isFeatured"
                  render={({ field }) => (
                    <Switch id="plan-featured" checked={field.value} onCheckedChange={field.onChange} />
                  )}
                />
              </div>
            </div>

            {/* 3. 权益特性清单与线路 */}
            <div className="space-y-4 rounded-xl border p-4 bg-card">
              <h4 className="text-sm font-semibold flex items-center gap-2 text-foreground">
                特性清单与线路匹配
              </h4>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="plan-features" className="text-xs">自定义权益特性清单</Label>
                  <span className="text-[11px] text-muted-foreground">每行一项，支持图标微标记</span>
                </div>
                <Textarea
                  id="plan-features"
                  rows={4}
                  placeholder="[zap] 1000Mbps 极速专线接入&#10;[rocket] 4K / 8K 流媒体晚高峰零卡顿&#10;[crown] 尊享 VIP 专线与原生节点&#10;!7x24 小时 SLA 高可用服务保障"
                  {...form.register('featuresText')}
                />
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[11px] text-muted-foreground">快捷填入：</span>
                  {PRESET_FEATURES.map((item) => (
                    <Button
                      key={item}
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-6 text-[11px] px-2"
                      onClick={() => addPresetFeature(item)}
                    >
                      + {item.replace(/\[\w+\]\s*/, '')}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">线路匹配模式</Label>
                <Controller
                  control={form.control}
                  name="lineMatchMode"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL">全部可用线路</SelectItem>
                        <SelectItem value="TAGS">按线路标签匹配</SelectItem>
                        <SelectItem value="EXPLICIT">显式线路 ID</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              {form.watch('lineMatchMode') === 'TAGS' && (
                <div className="space-y-2">
                  <Label htmlFor="plan-line-tags" className="text-xs">线路标签</Label>
                  <Input id="plan-line-tags" placeholder="vip, hk" {...form.register('lineTags')} />
                  {lineTags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {lineTags.map((tag) => (
                        <Button
                          key={tag}
                          type="button"
                          size="sm"
                          variant={selectedTags.includes(tag) ? 'secondary' : 'outline'}
                          onClick={() => toggleTag(tag)}
                        >
                          #{tag}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {form.watch('lineMatchMode') === 'EXPLICIT' && (
                <div className="space-y-2">
                  <Label className="text-xs">指定线路</Label>
                  <div className="max-h-36 space-y-2 overflow-y-auto rounded-md border p-3">
                    {lineOptions.length ? (
                      lineOptions.map((line) => (
                        <div key={line.id} className="flex items-start gap-2">
                          <Checkbox
                            id={`plan-line-${line.id}`}
                            checked={selectedIds.includes(line.id)}
                            onCheckedChange={() => toggleLine(line.id)}
                          />
                          <Label htmlFor={`plan-line-${line.id}`} className="cursor-pointer text-sm font-normal">
                            <span className="font-medium">{line.name}</span>
                            <span className="ml-2 text-xs text-muted-foreground">
                              {line.serverHost}:{line.serverPort}
                            </span>
                          </Label>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-muted-foreground">暂无线路，请先在线路管理中创建。</p>
                    )}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label className="text-xs">订阅模板</Label>
                <Controller
                  control={form.control}
                  name="templateId"
                  render={({ field }) => (
                    <Select
                      value={field.value || 'none'}
                      onValueChange={(value) => field.onChange(value === 'none' ? '' : value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="选择模板" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">使用默认模板</SelectItem>
                        {templateOptions.map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              <div className="flex items-center gap-3 py-1">
                <Controller
                  control={form.control}
                  name="isPublic"
                  render={({ field }) => <Switch id="plan-public" checked={field.value} onCheckedChange={field.onChange} />}
                />
                <Label htmlFor="plan-public" className="text-xs cursor-pointer">
                  公开售卖（在套餐市场中向所有用户开放）
                </Label>
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                取消
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? '保存中…' : '保存套餐'}
              </Button>
            </DialogFooter>
          </form>

          {/* 右侧：所见即所得实机卡片预览 (Live Preview) */}
          <div className="space-y-4 lg:col-span-5 lg:sticky lg:top-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Eye className="h-4 w-4 text-primary" />
                <h4 className="text-sm font-semibold text-foreground">实机卡片预览</h4>
              </div>
              <Badge variant="outline" className="text-[11px] gap-1 font-normal text-muted-foreground">
                所见即所得
              </Badge>
            </div>

            <div className="rounded-2xl border bg-muted/20 p-4 sm:p-5 flex items-center justify-center min-h-[460px]">
              <div className="w-full max-w-sm">
                <MarketPlanCard plan={previewPlan} isPreview />
              </div>
            </div>

            {/* 微标记语法小贴士 */}
            <div className="rounded-xl border p-3 bg-muted/30 text-xs text-muted-foreground space-y-2">
              <div className="flex items-center gap-1.5 font-medium text-foreground">
                <HelpCircle className="h-3.5 w-3.5 text-primary" />
                特性清单图标语法指南
              </div>
              <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                <div><code className="bg-muted px-1 rounded text-primary">[zap]</code> 极速闪电</div>
                <div><code className="bg-muted px-1 rounded text-primary">[rocket]</code> 冲刺火箭</div>
                <div><code className="bg-muted px-1 rounded text-primary">[crown]</code> 尊享王冠</div>
                <div><code className="bg-muted px-1 rounded text-primary">[shield]</code> 安全盾牌</div>
                <div><code className="bg-muted px-1 rounded text-primary">[sparkles]</code> 特惠星芒</div>
                <div><code className="bg-muted px-1 rounded text-primary">[star]</code> 金色星标</div>
                <div className="col-span-2 text-[10px] text-muted-foreground pt-0.5">
                  行首加 <code className="bg-muted px-1 rounded text-foreground">!</code> 如 <code className="bg-muted px-1 rounded text-foreground">!承诺</code> 可将整行重点加粗
                </div>
              </div>
            </div>
          </div>
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
