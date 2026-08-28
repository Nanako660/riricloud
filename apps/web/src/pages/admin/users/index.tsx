import * as React from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Pencil, Plus, Search, ShieldOff, ShieldCheck, Trash2 } from 'lucide-react';
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
import { useAdminUsers, useUserMutations, type AdminUser } from './use-users';
import { UserFormDialog } from './components/user-form-dialog';

function formatGB(bytes: number): string {
  return `${(bytes / 1024 ** 3).toFixed(0)} GB`;
}

// 状态色规范：激活=success、封禁=destructive（FRONTEND_UI_GUIDELINES §状态色）
function StatusBadge({ isActive }: { isActive: boolean }) {
  return isActive ? (
    <Badge className="border-transparent bg-emerald-600 text-white hover:bg-emerald-600">已激活</Badge>
  ) : (
    <Badge variant="destructive">已封禁</Badge>
  );
}

export default function AdminUsersPage() {
  const selfId = useAuthStore((s) => s.user?.id);
  const [search, setSearch] = React.useState('');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');
  const [editing, setEditing] = React.useState<AdminUser | null>(null);
  const [formOpen, setFormOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState<AdminUser | null>(null);
  const [bulkDeleting, setBulkDeleting] = React.useState(false);
  const [selected, setSelected] = React.useState<AdminUser[]>([]);

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 400);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isPending } = useAdminUsers({ search: debouncedSearch });
  const { deleteUser, bulkActive } = useUserMutations();
  const users = data?.data ?? [];

  const columns = React.useMemo<ColumnDef<AdminUser>[]>(
    () => [
      {
        accessorKey: 'email',
        header: '邮箱',
        cell: ({ row }) => <span className="font-medium">{row.original.email}</span>
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
                {formatGB(used)} / {formatGB(limit)}（{percent}%）
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
    [selfId, bulkActive]
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
          emptyTitle="暂无用户"
          emptyDescription="点击右上角「创建用户」添加"
          toolbar={
            <>
              <div className="relative w-64">
                <Search className="text-muted-foreground absolute top-2.5 left-2 h-4 w-4" />
                <Input className="pl-8" placeholder="搜索邮箱…" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <Button size="sm" className="gap-1.5" onClick={() => { setEditing(null); setFormOpen(true); }}>
                <Plus className="h-4 w-4" />
                创建用户
              </Button>
              {selected.length > 0 ? (
                <div className="flex items-center gap-1.5">
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

      <UserFormDialog open={formOpen} onOpenChange={setFormOpen} user={editing} selfId={selfId ?? ''} />

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
