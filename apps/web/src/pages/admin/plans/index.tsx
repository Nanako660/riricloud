import { useState, useMemo } from 'react';
import { PackagePlus, Pencil, Search, Sparkles, Trash2 } from 'lucide-react';
import { PageContainer, PageHeader } from '@/components/shared/page-container';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Skeleton } from '@/components/ui/skeleton';
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
import { PlanFormDialog } from './components/plan-form-dialog';
import { useAdminPlans, usePlanMutations, type Plan } from './use-plans';
import { useAdminTemplates } from '../templates/use-templates';
import { useAdminLines } from '../lines/use-lines';
import { formatBytes, formatYuan } from '@/lib/utils';

const matchLabels: Record<string, string> = {
  ALL: '全部线路',
  TAGS: '按标签',
  EXPLICIT: '指定线路'
};

const resetLabels: Record<string, string> = {
  NONE: '不自动重置',
  CALENDAR_MONTH: '自然月重置',
  SUBSCRIPTION_CYCLE: '订阅周期重置'
};

export default function PlansPage() {
  const { data, isPending, isError } = useAdminPlans();
  const { data: templates } = useAdminTemplates();
  const { data: lineData } = useAdminLines();
  const { remove } = usePlanMutations();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PUBLIC' | 'UNLISTED'>('ALL');
  const [editing, setEditing] = useState<Plan | null>(null);
  const [deleting, setDeleting] = useState<Plan | null>(null);
  const [open, setOpen] = useState(false);

  const filteredPlans = useMemo(() => {
    if (!data) return [];
    const keyword = search.trim().toLowerCase();
    return data.filter((plan) => {
      if (statusFilter === 'PUBLIC' && !plan.isPublic) return false;
      if (statusFilter === 'UNLISTED' && plan.isPublic) return false;
      if (!keyword) return true;
      return (
        plan.name.toLowerCase().includes(keyword) ||
        (plan.description && plan.description.toLowerCase().includes(keyword)) ||
        (plan.badgeText && plan.badgeText.toLowerCase().includes(keyword)) ||
        plan.lineTags.some((tag) => tag.toLowerCase().includes(keyword))
      );
    });
  }, [data, search, statusFilter]);

  if (isPending) {
    return (
      <PageContainer>
        <PageHeader title="套餐管理" description="管理公开套餐、线路范围与订阅模板。" />
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
        <PageHeader title="套餐管理" description="管理公开套餐、线路范围与订阅模板。" />
        <EmptyState title="无法加载套餐" description="请稍后刷新重试" />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader title="套餐管理" description="管理公开套餐、线路范围与订阅模板。" />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="搜索套餐名称、标签或描述…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          <Select
            value={statusFilter}
            onValueChange={(val) => setStatusFilter(val as 'ALL' | 'PUBLIC' | 'UNLISTED')}
          >
            <SelectTrigger className="w-full sm:w-32">
              <SelectValue placeholder="状态筛选" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">全部状态</SelectItem>
              <SelectItem value="PUBLIC">仅公开</SelectItem>
              <SelectItem value="UNLISTED">已下架</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button
          className="w-full sm:w-auto"
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          <PackagePlus className="h-4 w-4 mr-1.5" />
          新建套餐
        </Button>
      </div>

      <Card>
        <CardContent className="min-w-0 p-0">
          {filteredPlans.length ? (
            <Table className="min-w-[960px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[28%]">套餐信息</TableHead>
                  <TableHead>资费与周期</TableHead>
                  <TableHead>流量与重置</TableHead>
                  <TableHead>线路范围</TableHead>
                  <TableHead>绑定模板</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPlans.map((plan) => (
                  <TableRow key={plan.id}>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-medium text-foreground">{plan.name}</span>
                          {plan.isFeatured && (
                            <Badge
                              variant="default"
                              className="text-[11px] h-5 bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 gap-0.5 hover:bg-amber-500/20"
                            >
                              <Sparkles className="h-3 w-3" />
                              主推
                            </Badge>
                          )}
                          {plan.badgeText && (
                            <Badge variant="secondary" className="text-[11px] h-5 font-semibold">
                              {plan.badgeText}
                            </Badge>
                          )}
                          <span className="text-xs text-muted-foreground tabular-nums">#{plan.sortOrder}</span>
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-1">
                          {plan.description || '暂无描述'}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-0.5">
                        <span className="font-semibold text-foreground">
                          {plan.price === 0 ? '免费' : formatYuan(plan.price)}
                        </span>
                        <span className="text-xs text-muted-foreground"> / {plan.durationDays} 天</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-0.5 text-xs">
                        <div className="font-medium tabular-nums text-foreground">
                          {formatBytes(plan.trafficLimitBytes)}
                        </div>
                        <div className="text-muted-foreground">{resetLabels[plan.trafficResetMode]}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1 text-xs">
                        <div className="flex items-center gap-1 flex-wrap">
                          <Badge variant="outline" className="text-[11px]">
                            {matchLabels[plan.lineMatchMode]}
                          </Badge>
                          {plan.lineMatchMode === 'TAGS' && plan.lineTags.length > 0 && (
                            <span className="text-muted-foreground">
                              #{plan.lineTags.slice(0, 2).join(' #')}
                              {plan.lineTags.length > 2 && ` +${plan.lineTags.length - 2}`}
                            </span>
                          )}
                          {plan.lineMatchMode === 'EXPLICIT' && (
                            <span className="text-muted-foreground">
                              {plan.lineIds.length} 条线路
                            </span>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {plan.template ? (
                        <Badge variant="outline" className="text-xs">
                          {plan.template.name}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">默认模板</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {plan.isPublic ? (
                        <Badge
                          variant="outline"
                          className="text-xs border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        >
                          公开售卖
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">
                          已下架
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end items-center gap-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="编辑套餐"
                              onClick={() => {
                                setEditing(plan);
                                setOpen(true);
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>编辑套餐</TooltipContent>
                        </Tooltip>

                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="删除套餐"
                              onClick={() => setDeleting(plan)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>删除套餐</TooltipContent>
                        </Tooltip>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState
              title={search || statusFilter !== 'ALL' ? '未找到匹配套餐' : '还没有套餐'}
              description={
                search || statusFilter !== 'ALL'
                  ? '请尝试更换搜索词或筛选条件。'
                  : '创建一个套餐后，用户就能在套餐市场中订购。'
              }
              className="border-0"
            />
          )}
        </CardContent>
      </Card>

      <PlanFormDialog
        open={open}
        onOpenChange={setOpen}
        plan={editing}
        lineOptions={lineData?.data ?? []}
        templateOptions={(templates ?? []).map((template) => ({
          id: template.id,
          name: template.name
        }))}
      />

      <AlertDialog open={!!deleting} onOpenChange={(isOpen) => !isOpen && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除套餐「{deleting?.name}」？</AlertDialogTitle>
            <AlertDialogDescription>已有订阅使用的套餐无法删除，建议改为下架。</AlertDialogDescription>
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
