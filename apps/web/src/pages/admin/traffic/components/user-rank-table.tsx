import * as React from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation(['admin', 'common']);
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

  if (items.length === 0) return <p className="py-10 text-center text-sm text-muted-foreground">{t('admin:traffic.emptyUserRecords')}</p>;

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            aria-label={t('admin:users.searchPlaceholder')}
            className="h-9 pl-8"
            placeholder={t('admin:users.searchPlaceholder')}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <Select value={roleFilter} onValueChange={(value) => setRoleFilter(value as RoleFilter)}>
          <SelectTrigger aria-label={t('admin:traffic.filterRoleAria')} className="h-9 w-full sm:w-36">
            <SelectValue placeholder={t('admin:users.filterRole')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t('admin:users.allRoles')}</SelectItem>
            <SelectItem value="ADMIN">{t('admin:users.roleAdmin')}</SelectItem>
            <SelectItem value="USER">{t('admin:users.roleUser')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Table className="min-w-[1040px]">
        <TableHeader>
          <TableRow>
            <TableHead className="w-14 whitespace-nowrap">{t('admin:traffic.colRank')}</TableHead>
            <TableHead className="whitespace-nowrap">{t('admin:traffic.tabUsers')}</TableHead>
            <TableHead className="whitespace-nowrap text-right">{t('admin:traffic.colUpload')}</TableHead>
            <TableHead className="whitespace-nowrap text-right">{t('admin:traffic.colDownload')}</TableHead>
            <TableHead className="whitespace-nowrap text-right">{t('admin:traffic.colPhysicalTotal')}</TableHead>
            <TableHead className="whitespace-nowrap text-right">{t('admin:traffic.colBilledTotal')}</TableHead>
            <TableHead className="whitespace-nowrap">{t('admin:traffic.colPercentage')}</TableHead>
            <TableHead className="w-32 text-right">{t('admin:traffic.userTrafficDetails')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visibleItems.length > 0 ? visibleItems.map((item) => {
            const rank = items.indexOf(item);
            return (
              <TableRow
                key={item.userId}
                tabIndex={0}
                className="cursor-pointer focus-visible:bg-muted/50 focus-visible:outline-none focus-visible:ring-1 focus-ring"
                aria-label={t('admin:traffic.viewUserTrafficAria', { email: item.email })}
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
                    <span className="sr-only">{t('admin:traffic.rankSrOnly', { rank: rank + 1 })}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="min-w-48">
                    <div className="max-w-64 truncate font-medium" title={item.email}>{item.email}</div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <Badge variant={item.role === 'ADMIN' ? 'default' : 'secondary'}>{item.role === 'ADMIN' ? t('admin:users.roleAdmin') : t('admin:users.roleUser')}</Badge>
                      <Badge variant="outline">{item.planName ?? t('admin:users.noSubscription')}</Badge>
                      {!item.isActive && <Badge variant="destructive">{t('admin:users.statusDisabled')}</Badge>}
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
                    aria-label={t('admin:traffic.viewUserTrafficAria', { email: item.email })}
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelectUser(item);
                    }}
                  >
                    <Activity className="size-4" />
                    {t('admin:traffic.userTrafficDetails')}
                  </Button>
                </TableCell>
              </TableRow>
            );
          }) : (
            <TableRow>
              <TableCell colSpan={8} className="h-32 text-center text-sm text-muted-foreground">{t('common:table.noResults')}</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <div className="flex flex-col gap-2 px-4 pb-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">{t('common:table.totalItems', { total: filteredItems.length })}</p>
        <Pagination>
          <PaginationInfo page={page} totalPages={totalPages} />
          <PaginationPrevious onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1} />
          <PaginationNext onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page >= totalPages} />
        </Pagination>
      </div>
    </div>
  );
}
