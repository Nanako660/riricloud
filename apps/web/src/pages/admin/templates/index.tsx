import { useState } from 'react';
import { FileCog, Pencil, Trash2 } from 'lucide-react';
import { PageContainer, PageHeader } from '@/components/shared/page-container';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { TemplateFormDialog } from './components/template-form-dialog';
import { useAdminTemplates, useTemplateMutations, type SubscriptionTemplate } from './use-templates';

export default function TemplatesPage() {
  const { data, isPending, isError } = useAdminTemplates();
  const { remove } = useTemplateMutations();
  const [editing, setEditing] = useState<SubscriptionTemplate | null>(null);
  const [open, setOpen] = useState(false);
  if (isPending) return <PageContainer><PageHeader title="订阅模板" /><p className="text-sm text-muted-foreground">加载中…</p></PageContainer>;
  if (isError) return <PageContainer><PageHeader title="订阅模板" /><EmptyState title="无法加载模板" description="请稍后刷新重试" /></PageContainer>;
  return <PageContainer><PageHeader title="订阅模板" description="可视化维护策略组、规则集、DNS 和高级覆写。" /><div className="flex justify-end"><Button onClick={() => { setEditing(null); setOpen(true); }}><FileCog />新建模板</Button></div><div className="grid gap-4 lg:grid-cols-2">{data?.map((template) => <Card key={template.id}><CardHeader className="flex-row items-start justify-between space-y-0"><div><CardTitle className="text-base">{template.name}</CardTitle><p className="mt-1 text-sm text-muted-foreground">{template.description || '暂无描述'}</p></div>{template.isDefault && <Badge>默认</Badge>}</CardHeader><CardContent className="space-y-3"><div className="grid grid-cols-3 gap-3 text-sm"><div><p className="text-muted-foreground">策略组</p><p className="font-semibold">{template.proxyGroups.length}</p></div><div><p className="text-muted-foreground">规则集</p><p className="font-semibold">{template.ruleSets.length}</p></div><div><p className="text-muted-foreground">DNS</p><p className="font-semibold">{Object.keys(template.dnsConfig).length ? '已配置' : '默认'}</p></div></div><div className="flex justify-end gap-2"><Button variant="outline" size="sm" onClick={() => { setEditing(template); setOpen(true); }}><Pencil />编辑</Button><AlertDialog><AlertDialogTrigger asChild><Button variant="ghost" size="sm"><Trash2 /></Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>删除模板「{template.name}」？</AlertDialogTitle><AlertDialogDescription>默认模板或被套餐使用的模板不能删除。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => remove.mutate(template.id)}>确认删除</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></div></CardContent></Card>)}</div>{!data?.length && <EmptyState title="还没有订阅模板" description="创建模板后可绑定到套餐。" />}<TemplateFormDialog open={open} onOpenChange={setOpen} template={editing} /></PageContainer>;
}
