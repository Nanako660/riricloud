import * as React from 'react';
import { Database, Eye, ShieldAlert, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { api, extractErrorMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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

type CleanupKind = 'trafficHourly' | 'nodeRate' | 'systemLog' | 'legacyTraffic';
type CleanupMode = 'retention' | 'before' | 'range' | 'count' | 'all';

interface CleanupTarget {
  kind: CleanupKind;
  mode: CleanupMode;
  before?: string;
  from?: string;
  to?: string;
  keepLatest?: number;
}

interface PreviewItem {
  kind: CleanupKind;
  mode: CleanupMode;
  matchedCount: number;
  estimatedBytes: number;
  oldest: string | null;
  newest: string | null;
  condition: string;
  policy: { retentionDays?: number; maxRecords?: number };
}

interface CleanupResponse {
  items: PreviewItem[];
  generatedAt: string;
}

interface ExecuteResponse {
  status: 'SUCCEEDED' | 'PARTIAL' | 'FAILED';
  results: Array<{ kind: CleanupKind; mode: CleanupMode; matchedCount: number; deletedCount: number; success: boolean; durationMs?: number; error?: string }>;
}

const KIND_LABELS: Record<CleanupKind, string> = {
  trafficHourly: '流量小时汇总',
  nodeRate: '节点速率指标',
  systemLog: '系统日志',
  legacyTraffic: '旧版流量明细'
};

const DEFAULT_KINDS: CleanupKind[] = ['trafficHourly', 'nodeRate', 'systemLog', 'legacyTraffic'];

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '约 0 B';
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `约 ${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function toIso(value: string) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

export function TelemetryCleanupDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient();
  const [selectedKinds, setSelectedKinds] = React.useState<CleanupKind[]>(DEFAULT_KINDS);
  const [mode, setMode] = React.useState<CleanupMode>('retention');
  const [before, setBefore] = React.useState('');
  const [from, setFrom] = React.useState('');
  const [to, setTo] = React.useState('');
  const [keepLatest, setKeepLatest] = React.useState('50000');
  const [phrase, setPhrase] = React.useState('');
  const [preview, setPreview] = React.useState<CleanupResponse | null>(null);
  const [isPreviewing, setIsPreviewing] = React.useState(false);
  const [isExecuting, setIsExecuting] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [executionResult, setExecutionResult] = React.useState<ExecuteResponse | null>(null);

  const reset = () => {
    setSelectedKinds(DEFAULT_KINDS);
    setMode('retention');
    setBefore('');
    setFrom('');
    setTo('');
    setKeepLatest('50000');
    setPhrase('');
    setPreview(null);
    setConfirmOpen(false);
    setExecutionResult(null);
  };

  const buildTargets = (): CleanupTarget[] | null => {
    if (!selectedKinds.length) {
      toast.error('至少选择一种数据类型');
      return null;
    }
    if (mode === 'before' && !toIso(before)) {
      toast.error('请输入有效的清理时间点');
      return null;
    }
    if (mode === 'range') {
      const fromIso = toIso(from);
      const toIsoValue = toIso(to);
      if (!fromIso || !toIsoValue || new Date(fromIso) >= new Date(toIsoValue)) {
        toast.error('请输入有效的时间区间，且开始时间早于结束时间');
        return null;
      }
    }
    if (mode === 'count' && (!Number.isInteger(Number(keepLatest)) || Number(keepLatest) < 1)) {
      toast.error('保留条数必须是正整数');
      return null;
    }
    return selectedKinds.map((kind) => ({
      kind,
      mode,
      ...(mode === 'before' ? { before: toIso(before) } : {}),
      ...(mode === 'range' ? { from: toIso(from), to: toIso(to) } : {}),
      ...(mode === 'count' ? { keepLatest: Number(keepLatest) } : {})
    }));
  };

  const handlePreview = async () => {
    const targets = buildTargets();
    if (!targets) return;
    setIsPreviewing(true);
    try {
      const response = await api.post<CleanupResponse>('/admin/telemetry/cleanup/preview', { targets });
      setPreview(response.data);
      setPhrase('');
      setExecutionResult(null);
    } catch (error) {
      toast.error(extractErrorMessage(error, '生成清理预览失败'));
    } finally {
      setIsPreviewing(false);
    }
  };

  const handleExecute = async () => {
    if (!preview) return;
    if (phrase !== 'CLEAR_HISTORY') {
      toast.error('请输入正确的确认短语 CLEAR_HISTORY');
      return;
    }
    const targets = buildTargets();
    if (!targets) return;
    setIsExecuting(true);
    try {
      const response = await api.post<ExecuteResponse>('/admin/telemetry/cleanup', { targets, confirmationPhrase: phrase });
      const deleted = response.data.results.reduce((sum, item) => sum + item.deletedCount, 0);
      if (response.data.status === 'SUCCEEDED') {
        toast.success(`清理完成，共删除 ${deleted.toLocaleString()} 条历史记录`);
      } else if (response.data.status === 'PARTIAL') {
        toast.warning(`清理部分完成，共删除 ${deleted.toLocaleString()} 条历史记录`);
      } else {
        toast.error('清理失败，未能完成所选数据类型的清理');
      }
      setExecutionResult(response.data);
      setConfirmOpen(false);
      setPhrase('');
      void queryClient.invalidateQueries({ queryKey: ['admin-logs'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-logs-metrics'] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'traffic'] });
    } catch (error) {
      toast.error(extractErrorMessage(error, '执行清理失败'));
    } finally {
      setIsExecuting(false);
    }
  };

  const toggleKind = (kind: CleanupKind) => {
    setSelectedKinds((current) => current.includes(kind) ? current.filter((item) => item !== kind) : [...current, kind]);
    setPreview(null);
    setExecutionResult(null);
  };

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!value) reset(); onOpenChange(value); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive"><Trash2 className="size-4" />历史观测数据清理</DialogTitle>
          <DialogDescription>只清理历史观测数据，不修改用户额度、订阅用量、流量游标或当前节点状态。</DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 py-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-medium">数据类型</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {DEFAULT_KINDS.map((kind) => (
                  <label key={kind} className="flex items-center gap-2 rounded-md border p-2.5 text-sm">
                    <Checkbox checked={selectedKinds.includes(kind)} onCheckedChange={() => toggleKind(kind)} />
                    <span>{KIND_LABELS[kind]}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="telemetry-cleanup-mode">清理模式</label>
              <Select value={mode} onValueChange={(value) => { setMode(value as CleanupMode); setPreview(null); setExecutionResult(null); }}>
                <SelectTrigger id="telemetry-cleanup-mode"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="retention">按当前保留策略</SelectItem>
                  <SelectItem value="before">删除指定时间以前</SelectItem>
                  <SelectItem value="range">删除指定时间区间</SelectItem>
                  <SelectItem value="count">仅保留最新 N 条</SelectItem>
                  <SelectItem value="all">清空所选类型全部历史</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {mode === 'before' ? <Input type="datetime-local" value={before} onChange={(event) => { setBefore(event.target.value); setPreview(null); setExecutionResult(null); }} aria-label="清理时间点" /> : null}
            {mode === 'range' ? <div className="grid gap-2 sm:grid-cols-2"><Input type="datetime-local" value={from} onChange={(event) => { setFrom(event.target.value); setPreview(null); setExecutionResult(null); }} aria-label="开始时间" /><Input type="datetime-local" value={to} onChange={(event) => { setTo(event.target.value); setPreview(null); setExecutionResult(null); }} aria-label="结束时间" /></div> : null}
            {mode === 'count' ? <Input type="number" min={1} max={1000000} value={keepLatest} onChange={(event) => { setKeepLatest(event.target.value); setPreview(null); setExecutionResult(null); }} aria-label="保留最新记录数" /> : null}
            <Button type="button" variant="outline" className="w-full" onClick={() => void handlePreview()} disabled={isPreviewing || isExecuting}><Eye />{isPreviewing ? '生成预览中…' : '生成清理预览'}</Button>
          </div>

          <div className="min-h-48 rounded-lg border bg-muted/20 p-3">
            {!preview ? <div className="flex h-full min-h-40 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground"><Database className="size-6" /><p>先生成预览，确认实际影响范围后再执行。</p></div> : <div className="space-y-3"><p className="text-sm font-medium">预览结果</p>{preview.items.map((item) => <div key={item.kind} className="rounded-md border bg-background p-3 text-xs"><div className="flex items-center justify-between gap-2"><span className="font-medium">{KIND_LABELS[item.kind]}</span><span className="tabular-nums">{item.matchedCount.toLocaleString()} 条</span></div><p className="mt-1 text-muted-foreground">{item.condition}</p><p className="mt-1 text-muted-foreground">{formatBytes(item.estimatedBytes)} · {item.oldest ? `最早 ${new Date(item.oldest).toLocaleString()}` : '没有匹配记录'}{item.newest ? ` · 最新 ${new Date(item.newest).toLocaleString()}` : ''}</p></div>)}{executionResult ? <div className="space-y-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs"><p className="font-medium">执行结果：{executionResult.status}</p>{executionResult.results.map((item) => <p key={item.kind} className={item.success ? 'text-emerald-700 dark:text-emerald-300' : 'text-destructive'}>{KIND_LABELS[item.kind]}：匹配 {item.matchedCount.toLocaleString()} 条，删除 {item.deletedCount.toLocaleString()} 条{item.error ? `，${item.error}` : ''}</p>)}</div> : <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300"><ShieldAlert className="mt-0.5 size-4 shrink-0" /><span>执行不可逆。点击“进入执行确认”后还需输入 <code className="font-semibold">CLEAR_HISTORY</code>。</span></div>}</div>}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isExecuting}>取消</Button>
          <Button type="button" variant="destructive" onClick={() => setConfirmOpen(true)} disabled={!preview || isExecuting || Boolean(executionResult)}><Trash2 />进入执行确认</Button>
        </DialogFooter>
      </DialogContent>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认清理历史观测数据</AlertDialogTitle>
            <AlertDialogDescription>该操作不可逆，将按刚才生成的预览条件逐类删除历史记录。请输入固定短语后执行。</AlertDialogDescription>
          </AlertDialogHeader>
          <Input value={phrase} onChange={(event) => setPhrase(event.target.value)} placeholder="输入 CLEAR_HISTORY" aria-label="清理确认短语" autoComplete="off" />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isExecuting}>返回</AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button type="button" variant="destructive" onClick={() => void handleExecute()} disabled={isExecuting || phrase !== 'CLEAR_HISTORY'}>{isExecuting ? '清理中…' : '确认执行清理'}</Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
