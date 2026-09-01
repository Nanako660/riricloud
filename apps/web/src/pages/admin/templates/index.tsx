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
  return <PageContainer><PageHeader title="订阅模板" description="可视化维护策略组、规则集、DNS 和高级覆写。" /><div className="flex flex-wrap justify-end"><Button className="w-full sm:w-auto" onClick={() => { setEditing(null); setOpen(true); }}><FileCog />新建模板</Button></div><div className="grid gap-4 lg:grid-cols-2">{data?.map((template) => <Card key={template.id}><CardHeader className="flex-col items-start justify-between gap-2 space-y-0 sm:flex-row"><div className="min-w-0"><CardTitle className="break-words text-base">{template.name}</CardTitle><p className="mt-1 break-words text-sm text-muted-foreground">{template.description || '暂无描述'}</p></div><div className="flex flex-wrap items-center gap-2">{template.isBuiltin && <Badge variant="secondary">内嵌</Badge>}{template.isDefault && <Badge>默认</Badge>}</div></CardHeader><CardContent className="space-y-3"><div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3"><div><p className="text-muted-foreground">策略组</p><p className="font-semibold">{template.proxyGroups.length}</p></div><div><p className="text-muted-foreground">规则集</p><p className="font-semibold">{template.ruleSets.length}</p></div><div><p className="text-muted-foreground">DNS</p><p className="font-semibold">{Object.keys(template.dnsConfig).length ? '已配置' : '默认'}</p></div></div><div className="flex flex-wrap justify-end gap-2"><Button variant="outline" size="sm" onClick={() => { setEditing(template); setOpen(true); }}><Pencil />编辑</Button>{!template.isBuiltin && !template.isDefault ? <AlertDialog><AlertDialogTrigger asChild><Button variant="ghost" size="sm"><Trash2 /></Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>删除模板「{template.name}」？</AlertDialogTitle><AlertDialogDescription>默认模板或被套餐使用的模板不能删除。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => remove.mutate(template.id)}>确认删除</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog> : null}</div></CardContent></Card>)}</div>{!data?.length && <EmptyState title="还没有订阅模板" description="创建模板后可绑定到套餐。" />}<TemplateFormDialog open={open} onOpenChange={setOpen} template={editing} /></PageContainer>;
}
