import * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { CheckCircle2, CircleAlert, Clock3, Network } from 'lucide-react';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ResponsiveDialog, ResponsiveDialogContent } from '@/components/shared/responsive-dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatDateTime } from '@/lib/utils';
import type { ProbeResult, ProbeSnapshot } from '../use-nodes';

const schema = z.object({
  type: z.enum(['tcp', 'dns', 'icmp']),
  target: z.string().trim().min(1, '请输入目标地址'),
  port: z.coerce.number().int().min(1).max(65535).optional(),
  timeoutMs: z.coerce.number().int().min(100).max(10000)
});

type Values = z.infer<typeof schema>;

const presets: Array<{ value: string; label: string; probe: Values }> = [
  { value: 'cloudflare', label: 'Cloudflare Anycast · TCP 443', probe: { type: 'tcp', target: '1.1.1.1', port: 443, timeoutMs: 3000 } },
  { value: 'google-dns', label: 'Google DNS · DNS 解析', probe: { type: 'dns', target: 'dns.google', port: 443, timeoutMs: 3000 } },
  { value: 'github', label: 'GitHub · TCP 443', probe: { type: 'tcp', target: 'github.com', port: 443, timeoutMs: 5000 } },
  { value: 'custom', label: '自定义目标', probe: { type: 'tcp', target: '', port: 443, timeoutMs: 3000 } }
];

function resultLabel(result: ProbeResult) {
  if (result.type === 'tcp') return 'TCP';
  if (result.type === 'dns') return 'DNS';
  return 'ICMP';
}

function ProbeResultCard({ result }: { result: ProbeResult }) {
  const success = result.success;
  return <Card className="shadow-none"><CardContent className="space-y-2 p-4">
    <div className="flex items-center justify-between gap-2"><div className="flex min-w-0 items-center gap-2"><span className="font-medium">{resultLabel(result)}</span><span className="truncate text-sm text-muted-foreground">{result.target}</span></div>{success ? <Badge><CheckCircle2 className="mr-1 h-3.5 w-3.5" />正常</Badge> : <Badge variant="destructive"><CircleAlert className="mr-1 h-3.5 w-3.5" />失败</Badge>}</div>
    <div className="grid gap-2 text-sm sm:grid-cols-3"><span className="flex items-center gap-1.5 text-muted-foreground"><Clock3 className="h-3.5 w-3.5" />延迟 {success && result.latencyMs !== undefined ? `${result.latencyMs} ms` : '—'}</span><span className="text-muted-foreground">丢包 {result.packetLossPercent ?? (success ? 0 : 100)}%</span><span className="truncate text-muted-foreground">{result.addresses?.length ? `解析：${result.addresses.join(', ')}` : '未返回解析地址'}</span></div>
    {!success && <p className="break-words text-xs text-destructive">{result.message || '探针失败，未返回错误详情'}</p>}
  </CardContent></Card>;
}

export function ProbeNodeDialog({ open, onOpenChange, pending, snapshot, onSubmit }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  snapshot: ProbeSnapshot | null;
  onSubmit: (values: { probes: Values[] }) => void;
}) {
  const settingsQuery = useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: async () => (await api.get<{ probePresetTargets: Array<{ type: Values['type']; target: string; port?: number; timeoutMs?: number }> }>('/admin/settings')).data,
    enabled: open,
    staleTime: 60_000
  });
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: presets[0].probe
  });
  const [preset, setPreset] = React.useState('cloudflare');
  const availablePresets = React.useMemo(() => {
    const configured = settingsQuery.data?.probePresetTargets ?? [];
    if (!configured.length) return presets;
    return [
      ...configured.map((item, index) => ({
        value: `configured-${index}`,
        label: `${item.target} · ${item.type.toUpperCase()}`,
        probe: { type: item.type, target: item.target, port: item.port, timeoutMs: item.timeoutMs ?? 3000 } as Values
      })),
      presets[presets.length - 1]
    ];
  }, [settingsQuery.data?.probePresetTargets]);

  React.useEffect(() => {
    const first = availablePresets[0];
    if (open && first && !availablePresets.some((item) => item.value === preset)) {
      setPreset(first.value);
      form.reset(first.probe);
    }
  }, [availablePresets, form, open, preset]);

  const applyPreset = (value: string) => {
    setPreset(value);
    const selected = availablePresets.find((item) => item.value === value);
    if (selected) form.reset(selected.probe);
  };

  return <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
    <ResponsiveDialogContent size="compact">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2"><Network className="h-4 w-4" />网络探针诊断</DialogTitle>
        <DialogDescription>从该 Agent 所在节点执行 TCP、DNS 或 ICMP 检测，结果会保存到节点详情。</DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <div className="space-y-2"><Label>快速预设</Label><Select value={preset} onValueChange={applyPreset}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{availablePresets.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select></div>
        <Form {...form}>
          <form className="space-y-4" onSubmit={form.handleSubmit((values) => onSubmit({ probes: [values] }))}>
            <div className="grid gap-4 sm:grid-cols-2"><FormField control={form.control} name="type" render={({ field }) => <FormItem><FormLabel>探针类型</FormLabel><Select value={field.value} onValueChange={field.onChange}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent><SelectItem value="tcp">TCP 连接</SelectItem><SelectItem value="dns">DNS 解析</SelectItem><SelectItem value="icmp">ICMP Ping</SelectItem></SelectContent></Select><FormMessage /></FormItem>} /><FormField control={form.control} name="timeoutMs" render={({ field }) => <FormItem><FormLabel>超时（毫秒）</FormLabel><FormControl><Input type="number" min={100} max={10000} {...field} /></FormControl><FormMessage /></FormItem>} /></div>
            <FormField control={form.control} name="target" render={({ field }) => <FormItem><FormLabel>目标地址</FormLabel><FormControl><Input placeholder="example.com 或 1.1.1.1" {...field} /></FormControl><FormMessage /></FormItem>} />
            <FormField control={form.control} name="port" render={({ field }) => <FormItem><FormLabel>端口（TCP 必填）</FormLabel><FormControl><Input type="number" min={1} max={65535} {...field} /></FormControl><FormMessage /></FormItem>} />
            <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>关闭</Button><Button type="submit" disabled={pending}>{pending ? '执行中…' : '开始诊断'}</Button></DialogFooter>
          </form>
        </Form>
        {snapshot && <div className="space-y-3 border-t pt-4"><div className="flex items-center justify-between gap-2"><p className="text-sm font-medium">最近一次结果</p><span className="text-xs text-muted-foreground">{formatDateTime(snapshot.completedAt)}</span></div><div className="space-y-2">{snapshot.results.map((result, index) => <ProbeResultCard key={`${result.type}-${result.target}-${index}`} result={result} />)}</div></div>}
      </div>
    </ResponsiveDialogContent>
  </ResponsiveDialog>;
}
