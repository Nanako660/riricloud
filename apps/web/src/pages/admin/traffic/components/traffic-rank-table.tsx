import { useTranslation } from 'react-i18next';
import { Medal } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatBytes } from '@/lib/utils';
import type { LineTrafficRankItem } from '../use-traffic';

function rankClass(index: number) {
  if (index === 0) return 'text-amber-500';
  if (index === 1) return 'text-slate-400';
  if (index === 2) return 'text-amber-700';
  return 'text-muted-foreground';
}

export function TrafficRankTable({ items, compact = false }: { items: LineTrafficRankItem[]; compact?: boolean }) {
  const { t } = useTranslation(['admin', 'common']);
  if (items.length === 0) return <p className="py-10 text-center text-sm text-muted-foreground">{t('admin:traffic.emptyLineRecords')}</p>;
  return (
    <Table className={compact ? 'min-w-[700px]' : 'min-w-[920px]'}>
      <TableHeader>
        <TableRow>
          <TableHead className="w-12 whitespace-nowrap">{t('admin:traffic.colRank')}</TableHead>
          <TableHead className="whitespace-nowrap">{t('admin:traffic.tabLines')}</TableHead>
          <TableHead className="whitespace-nowrap">{t('admin:traffic.colTypeProtocol')}</TableHead>
          <TableHead className="whitespace-nowrap">{t('admin:traffic.colRate')}</TableHead>
          <TableHead className="whitespace-nowrap text-right">{t('admin:traffic.colUpload')}</TableHead>
          <TableHead className="whitespace-nowrap text-right">{t('admin:traffic.colDownload')}</TableHead>
          <TableHead className="whitespace-nowrap text-right">{t('admin:traffic.colPhysicalTotal')}</TableHead>
          <TableHead className="whitespace-nowrap text-right">{t('admin:traffic.colBilledTotal')}</TableHead>
          {!compact && <TableHead>{t('admin:traffic.colPercentage')}</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item, index) => (
          <TableRow key={item.lineId ?? item.lineName}>
            <TableCell className={`font-semibold tabular-nums ${rankClass(index)}`}><div className="flex items-center gap-1">{index < 3 && <Medal className="size-4" />}{index >= 3 && index + 1}</div></TableCell>
            <TableCell className="max-w-48 truncate font-medium">{item.lineName}</TableCell>
            <TableCell>
              <div className="flex flex-wrap gap-1">
                {item.lineType && <Badge className="whitespace-nowrap" variant="outline">{item.lineType}</Badge>}
                {item.protocolType && <Badge className="whitespace-nowrap" variant="secondary">{item.protocolType}</Badge>}
              </div>
            </TableCell>
            <TableCell><Badge className="whitespace-nowrap" variant="outline">{item.trafficRate}x</Badge></TableCell>
            <TableCell className="whitespace-nowrap text-right tabular-nums">{formatBytes(item.upload)}</TableCell>
            <TableCell className="whitespace-nowrap text-right tabular-nums">{formatBytes(item.download)}</TableCell>
            <TableCell className="whitespace-nowrap text-right tabular-nums">{formatBytes(item.total)}</TableCell>
            <TableCell className="whitespace-nowrap text-right font-medium tabular-nums">{formatBytes(item.billedTotal)}</TableCell>
            {!compact && <TableCell><div className="flex items-center gap-2"><Progress value={item.percentage} className="h-1.5 w-16" /><span className="text-xs tabular-nums">{item.percentage}%</span></div></TableCell>}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
