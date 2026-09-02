import { useState } from 'react';
import { PackagePlus, Pencil, Trash2 } from 'lucide-react';
import { PageContainer, PageHeader } from '@/components/shared/page-container';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { PlanFormDialog } from './components/plan-form-dialog';
import { useAdminPlans, usePlanMutations, type Plan } from './use-plans';
import { useAdminTemplates } from '../templates/use-templates';
import { useAdminLines } from '../lines/use-lines';

import { formatBytes } from '@/lib/utils';

const matchLabels = { ALL: '全部线路', TAGS: '按标签', EXPLICIT: '指定线路' };

export default function PlansPage() {
  const { data, isPending, isError } = useAdminPlans();
  const { data: templates } = useAdminTemplates();
  const { data: lineData } = useAdminLines();
  const { remove } = usePlanMutations();
  const [editing, setEditing] = useState<Plan | null>(null);
  const [open, setOpen] = useState(false);
  if (isPending) return <PageContainer><PageHeader title="套餐管理" /><p className="text-sm text-muted-foreground">加载中…</p></PageContainer>;
  if (isError) return <PageContainer><PageHeader title="套餐管理" /><EmptyState title="无法加载套餐" description="请稍后刷新重试" /></PageContainer>;
  return <PageContainer><PageHeader title="套餐管理" description="管理公开套餐、线路范围与订阅模板。" /><div className="flex flex-wrap justify-end"><Button className="w-full sm:w-auto" onClick={() => { setEditing(null); setOpen(true); }}><PackagePlus />新建套餐</Button></div><div className="grid gap-4 lg:grid-cols-2">{data?.map((plan) => <Card key={plan.id}><CardHeader className="flex-col items-start justify-between gap-2 space-y-0 sm:flex-row"><div className="min-w-0"><CardTitle className="break-words text-base">{plan.name}</CardTitle><p className="mt-1 break-words text-sm text-muted-foreground">{plan.description || '暂无描述'}</p></div><Badge variant={plan.isPublic ? 'default' : 'secondary'}>{plan.isPublic ? '公开' : '下架'}</Badge></CardHeader><CardContent className="space-y-4"><div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3"><div><p className="text-muted-foreground">流量</p><p className="font-semibold">{formatBytes(plan.trafficLimitBytes)}</p></div><div><p className="text-muted-foreground">有效期</p><p className="font-semibold">{plan.durationDays} 天</p></div><div><p className="text-muted-foreground">价格</p><p className="font-semibold">{plan.price === 0 ? '免费' : `${plan.price}`}</p></div></div><div className="flex flex-wrap gap-2 text-xs text-muted-foreground"><Badge variant="outline">{matchLabels[plan.lineMatchMode]}</Badge>{plan.lineTags.map((tag) => <Badge key={tag} variant="secondary">#{tag}</Badge>)}{plan.template && <Badge variant="outline">模板：{plan.template.name}</Badge>}</div><div className="flex flex-wrap justify-end gap-2"><Button variant="outline" size="sm" onClick={() => { setEditing(plan); setOpen(true); }}><Pencil />编辑</Button><AlertDialog><AlertDialogTrigger asChild><Button variant="ghost" size="sm"><Trash2 /></Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>删除套餐「{plan.name}」？</AlertDialogTitle><AlertDialogDescription>已有订阅使用的套餐无法删除，建议改为下架。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => remove.mutate(plan.id)}>确认删除</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></div></CardContent></Card>)}</div>{!data?.length && <EmptyState title="还没有套餐" description="创建一个套餐后，用户就能在套餐市场中订购。" />}<PlanFormDialog open={open} onOpenChange={setOpen} plan={editing} lineOptions={lineData?.data ?? []} templateOptions={(templates ?? []).map((template) => ({ id: template.id, name: template.name }))} /></PageContainer>;
}
