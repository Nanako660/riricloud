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
  if (items.length === 0) return <p className="py-10 text-center text-sm text-muted-foreground">暂无线路流量记录</p>;
  return (
    <Table className={compact ? 'min-w-[700px]' : 'min-w-[920px]'}>
      <TableHeader>
        <TableRow>
          <TableHead className="w-12">#</TableHead>
          <TableHead>线路</TableHead>
          <TableHead>类型 / 协议</TableHead>
          <TableHead>倍率</TableHead>
          <TableHead className="text-right">上行</TableHead>
          <TableHead className="text-right">下行</TableHead>
          <TableHead className="text-right">物理总量</TableHead>
          <TableHead className="text-right">计费量</TableHead>
          {!compact && <TableHead>占比</TableHead>}
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
            <TableCell className="text-right tabular-nums">{formatBytes(item.upload)}</TableCell>
            <TableCell className="text-right tabular-nums">{formatBytes(item.download)}</TableCell>
            <TableCell className="text-right tabular-nums">{formatBytes(item.total)}</TableCell>
            <TableCell className="text-right font-medium tabular-nums">{formatBytes(item.billedTotal)}</TableCell>
            {!compact && <TableCell><div className="flex items-center gap-2"><Progress value={item.percentage} className="h-1.5 w-16" /><span className="text-xs tabular-nums">{item.percentage}%</span></div></TableCell>}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
