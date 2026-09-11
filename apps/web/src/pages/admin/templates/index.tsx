import { useState, useMemo } from 'react';
import { Copy, Eye, FileCog, MoreHorizontal, Pencil, Search, Trash2 } from 'lucide-react';
import { PageContainer, PageHeader } from '@/components/shared/page-container';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { TemplateFormDialog } from './components/template-form-dialog';
import { useAdminTemplates, useTemplateMutations, type SubscriptionTemplate } from './use-templates';
import { TemplatePreviewDrawer } from './components/template-preview-drawer';

export default function TemplatesPage() {
  const { data, isPending, isError } = useAdminTemplates();
  const { remove, duplicate } = useTemplateMutations();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<SubscriptionTemplate | null>(null);
  const [previewing, setPreviewing] = useState<SubscriptionTemplate | null>(null);
  const [deleting, setDeleting] = useState<SubscriptionTemplate | null>(null);
  const [open, setOpen] = useState(false);

  const filteredTemplates = useMemo(() => {
    if (!data) return [];
    const keyword = search.trim().toLowerCase();
    if (!keyword) return data;
    return data.filter(
      (t) =>
        t.name.toLowerCase().includes(keyword) ||
        (t.description && t.description.toLowerCase().includes(keyword))
    );
  }, [data, search]);

  if (isPending) {
    return (
      <PageContainer>
        <PageHeader title="订阅模板" description="可视化维护策略组、规则集、DNS 和高级覆写。" />
        <Skeleton className="h-10 w-full max-w-sm" />
        <Card>
          <CardContent className="p-4 space-y-3">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </CardContent>
        </Card>
      </PageContainer>
    );
  }

  if (isError) {
    return (
      <PageContainer>
        <PageHeader title="订阅模板" description="可视化维护策略组、规则集、DNS 和高级覆写。" />
        <EmptyState title="无法加载模板" description="请稍后刷新重试" />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader title="订阅模板" description="可视化维护策略组、规则集、DNS 和高级覆写。" />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="搜索模板名称或描述…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <Button className="w-full sm:w-auto" onClick={() => { setEditing(null); setOpen(true); }}>
          <FileCog className="h-4 w-4 mr-1.5" />新建模板
        </Button>
      </div>

      <Card>
        <CardContent className="min-w-0 p-0">
          {filteredTemplates.length ? (
            <Table className="min-w-[760px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[30%]">模板信息</TableHead>
                  <TableHead>策略与规则</TableHead>
                  <TableHead>DNS 配置</TableHead>
                  <TableHead>高级覆写</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTemplates.map((template) => (
                  <TableRow key={template.id}>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-foreground">{template.name}</span>
                          {template.isBuiltin && <Badge variant="secondary" className="text-xs">内嵌</Badge>}
                          {template.isDefault && <Badge className="text-xs">默认</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-1">
                          {template.description || '暂无描述'}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-0.5 text-xs">
                        <div>
                          <span className="text-muted-foreground">策略组：</span>
                          <span className="font-medium tabular-nums">{template.proxyGroups.length}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">规则集：</span>
                          <span className="font-medium tabular-nums">{template.ruleSets.length}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {Object.keys(template.dnsConfig).length ? (
                        <Badge variant="outline" className="text-xs">已配置</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">系统默认</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {template.customInjectYaml || template.customInjectJson ? (
                        <div className="flex flex-wrap gap-1">
                          {template.customInjectYaml && (
                            <Badge variant="secondary" className="text-[10px]">YAML</Badge>
                          )}
                          {template.customInjectJson && (
                            <Badge variant="secondary" className="text-[10px]">JSON</Badge>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end items-center gap-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="预览模板"
                              onClick={() => setPreviewing(template)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>预览模板</TooltipContent>
                        </Tooltip>

                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="编辑模板"
                              onClick={() => {
                                setEditing(template);
                                setOpen(true);
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>编辑模板</TooltipContent>
                        </Tooltip>

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label="更多操作">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              disabled={duplicate.isPending}
                              onClick={() => duplicate.mutate(template.id)}
                            >
                              <Copy className="mr-2 h-4 w-4" />
                              复制副本
                            </DropdownMenuItem>
                            {!template.isBuiltin && !template.isDefault && (
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => setDeleting(template)}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                删除模板
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState
              title={search ? '未找到匹配模板' : '还没有订阅模板'}
              description={search ? '请尝试更换搜索关键词。' : '创建模板后可绑定到套餐。'}
              className="border-0"
            />
          )}
        </CardContent>
      </Card>

      <TemplateFormDialog open={open} onOpenChange={setOpen} template={editing} />

      <TemplatePreviewDrawer
        open={!!previewing}
        onOpenChange={(next) => {
          if (!next) setPreviewing(null);
        }}
        template={
          previewing
            ? {
                name: previewing.name,
                description: previewing.description,
                proxyGroups: previewing.proxyGroups,
                ruleSets: previewing.ruleSets,
                dnsConfig: previewing.dnsConfig,
                customInjectYaml: previewing.customInjectYaml,
                customInjectJson: previewing.customInjectJson,
                isDefault: previewing.isDefault
              }
            : null
        }
      />

      <AlertDialog open={!!deleting} onOpenChange={(isOpen) => !isOpen && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除模板「{deleting?.name}」？</AlertDialogTitle>
            <AlertDialogDescription>默认模板或被套餐使用的模板不能删除。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (deleting) {
                  remove.mutate(deleting.id, {
                    onSuccess: () => setDeleting(null)
                  });
                }
              }}
            >
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}
