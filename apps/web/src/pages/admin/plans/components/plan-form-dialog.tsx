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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plan, PlanPayload, usePlanMutations } from '../use-plans';
import type { AdminLine } from '../../lines/use-lines';

const PRESET_FEATURES = [
  '全专线高速隧道接入',
  '4K / 8K 流媒体全解锁',
  'ChatGPT / Claude 满血直连',
  '全球主流节点全覆盖',
  '不限同时在线设备数',
  '7x24 小时 SLA 服务保障'
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
  sortOrder: z.coerce.number().int().min(0)
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
      sortOrder: 0
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
              sortOrder: plan.sortOrder
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
      sortOrder: values.sortOrder
    };

    if (plan) {
      update.mutate({ id: plan.id, ...payload }, { onSuccess: () => onOpenChange(false) });
    } else {
      create.mutate(payload, { onSuccess: () => onOpenChange(false) });
    }
  };

  const busy = create.isPending || update.isPending;

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent size="wide" className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{plan ? '编辑套餐' : '新建套餐'}</DialogTitle>
          <DialogDescription>配置配额、有效期、线路匹配范围及市场展示权益。</DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(submit)} className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="plan-name">套餐名称</Label>
            <Input id="plan-name" placeholder="例如：基础月付套餐" {...form.register('name')} />
            {form.formState.errors.name && (
              <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="plan-description">描述信息</Label>
            <Input
              id="plan-description"
              placeholder="针对轻量浏览与日常办公设计的入门方案"
              {...form.register('description')}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="plan-price">价格（元）</Label>
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
            <p className="text-[11px] text-muted-foreground">数值越小排序越靠前</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="plan-badge">角标文本（可选）</Label>
            <Input id="plan-badge" placeholder="例如：HOT、推荐、8折特惠" {...form.register('badgeText')} />
            <p className="text-[11px] text-muted-foreground">将在套餐市场卡片右上角作为醒目标记展示</p>
          </div>

          <div className="rounded-lg border p-3 bg-muted/20 sm:col-span-2 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="plan-featured" className="font-medium">
                  设为主推推荐套餐
                </Label>
                <p className="text-xs text-muted-foreground">
                  主推套餐在套餐市场中拥有高亮外框与景深阴影，引导用户优先选购
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

          <div className="space-y-2 sm:col-span-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="plan-features">自定义权益特性清单</Label>
              <span className="text-[11px] text-muted-foreground">每行一项；留空将自动降级展示 4 项标准特性</span>
            </div>
            <Textarea
              id="plan-features"
              rows={4}
              placeholder="全专线高速隧道接入&#10;4K / 8K 流媒体全解锁&#10;ChatGPT / Claude 满血直连&#10;不限同时在线设备数"
              {...form.register('featuresText')}
            />
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-xs text-muted-foreground">快捷填入：</span>
              {PRESET_FEATURES.map((item) => (
                <Button
                  key={item}
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-6 text-xs px-2"
                  onClick={() => addPresetFeature(item)}
                >
                  + {item}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label>线路匹配模式</Label>
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
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="plan-line-tags">线路标签</Label>
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
            <div className="space-y-2 sm:col-span-2">
              <Label>指定线路</Label>
              <div className="max-h-40 space-y-2 overflow-y-auto rounded-md border p-3">
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

          <div className="space-y-2 sm:col-span-2">
            <Label>订阅模板</Label>
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

          <div className="flex items-center gap-3 sm:col-span-2 py-2">
            <Controller
              control={form.control}
              name="isPublic"
              render={({ field }) => <Switch id="plan-public" checked={field.value} onCheckedChange={field.onChange} />}
            />
            <Label htmlFor="plan-public">公开售卖（在套餐市场中向所有用户开放）</Label>
          </div>

          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? '保存中…' : '保存套餐'}
            </Button>
          </DialogFooter>
        </form>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
