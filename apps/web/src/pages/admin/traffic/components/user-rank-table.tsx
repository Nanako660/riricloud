import * as React from 'react';
import { Activity, Medal, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Pagination, PaginationInfo, PaginationNext, PaginationPrevious } from '@/components/ui/pagination';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatBytes } from '@/lib/utils';
import type { UserTrafficRankItem } from '../use-traffic';

type RoleFilter = 'ALL' | 'ADMIN' | 'USER';

const PAGE_SIZE = 10;

function roleLabel(role: string) {
  return role === 'ADMIN' ? '管理员' : '用户';
}

function rankClass(index: number) {
  if (index === 0) return 'text-amber-500';
  if (index === 1) return 'text-slate-400';
  if (index === 2) return 'text-amber-700';
  return 'text-muted-foreground';
}

export function UserRankTable({
  items,
  onSelectUser
}: {
  items: UserTrafficRankItem[];
  onSelectUser: (user: UserTrafficRankItem) => void;
}) {
  const [search, setSearch] = React.useState('');
  const [roleFilter, setRoleFilter] = React.useState<RoleFilter>('ALL');
  const [page, setPage] = React.useState(1);
  const normalizedSearch = search.trim().toLowerCase();
  const filteredItems = React.useMemo(
    () => items.filter((item) => (
      (!normalizedSearch || item.email.toLowerCase().includes(normalizedSearch)) &&
      (roleFilter === 'ALL' || item.role === roleFilter)
    )),
    [items, normalizedSearch, roleFilter]
  );
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const visibleItems = filteredItems.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  React.useEffect(() => setPage(1), [normalizedSearch, roleFilter]);
  React.useEffect(() => setPage((current) => Math.min(current, totalPages)), [totalPages]);

  if (items.length === 0) return <p className="py-10 text-center text-sm text-muted-foreground">暂无用户流量记录</p>;

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            aria-label="搜索用户邮箱"
            className="h-9 pl-8"
            placeholder="搜索用户邮箱…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <Select value={roleFilter} onValueChange={(value) => setRoleFilter(value as RoleFilter)}>
          <SelectTrigger aria-label="筛选用户角色" className="h-9 w-full sm:w-36">
            <SelectValue placeholder="角色" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">全部角色</SelectItem>
            <SelectItem value="ADMIN">管理员</SelectItem>
            <SelectItem value="USER">普通用户</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Table className="min-w-[1040px]">
        <TableHeader>
          <TableRow>
            <TableHead className="w-14 whitespace-nowrap">#</TableHead>
            <TableHead className="whitespace-nowrap">用户</TableHead>
            <TableHead className="whitespace-nowrap text-right">上行</TableHead>
            <TableHead className="whitespace-nowrap text-right">下行</TableHead>
            <TableHead className="whitespace-nowrap text-right">物理总量</TableHead>
            <TableHead className="whitespace-nowrap text-right">折算计费量</TableHead>
            <TableHead className="whitespace-nowrap">占比</TableHead>
            <TableHead className="w-32 text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visibleItems.length > 0 ? visibleItems.map((item) => {
            const rank = items.indexOf(item);
            return (
              <TableRow
                key={item.userId}
                tabIndex={0}
                className="cursor-pointer focus-visible:bg-muted/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                aria-label={`查看 ${item.email} 的流量明细`}
                onClick={() => onSelectUser(item)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onSelectUser(item);
                  }
                }}
              >
                <TableCell className={`font-semibold tabular-nums ${rankClass(rank)}`}>
                  <div className="flex items-center gap-1">
                    {rank < 3 ? <Medal className="size-4" aria-hidden="true" /> : rank + 1}
                    <span className="sr-only">第 {rank + 1} 名</span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="min-w-48">
                    <div className="max-w-64 truncate font-medium" title={item.email}>{item.email}</div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <Badge variant={item.role === 'ADMIN' ? 'default' : 'secondary'}>{roleLabel(item.role)}</Badge>
                      <Badge variant="outline">{item.planName ?? '无套餐'}</Badge>
                      {!item.isActive && <Badge variant="destructive">已封禁</Badge>}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="whitespace-nowrap text-right tabular-nums">{formatBytes(item.upload)}</TableCell>
                <TableCell className="whitespace-nowrap text-right tabular-nums">{formatBytes(item.download)}</TableCell>
                <TableCell className="whitespace-nowrap text-right font-medium tabular-nums">{formatBytes(item.total)}</TableCell>
                <TableCell className="whitespace-nowrap text-right font-medium tabular-nums">{formatBytes(item.billedTotal)}</TableCell>
                <TableCell>
                  <div className="flex min-w-28 items-center gap-2">
                    <Progress value={item.percentage} className="h-1.5 w-16" />
                    <span className="text-xs tabular-nums">{item.percentage}%</span>
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="gap-1.5"
                    aria-label={`查看 ${item.email} 的流量明细`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelectUser(item);
                    }}
                  >
                    <Activity className="size-4" />
                    流量明细
                  </Button>
                </TableCell>
              </TableRow>
            );
          }) : (
            <TableRow>
              <TableCell colSpan={8} className="h-32 text-center text-sm text-muted-foreground">没有匹配的用户</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <div className="flex flex-col gap-2 px-4 pb-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">共 {filteredItems.length} 位用户</p>
        <Pagination>
          <PaginationInfo page={page} totalPages={totalPages} />
          <PaginationPrevious onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1} />
          <PaginationNext onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page >= totalPages} />
        </Pagination>
      </div>
    </div>
  );
}
