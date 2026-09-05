import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { TrendBucket } from '../types';

interface LogTrendChartProps {
  trend?: TrendBucket[];
  isLoading: boolean;
}

export function LogTrendChart({ trend, isLoading }: LogTrendChartProps) {
  if (isLoading && (!trend || trend.length === 0)) {
    return null;
  }

  const chartData = (trend ?? []).map((item) => ({
    ...item,
    hour: item.bucket.slice(-5)
  }));

  const hasData = chartData.some((d) => d.total > 0);

  return (
    <Card className="shadow-xs">
      <CardHeader className="pb-2 pt-4 px-4 sm:px-6">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm font-semibold">24 小时分级日志趋势</CardTitle>
            <CardDescription className="text-xs">各时段日志产生量与错误占比</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-2 sm:px-6 pb-4 pt-1">
        {!hasData ? (
          <div className="flex h-44 items-center justify-center text-xs text-muted-foreground">
            近 24 小时内暂无日志记录
          </div>
        ) : (
          <div className="h-44 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted/40" />
                <XAxis
                  dataKey="hour"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: 'currentColor' }}
                  className="text-muted-foreground"
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: 'currentColor' }}
                  className="text-muted-foreground"
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--popover))',
                    borderColor: 'hsl(var(--border))',
                    borderRadius: '0.5rem',
                    fontSize: '12px',
                    color: 'hsl(var(--popover-foreground))',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                  }}
                  formatter={(value, name) => {
                    const labelMap: Record<string, string> = {
                      error: 'ERROR',
                      warn: 'WARN',
                      info: 'INFO',
                      debug: 'DEBUG'
                    };
                    return [value, labelMap[String(name)] || name];
                  }}
                  labelFormatter={(label) => `时间：${label}`}
                />
                <Legend
                  verticalAlign="top"
                  align="right"
                  iconType="circle"
                  iconSize={7}
                  wrapperStyle={{ fontSize: '11px', paddingBottom: '4px' }}
                />
                <Bar dataKey="error" name="ERROR" stackId="a" fill="#ef4444" radius={[0, 0, 0, 0]} />
                <Bar dataKey="warn" name="WARN" stackId="a" fill="#f59e0b" radius={[0, 0, 0, 0]} />
                <Bar dataKey="info" name="INFO" stackId="a" fill="#3b82f6" radius={[2, 2, 0, 0]} />
                <Bar dataKey="debug" name="DEBUG" stackId="a" fill="#94a3b8" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
