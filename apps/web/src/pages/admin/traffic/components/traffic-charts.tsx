import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, Pie, PieChart, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartLegend, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { formatBytes, formatRate } from '@/lib/utils';
import type { LineTrafficRankItem, RateSeriesPoint, TrafficTimeSeriesPoint, UserTrafficRankItem } from '../use-traffic';

const chartColors = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

export function TrafficTrendChart({ data, compact = false }: { data: TrafficTimeSeriesPoint[]; compact?: boolean }) {
  return (
    <ChartContainer className={compact ? 'h-52' : 'h-full min-h-[300px]'}>
      <ResponsiveContainer width="100%" height="100%">
        {compact ? (
          <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/60" />
            <XAxis dataKey="displayTime" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} interval="preserveStartEnd" />
            <YAxis hide />
            <ChartTooltip content={<ChartTooltipContent formatter={(value) => formatBytes(value)} />} />
            <Bar dataKey="download" name="下行" fill="hsl(var(--chart-1))" radius={[3, 3, 0, 0]} />
            <Bar dataKey="upload" name="上行" fill="hsl(var(--chart-2))" radius={[3, 3, 0, 0]} />
          </BarChart>
        ) : (
          <AreaChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: -4 }}>
            <defs>
              <linearGradient id="traffic-download-gradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={0.3} />
                <stop offset="100%" stopColor="hsl(var(--chart-1))" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="traffic-upload-gradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--chart-2))" stopOpacity={0.3} />
                <stop offset="100%" stopColor="hsl(var(--chart-2))" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/60" />
            <XAxis dataKey="displayTime" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} interval="preserveStartEnd" />
            <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11 }} tickFormatter={formatBytes} width={56} />
            <ChartTooltip content={<ChartTooltipContent formatter={(value) => formatBytes(value)} />} />
            <ChartLegend verticalAlign="top" height={28} />
            <Area type="monotone" dataKey="download" name="下行" stroke="hsl(var(--chart-1))" fill="url(#traffic-download-gradient)" strokeWidth={2} />
            <Area type="monotone" dataKey="upload" name="上行" stroke="hsl(var(--chart-2))" fill="url(#traffic-upload-gradient)" strokeWidth={2} />
          </AreaChart>
        )}
      </ResponsiveContainer>
    </ChartContainer>
  );
}

type DonutItem = {
  key: string;
  name: string;
  total: number;
  percentage: number;
};

function maskEmail(email: string) {
  const [local, domain] = email.split('@');
  if (!domain) return email.length > 16 ? `${email.slice(0, 13)}…` : email;
  const maskedLocal = local.length > 2 ? `${local.slice(0, 2)}***` : `${local.slice(0, 1)}***`;
  return `${maskedLocal}@${domain}`;
}

function buildUserDonutData(data: UserTrafficRankItem[], totalPhysical: number): DonutItem[] {
  const topUsers = data.slice(0, 5).map((item) => ({
    key: item.userId,
    name: maskEmail(item.email),
    total: item.total,
    percentage: item.percentage
  }));
  const otherTotal = Math.max(totalPhysical - topUsers.reduce((sum, item) => sum + item.total, 0), 0);
  if (otherTotal <= 0) return topUsers;
  return [
    ...topUsers,
    {
      key: 'other-users',
      name: '其他用户',
      total: otherTotal,
      percentage: totalPhysical > 0 ? Math.round((otherTotal / totalPhysical) * 10000) / 100 : 0
    }
  ];
}

export function TrafficDonutChart({
  data,
  mode = 'line',
  totalPhysical
}: {
  data: LineTrafficRankItem[] | UserTrafficRankItem[];
  mode?: 'line' | 'user';
  totalPhysical?: number;
}) {
  const chartData: DonutItem[] = mode === 'user'
    ? buildUserDonutData(data as UserTrafficRankItem[], totalPhysical ?? 0)
    : (data as LineTrafficRankItem[]).map((item) => ({
      key: item.lineId ?? item.lineName,
      name: item.lineName,
      total: item.total,
      percentage: item.percentage
    }));
  const total = mode === 'user' ? totalPhysical ?? 0 : chartData.reduce((sum, item) => sum + item.total, 0);
  if (total <= 0) return <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">暂无{mode === 'user' ? '用户' : '线路'}流量</div>;

  return (
    <div className="flex h-full flex-col justify-between space-y-4">
      <ChartContainer className="relative h-48 w-full">
        <div className="pointer-events-none absolute inset-0 z-0 flex flex-col items-center justify-center text-center">
          <span className="text-lg font-semibold tabular-nums leading-tight">{formatBytes(total)}</span>
          <span className="mt-0.5 text-xs text-muted-foreground">物理流量</span>
        </div>
        <ResponsiveContainer width="100%" height="100%" className="relative z-10">
          <PieChart>
            <Pie data={chartData} dataKey="total" nameKey="name" innerRadius="62%" outerRadius="84%" paddingAngle={2} strokeWidth={0}>
              {chartData.map((item, index) => <Cell key={item.key} fill={chartColors[index % chartColors.length]} />)}
            </Pie>
            <ChartTooltip content={<ChartTooltipContent formatter={(value) => formatBytes(value)} />} />
          </PieChart>
        </ResponsiveContainer>
      </ChartContainer>
      <div className="space-y-2 border-t pt-3">
        {chartData.slice(0, 5).map((item, index) => (
          <div key={item.key} className="flex min-w-0 items-center justify-between gap-3 text-xs sm:text-sm">
            <span className="flex min-w-0 items-center gap-2 overflow-hidden" title={item.name}>
              <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: chartColors[index % chartColors.length] }} />
              <span className="truncate font-medium">{item.name}</span>
            </span>
            <span className="shrink-0 text-muted-foreground tabular-nums text-xs font-medium">{item.percentage}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function RateTrendChart({ data }: { data: RateSeriesPoint[] }) {
  return (
    <ChartContainer className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/60" />
          <XAxis dataKey="displayTime" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} interval="preserveStartEnd" />
          <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11 }} tickFormatter={formatRate} width={64} />
          <ChartTooltip content={<ChartTooltipContent formatter={(value) => formatRate(value)} />} />
          <ChartLegend verticalAlign="top" height={28} />
          <Area type="monotone" dataKey="downloadRate" name="平均下行" stroke="hsl(var(--chart-1))" fill="hsl(var(--chart-1))" fillOpacity={0.14} strokeWidth={2} />
          <Area type="monotone" dataKey="uploadRate" name="平均上行" stroke="hsl(var(--chart-2))" fill="hsl(var(--chart-2))" fillOpacity={0.12} strokeWidth={2} />
          <Line type="monotone" dataKey="peakDownloadRate" name="峰值下行" stroke="hsl(var(--chart-1))" strokeDasharray="5 5" dot={false} strokeWidth={1.5} />
          <Line type="monotone" dataKey="peakUploadRate" name="峰值上行" stroke="hsl(var(--chart-2))" strokeDasharray="5 5" dot={false} strokeWidth={1.5} />
        </AreaChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
}
