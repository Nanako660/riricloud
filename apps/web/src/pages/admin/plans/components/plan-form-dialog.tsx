import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ResponsiveDialog, ResponsiveDialogContent } from '@/components/shared/responsive-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plan, PlanPayload, usePlanMutations } from '../use-plans';
import type { AdminLine } from '../../lines/use-lines';

const schema = z.object({
  name: z.string().min(1, '请输入套餐名称'),
  description: z.string().optional(),
  price: z.coerce.number().int().min(0),
  durationDays: z.coerce.number().int().min(1),
  trafficLimitGB: z.coerce.number().positive('流量必须大于 0'),
  lineMatchMode: z.enum(['ALL', 'TAGS', 'EXPLICIT']),
  lineTags: z.string().optional(),
  lineIds: z.string().optional(),
  templateId: z.string().optional(),
  isPublic: z.boolean(),
  sortOrder: z.coerce.number().int().min(0)
});
type FormValues = z.infer<typeof schema>;
const GB = 1024 ** 3;

export function PlanFormDialog({ open, onOpenChange, plan, lineOptions, templateOptions }: { open: boolean; onOpenChange: (open: boolean) => void; plan: Plan | null; lineOptions: AdminLine[]; templateOptions: Array<{ id: string; name: string }> }) {
  const { create, update } = usePlanMutations();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', description: '', price: 0, durationDays: 30, trafficLimitGB: 100, lineMatchMode: 'ALL', lineTags: '', lineIds: '', templateId: '', isPublic: true, sortOrder: 0 }
  });
  const lineTags = Array.from(new Set(lineOptions.flatMap((line) => line.tags))).sort();
  const selectedTags = (form.watch('lineTags') ?? '').split(',').map((tag) => tag.trim()).filter(Boolean);
  const selectedIds = (form.watch('lineIds') ?? '').split(',').map((id) => id.trim()).filter(Boolean);
  const toggleTag = (tag: string) => {
    const next = selectedTags.includes(tag) ? selectedTags.filter((item) => item !== tag) : [...selectedTags, tag];
    form.setValue('lineTags', next.join(', '), { shouldDirty: true });
  };
  const toggleLine = (id: string) => {
    const next = selectedIds.includes(id) ? selectedIds.filter((item) => item !== id) : [...selectedIds, id];
    form.setValue('lineIds', next.join(', '), { shouldDirty: true });
  };
  useEffect(() => {
    if (!open) return;
    form.reset(plan ? {
      name: plan.name,
      description: plan.description ?? '',
      price: plan.price,
      durationDays: plan.durationDays,
      trafficLimitGB: plan.trafficLimitBytes / GB,
      lineMatchMode: plan.lineMatchMode,
      lineTags: plan.lineTags.join(', '),
      lineIds: plan.lineIds.join(', '),
      templateId: plan.templateId ?? '',
      isPublic: plan.isPublic,
      sortOrder: plan.sortOrder
    } : undefined);
  }, [open, plan, form]);
  const submit = (values: FormValues) => {
    const payload: PlanPayload = {
      name: values.name,
      description: values.description,
      price: values.price,
      durationDays: values.durationDays,
      trafficLimitBytes: Math.round(values.trafficLimitGB * GB),
      lineMatchMode: values.lineMatchMode,
      lineTags: values.lineTags?.split(',').map((tag) => tag.trim()).filter(Boolean) ?? [],
      lineIds: values.lineIds?.split(',').map((id) => id.trim()).filter(Boolean) ?? [],
      templateId: values.templateId || null,
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
  return <ResponsiveDialog open={open} onOpenChange={onOpenChange}><ResponsiveDialogContent><DialogHeader><DialogTitle>{plan ? '编辑套餐' : '新建套餐'}</DialogTitle><DialogDescription>配置配额、有效期和线路匹配范围。</DialogDescription></DialogHeader><form onSubmit={form.handleSubmit(submit)} className="grid gap-4 sm:grid-cols-2">
    <div className="space-y-2 sm:col-span-2"><Label htmlFor="plan-name">套餐名称</Label><Input id="plan-name" {...form.register('name')} />{form.formState.errors.name && <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>}</div>
    <div className="space-y-2 sm:col-span-2"><Label htmlFor="plan-description">描述</Label><Input id="plan-description" {...form.register('description')} /></div>
    <div className="space-y-2"><Label htmlFor="plan-price">价格</Label><Input id="plan-price" type="number" min="0" {...form.register('price')} /></div>
    <div className="space-y-2"><Label htmlFor="plan-days">有效期（天）</Label><Input id="plan-days" type="number" min="1" {...form.register('durationDays')} /></div>
    <div className="space-y-2"><Label htmlFor="plan-traffic">流量（GiB）</Label><Input id="plan-traffic" type="number" min="1" step="0.1" {...form.register('trafficLimitGB')} /></div>
    <div className="space-y-2"><Label htmlFor="plan-sort">排序</Label><Input id="plan-sort" type="number" min="0" {...form.register('sortOrder')} /></div>
    <div className="space-y-2 sm:col-span-2"><Label>线路匹配模式</Label><Controller control={form.control} name="lineMatchMode" render={({ field }) => <Select value={field.value} onValueChange={field.onChange}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">全部可用线路</SelectItem><SelectItem value="TAGS">按线路标签匹配</SelectItem><SelectItem value="EXPLICIT">显式线路 ID</SelectItem></SelectContent></Select>} /></div>
    <div className="space-y-2"><Label htmlFor="plan-line-tags">线路标签</Label><Input id="plan-line-tags" placeholder="vip, hk" {...form.register('lineTags')} />{lineTags.length > 0 && <div className="flex flex-wrap gap-1.5">{lineTags.map((tag) => <Button key={tag} type="button" size="sm" variant={selectedTags.includes(tag) ? 'secondary' : 'outline'} onClick={() => toggleTag(tag)}>#{tag}</Button>)}</div>}</div>
    <div className="space-y-2"><Label>指定线路</Label><div className="max-h-40 space-y-2 overflow-y-auto rounded-md border p-3">{lineOptions.length ? lineOptions.map((line) => <div key={line.id} className="flex items-start gap-2"><Checkbox id={`plan-line-${line.id}`} checked={selectedIds.includes(line.id)} onCheckedChange={() => toggleLine(line.id)} /><Label htmlFor={`plan-line-${line.id}`} className="cursor-pointer text-sm font-normal"><span className="font-medium">{line.name}</span><span className="ml-2 text-xs text-muted-foreground">{line.serverHost}:{line.serverPort}</span></Label></div>) : <p className="text-xs text-muted-foreground">暂无线路，请先在线路管理中创建。</p>}</div></div>
    <div className="space-y-2 sm:col-span-2"><Label>订阅模板</Label><Controller control={form.control} name="templateId" render={({ field }) => <Select value={field.value || 'none'} onValueChange={(value) => field.onChange(value === 'none' ? '' : value)}><SelectTrigger><SelectValue placeholder="选择模板" /></SelectTrigger><SelectContent><SelectItem value="none">使用默认模板</SelectItem>{templateOptions.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select>} /></div>
    <div className="flex items-center gap-3 sm:col-span-2"><Controller control={form.control} name="isPublic" render={({ field }) => <Switch checked={field.value} onCheckedChange={field.onChange} />} /><Label>公开售卖</Label></div>
    <DialogFooter className="sm:col-span-2"><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>取消</Button><Button type="submit" disabled={busy}>{busy ? '保存中…' : '保存套餐'}</Button></DialogFooter>
  </form></ResponsiveDialogContent></ResponsiveDialog>;
}
