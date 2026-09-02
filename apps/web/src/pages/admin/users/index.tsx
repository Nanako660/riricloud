import * as React from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Pencil, Plus, RefreshCw, Search, ShieldOff, ShieldCheck, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { toast } from 'sonner';
import { PageContainer, PageHeader } from '@/components/shared/page-container';
import { DataTable } from '@/components/shared/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAdminPlans } from '../plans/use-plans';
import { useAdminUsers, useUserMutations, type AdminUser, type AdminUserSubscription } from './use-users';
import { UserFormDialog } from './components/user-form-dialog';

import { formatBytes } from '@/lib/utils';

// 状态色规范：激活=success、封禁=destructive（FRONTEND_UI_GUIDELINES §状态色）
function StatusBadge({ isActive }: { isActive: boolean }) {
  return isActive ? (
    <Badge className="border-transparent bg-emerald-600 text-white hover:bg-emerald-600">已激活</Badge>
  ) : (
    <Badge variant="destructive">已封禁</Badge>
  );
}

const subscriptionStatusLabels: Record<AdminUserSubscription['status'], string> = {
  ACTIVE: 'ACTIVE',
  CANCELED: 'CANCELED',
  EXPIRED: 'EXPIRED',
  REVOKED: 'REVOKED'
};

function SubscriptionStatusBadge({ status }: { status: AdminUserSubscription['status'] | null }) {
  if (!status) return <Badge variant="outline">未绑定</Badge>;
  const variant = status === 'ACTIVE' ? 'default' : status === 'REVOKED' ? 'destructive' : 'secondary';
  return <Badge variant={variant}>{subscriptionStatusLabels[status]}</Badge>;
}

export default function AdminUsersPage() {
  const selfId = useAuthStore((s) => s.user?.id);
  const [search, setSearch] = React.useState('');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');
  const [editing, setEditing] = React.useState<AdminUser | null>(null);
  const [formOpen, setFormOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState<AdminUser | null>(null);
  const [resetting, setResetting] = React.useState<AdminUser | null>(null);
  const [bulkDeleting, setBulkDeleting] = React.useState(false);
  const [selected, setSelected] = React.useState<AdminUser[]>([]);
  const [roleFilter, setRoleFilter] = React.useState<'ALL' | 'USER' | 'ADMIN'>('ALL');
  const [activeFilter, setActiveFilter] = React.useState<'ALL' | 'true' | 'false'>('ALL');
  const [subscriptionFilter, setSubscriptionFilter] = React.useState<'ALL' | AdminUserSubscription['status']>('ALL');
  const [planFilter, setPlanFilter] = React.useState('ALL');

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 400);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isPending } = useAdminUsers({
    search: debouncedSearch,
    role: roleFilter === 'ALL' ? undefined : roleFilter,
    isActive: activeFilter === 'ALL' ? undefined : activeFilter === 'true',
    subscriptionStatus: subscriptionFilter === 'ALL' ? undefined : subscriptionFilter,
    planId: planFilter === 'ALL' ? undefined : planFilter
  });
  const { data: plans } = useAdminPlans();
  const { deleteUser, bulkActive, resetSubscriptionToken } = useUserMutations();
  const users = data?.data ?? [];

  const columns = React.useMemo<ColumnDef<AdminUser>[]>(
    () => [
      {
        accessorKey: 'email',
        header: '邮箱',
        cell: ({ row }) => <span className="font-medium">{row.original.email}</span>
      },
      {
        id: 'plan',
        header: '当前套餐',
        cell: ({ row }) => row.original.subscription?.plan ? (
          <Badge variant="outline">{row.original.subscription.plan.name}</Badge>
        ) : <span className="text-muted-foreground">未绑定</span>
      },
      {
        id: 'subscriptionStatus',
        header: '订阅状态',
        cell: ({ row }) => <SubscriptionStatusBadge status={row.original.subscription?.status ?? null} />
      },
      {
        accessorKey: 'role',
        header: '角色',
        cell: ({ row }) => (
          <Badge variant={row.original.role === 'ADMIN' ? 'default' : 'secondary'}>
            {row.original.role === 'ADMIN' ? '管理员' : '用户'}
          </Badge>
        )
      },
      {
        id: 'quota',
        header: '配额使用',
        cell: ({ row }) => {
          const { trafficLimitBytes: limit, trafficUsedBytes: used } = row.original;
          const percent = limit > 0 ? Math.min(Math.round((used / limit) * 100), 100) : 0;
          return (
            <div className="w-40 space-y-1">
              <Progress value={percent} />
              <p className="text-muted-foreground text-xs tabular-nums">
                {formatBytes(used)} / {formatBytes(limit)}（{percent}%）
              </p>
            </div>
          );
        }
      },
      {
        accessorKey: 'expireAt',
        header: '有效期',
        cell: ({ row }) =>
          row.original.expireAt ? (
            <span className="tabular-nums">{new Date(row.original.expireAt).toLocaleDateString('zh-CN')}</span>
          ) : (
            <span className="text-muted-foreground">永久</span>
          )
      },
      {
        accessorKey: 'isActive',
        header: '状态',
        cell: ({ row }) => <StatusBadge isActive={row.original.isActive} />
      },
      {
        accessorKey: 'createdAt',
        header: '创建时间',
        cell: ({ row }) => (
          <span className="text-muted-foreground tabular-nums">
            {new Date(row.original.createdAt).toLocaleDateString('zh-CN')}
          </span>
        )
      },
      {
        id: 'actions',
        header: '操作',
        enableHiding: false,
        cell: ({ row }) => {
          const u = row.original;
          const isSelf = u.id === selfId;
          return (
            <div className="flex justify-end gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="编辑" onClick={() => { setEditing(u); setFormOpen(true); }}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>编辑</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="重置订阅链接" disabled={resetSubscriptionToken.isPending} onClick={() => setResetting(u)}>
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>重置订阅链接</TooltipContent>
              </Tooltip>
              {!isSelf ? (
                <>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={u.isActive ? '封禁' : '解封'}
                        disabled={bulkActive.isPending}
                        onClick={() =>
                          bulkActive.mutate({ ids: [u.id], isActive: !u.isActive })
                        }
                      >
                        {u.isActive ? <ShieldOff className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{u.isActive ? '封禁' : '解封'}</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label="删除" onClick={() => setDeleting(u)}>
                        <Trash2 className="text-destructive h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>删除</TooltipContent>
                  </Tooltip>
                </>
              ) : null}
            </div>
          );
        }
      }
    ],
    [bulkActive, resetSubscriptionToken, selfId]
  );

  const onBulkBan = async (isActive: boolean) => {
    // 自身不可被操作
    const ids = selected.filter((u) => u.id !== selfId).map((u) => u.id);
    if (ids.length === 0) {
      toast.warning('没有可操作的用户（不能操作自己）');
      return;
    }
    bulkActive.mutate({ ids, isActive });
  };

  const onConfirmDelete = () => {
    if (!deleting) return;
    deleteUser.mutate(deleting.id, {
      onSuccess: () => setDeleting(null),
      onError: () => setDeleting(null)
    });
  };

  return (
    <PageContainer>
      <PageHeader title="用户管理" description="配额、有效期、角色与封禁管理" />

      {isPending ? (
        <div className="space-y-2">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={users}
          total={data?.total}
          onSelectionChange={setSelected}
          tableClassName="min-w-[1040px]"
          emptyTitle="暂无用户"
          emptyDescription="点击右上角「创建用户」添加"
          toolbar={
            <>
              <div className="relative w-full sm:w-64">
                <Search className="text-muted-foreground absolute top-2.5 left-2 h-4 w-4" />
                <Input className="pl-8" placeholder="搜索邮箱…" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <Select value={roleFilter} onValueChange={(value) => setRoleFilter(value as typeof roleFilter)}>
                <SelectTrigger className="w-full sm:w-[120px]"><SelectValue placeholder="角色" /></SelectTrigger>
                <SelectContent><SelectItem value="ALL">全部角色</SelectItem><SelectItem value="USER">用户</SelectItem><SelectItem value="ADMIN">管理员</SelectItem></SelectContent>
              </Select>
              <Select value={activeFilter} onValueChange={(value) => setActiveFilter(value as typeof activeFilter)}>
                <SelectTrigger className="w-full sm:w-[120px]"><SelectValue placeholder="账号状态" /></SelectTrigger>
                <SelectContent><SelectItem value="ALL">全部账号</SelectItem><SelectItem value="true">已激活</SelectItem><SelectItem value="false">已封禁</SelectItem></SelectContent>
              </Select>
              <Select value={subscriptionFilter} onValueChange={(value) => setSubscriptionFilter(value as typeof subscriptionFilter)}>
                <SelectTrigger className="w-full sm:w-[130px]"><SelectValue placeholder="订阅状态" /></SelectTrigger>
                <SelectContent><SelectItem value="ALL">全部订阅</SelectItem>{Object.keys(subscriptionStatusLabels).map((status) => <SelectItem key={status} value={status}>{status}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={planFilter} onValueChange={setPlanFilter}>
                <SelectTrigger className="w-full sm:w-[150px]"><SelectValue placeholder="套餐" /></SelectTrigger>
                <SelectContent><SelectItem value="ALL">全部套餐</SelectItem>{(plans ?? []).map((plan) => <SelectItem key={plan.id} value={plan.id}>{plan.name}</SelectItem>)}</SelectContent>
              </Select>
              <Button size="sm" className="w-full gap-1.5 sm:w-auto" onClick={() => { setEditing(null); setFormOpen(true); }}>
                <Plus className="h-4 w-4" />
                创建用户
              </Button>
              {selected.length > 0 ? (
                <div className="flex w-full flex-wrap items-center gap-1.5 sm:w-auto">
                  <Button size="sm" variant="outline" className="gap-1.5" disabled={bulkActive.isPending} onClick={() => void onBulkBan(false)}>
                    <ShieldOff className="h-4 w-4" />
                    批量封禁（{selected.length}）
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1.5" disabled={bulkActive.isPending} onClick={() => void onBulkBan(true)}>
                    <ShieldCheck className="h-4 w-4" />
                    批量解封
                  </Button>
                  <Button size="sm" variant="destructive" className="gap-1.5" onClick={() => setBulkDeleting(true)}>
                    <Trash2 className="h-4 w-4" />
                    批量删除
                  </Button>
                </div>
              ) : null}
            </>
          }
        />
      )}

      <UserFormDialog open={formOpen} onOpenChange={setFormOpen} user={editing} selfId={selfId ?? ''} plans={plans ?? []} />

      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除用户 {deleting?.email}？</AlertDialogTitle>
            <AlertDialogDescription>
              该用户的流量记录将一并删除，此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void onConfirmDelete()}>
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!resetting} onOpenChange={(open) => !open && setResetting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>重置用户订阅链接？</AlertDialogTitle>
            <AlertDialogDescription>{resetting?.email} 的旧链接会立即失效，需要重新导入订阅。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (resetting) resetSubscriptionToken.mutate(resetting.id, { onSuccess: () => setResetting(null) }); }}>
              确认重置
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkDeleting} onOpenChange={setBulkDeleting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>批量删除 {selected.length} 个用户？</AlertDialogTitle>
            <AlertDialogDescription>
              将删除：{selected.map((u) => u.email).join('、')}。相关流量记录一并删除，不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async () => {
                const ids = selected.filter((u) => u.id !== selfId).map((u) => u.id);
                const results = await Promise.allSettled(ids.map((id) => api.delete(`/admin/users/${id}`)));
                const failed = results.filter((r) => r.status === 'rejected').length;
                if (failed === 0) toast.success(`已删除 ${ids.length} 个用户`);
                else toast.warning(`删除完成：${ids.length - failed} 成功，${failed} 失败`);
                setBulkDeleting(false);
              }}
            >
              全部删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}
