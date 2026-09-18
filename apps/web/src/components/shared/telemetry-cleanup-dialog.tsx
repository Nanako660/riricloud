import * as React from 'react';
import { Database, Eye, RefreshCw, ShieldAlert, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api, extractErrorMessage } from '@/lib/api';
import { formatBytes } from '@/lib/utils';
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

export type CleanupKind = 'trafficHourly' | 'nodeRate' | 'systemLog' | 'legacyTraffic';
export type CleanupMode = 'retention' | 'before' | 'range' | 'count' | 'all';

export interface CleanupTarget {
  kind: CleanupKind;
  mode: CleanupMode;
  before?: string;
  from?: string;
  to?: string;
  keepLatest?: number;
}

export interface PreviewItem {
  kind: CleanupKind;
  mode: CleanupMode;
  matchedCount: number;
  estimatedBytes: number;
  oldest: string | null;
  newest: string | null;
  condition: string;
  policy: { retentionDays?: number; maxRecords?: number };
}

export interface CleanupResponse {
  items: PreviewItem[];
  generatedAt: string;
}

export interface DatabaseFileStat {
  target: 'main' | 'telemetry';
  path: string;
  size: number;
  walSize: number;
  shmSize: number;
  totalSize: number;
}

export interface DatabaseStatsResponse {
  databases: DatabaseFileStat[];
  totalBytes: number;
}

export interface VacuumResultItem {
  target: 'main' | 'telemetry';
  path: string;
  bytesBefore: number;
  bytesAfter: number;
  reclaimedBytes: number;
}

export interface VacuumResponse {
  results: VacuumResultItem[];
  totalReclaimedBytes: number;
  completedAt: string;
}

export interface ExecuteResponse {
  status: 'SUCCEEDED' | 'PARTIAL' | 'FAILED';
  results: Array<{ kind: CleanupKind; mode: CleanupMode; matchedCount: number; deletedCount: number; success: boolean; durationMs?: number; error?: string }>;
  vacuum?: VacuumResponse;
}

const DEFAULT_KINDS: CleanupKind[] = ['trafficHourly', 'nodeRate', 'systemLog', 'legacyTraffic'];

function toIso(value: string) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

export function TelemetryCleanupDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation(['admin', 'common']);
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

  const getKindLabel = (k: CleanupKind): string => t(`admin:telemetryCleanup.kinds.${k}`);

  const { data: dbStats, isLoading: isStatsLoading } = useQuery<DatabaseStatsResponse>({
    queryKey: ['admin-database-stats'],
    queryFn: async () => {
      const res = await api.get<DatabaseStatsResponse>('/admin/telemetry/cleanup/database-stats');
      return res.data;
    },
    enabled: open
  });

  const vacuumMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post<VacuumResponse>('/admin/telemetry/cleanup/vacuum', {});
      return res.data;
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['admin-database-stats'] });
      if (data.totalReclaimedBytes > 0) {
        toast.success(t('admin:telemetryCleanup.vacuumSuccess', { bytes: formatBytes(data.totalReclaimedBytes) }));
      } else {
        toast.success(t('admin:telemetryCleanup.vacuumNoWaste'));
      }
    },
    onError: (error) => {
      toast.error(extractErrorMessage(error, t('admin:telemetryCleanup.vacuumFailed')));
    }
  });

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
      toast.error(t('admin:telemetryCleanup.selectAtLeastOneKind'));
      return null;
    }
    if (mode === 'before' && !toIso(before)) {
      toast.error(t('admin:telemetryCleanup.invalidTimePoint'));
      return null;
    }
    if (mode === 'range') {
      const fromIso = toIso(from);
      const toIsoValue = toIso(to);
      if (!fromIso || !toIsoValue || new Date(fromIso) >= new Date(toIsoValue)) {
        toast.error(t('admin:telemetryCleanup.invalidTimeRange'));
        return null;
      }
    }
    if (mode === 'count' && (!Number.isInteger(Number(keepLatest)) || Number(keepLatest) < 1)) {
      toast.error(t('admin:telemetryCleanup.keepLatestPositiveInt'));
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
      toast.error(extractErrorMessage(error, t('admin:telemetryCleanup.previewFailed')));
    } finally {
      setIsPreviewing(false);
    }
  };

  const handleExecute = async () => {
    if (!preview) return;
    if (phrase !== 'CLEAR_HISTORY') {
      toast.error(t('admin:telemetryCleanup.invalidConfirmationPhrase'));
      return;
    }
    const targets = buildTargets();
    if (!targets) return;
    setIsExecuting(true);
    try {
      const response = await api.post<ExecuteResponse>('/admin/telemetry/cleanup', { targets, confirmationPhrase: phrase });
      const deleted = response.data.results.reduce((sum, item) => sum + item.deletedCount, 0);
      const reclaimed = response.data.vacuum?.totalReclaimedBytes ?? 0;
      const reclaimedText = reclaimed > 0 ? t('admin:telemetryCleanup.reclaimedDiskSpace', { bytes: formatBytes(reclaimed) }) : '';
      if (response.data.status === 'SUCCEEDED') {
        toast.success(t('admin:telemetryCleanup.cleanupSuccess', { deleted: deleted.toLocaleString(), reclaimed: reclaimedText }));
      } else if (response.data.status === 'PARTIAL') {
        toast.warning(t('admin:telemetryCleanup.cleanupPartial', { deleted: deleted.toLocaleString(), reclaimed: reclaimedText }));
      } else {
        toast.error(t('admin:telemetryCleanup.cleanupFailed'));
      }
      setExecutionResult(response.data);
      setConfirmOpen(false);
      setPhrase('');
      void queryClient.invalidateQueries({ queryKey: ['admin-database-stats'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-logs'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-logs-metrics'] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'traffic'] });
    } catch (error) {
      toast.error(extractErrorMessage(error, t('admin:telemetryCleanup.cleanupFailed')));
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
          <DialogTitle className="flex items-center gap-2 text-destructive"><Trash2 className="size-4" />{t('admin:telemetryCleanup.title')}</DialogTitle>
          <DialogDescription>{t('admin:telemetryCleanup.desc')}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-xs">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Database className="size-4 shrink-0 text-primary" />
            <span>
              {t('admin:telemetryCleanup.databaseSize')}
              {isStatsLoading ? (
                t('admin:telemetryCleanup.reading')
              ) : dbStats ? (
                <span className="font-medium text-foreground">
                  {' '}{t('admin:telemetryCleanup.totalStats', { total: formatBytes(dbStats.totalBytes) })}
                  <span className="ml-1 text-muted-foreground">
                    {t('admin:telemetryCleanup.mainAndTelemetryStats', {
                      main: formatBytes(dbStats.databases.find((d) => d.target === 'main')?.totalSize ?? 0),
                      telemetry: formatBytes(dbStats.databases.find((d) => d.target === 'telemetry')?.totalSize ?? 0)
                    })}
                  </span>
                </span>
              ) : (
                t('admin:telemetryCleanup.unknown')
              )}
            </span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            disabled={vacuumMutation.isPending || isExecuting}
            onClick={() => vacuumMutation.mutate()}
          >
            <RefreshCw className={`mr-1 size-3 ${vacuumMutation.isPending ? 'animate-spin' : ''}`} />
            {vacuumMutation.isPending ? t('admin:telemetryCleanup.vacuuming') : t('admin:telemetryCleanup.vacuumAction')}
          </Button>
        </div>

        <div className="grid gap-5 py-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-medium">{t('admin:telemetryCleanup.dataType')}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {DEFAULT_KINDS.map((kind) => (
                  <label key={kind} className="flex items-center gap-2 rounded-md border p-2.5 text-sm">
                    <Checkbox checked={selectedKinds.includes(kind)} onCheckedChange={() => toggleKind(kind)} />
                    <span>{getKindLabel(kind)}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="telemetry-cleanup-mode">{t('admin:telemetryCleanup.cleanupMode')}</label>
              <Select value={mode} onValueChange={(value) => { setMode(value as CleanupMode); setPreview(null); setExecutionResult(null); }}>
                <SelectTrigger id="telemetry-cleanup-mode"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="retention">{t('admin:telemetryCleanup.modeRetention')}</SelectItem>
                  <SelectItem value="before">{t('admin:telemetryCleanup.modeBefore')}</SelectItem>
                  <SelectItem value="range">{t('admin:telemetryCleanup.modeRange')}</SelectItem>
                  <SelectItem value="count">{t('admin:telemetryCleanup.modeCount')}</SelectItem>
                  <SelectItem value="all">{t('admin:telemetryCleanup.modeAll')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {mode === 'before' ? <Input type="datetime-local" value={before} onChange={(event) => { setBefore(event.target.value); setPreview(null); setExecutionResult(null); }} aria-label={t('admin:telemetryCleanup.modeBefore')} /> : null}
            {mode === 'range' ? <div className="grid gap-2 sm:grid-cols-2"><Input type="datetime-local" value={from} onChange={(event) => { setFrom(event.target.value); setPreview(null); setExecutionResult(null); }} aria-label={t('admin:telemetryCleanup.modeRange')} /><Input type="datetime-local" value={to} onChange={(event) => { setTo(event.target.value); setPreview(null); setExecutionResult(null); }} aria-label={t('admin:telemetryCleanup.modeRange')} /></div> : null}
            {mode === 'count' ? <Input type="number" min={1} max={1000000} value={keepLatest} onChange={(event) => { setKeepLatest(event.target.value); setPreview(null); setExecutionResult(null); }} aria-label={t('admin:telemetryCleanup.modeCount')} /> : null}
            <Button type="button" variant="outline" className="w-full" onClick={() => void handlePreview()} disabled={isPreviewing || isExecuting}><Eye />{isPreviewing ? t('admin:telemetryCleanup.generatingPreview') : t('admin:telemetryCleanup.generatePreview')}</Button>
          </div>

          <div className="min-h-48 rounded-lg border bg-muted/20 p-3">
            {!preview ? <div className="flex h-full min-h-40 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground"><Database className="size-6" /><p>{t('admin:telemetryCleanup.previewPrompt')}</p></div> : <div className="space-y-3"><p className="text-sm font-medium">{t('admin:telemetryCleanup.previewResults')}</p>{preview.items.map((item) => <div key={item.kind} className="rounded-md border bg-background p-3 text-xs"><div className="flex items-center justify-between gap-2"><span className="font-medium">{getKindLabel(item.kind)}</span><span className="tabular-nums">{t('admin:telemetryCleanup.recordsCount', { count: item.matchedCount })}</span></div><p className="mt-1 text-muted-foreground">{item.condition}</p><p className="mt-1 text-muted-foreground">{formatBytes(item.estimatedBytes)} · {item.oldest ? t('admin:telemetryCleanup.earliest', { date: new Date(item.oldest).toLocaleString() }) : t('admin:telemetryCleanup.noMatchingRecords')}{item.newest ? ` · ${t('admin:telemetryCleanup.latest', { date: new Date(item.newest).toLocaleString() })}` : ''}</p></div>)}{executionResult ? <div className="space-y-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs"><p className="font-medium">{t('common:status.success')}: {executionResult.status}</p>{executionResult.results.map((item) => <p key={item.kind} className={item.success ? 'text-emerald-700 dark:text-emerald-300' : 'text-destructive'}>{getKindLabel(item.kind)}: {t('admin:telemetryCleanup.recordsCount', { count: item.matchedCount })}{item.error ? `, ${item.error}` : ''}</p>)}{executionResult.vacuum ? <p className="border-t border-emerald-500/20 pt-1.5 text-muted-foreground">{executionResult.vacuum.totalReclaimedBytes > 0 ? t('admin:telemetryCleanup.reclaimedVacuumSuccess', { bytes: formatBytes(executionResult.vacuum.totalReclaimedBytes) }) : t('admin:telemetryCleanup.reclaimedVacuumNoWaste')}</p> : null}</div> : <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300"><ShieldAlert className="mt-0.5 size-4 shrink-0" /><span>{t('admin:telemetryCleanup.executionIrreversibleWarning')}</span></div>}</div>}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isExecuting}>{t('common:actions.cancel')}</Button>
          <Button type="button" variant="destructive" onClick={() => setConfirmOpen(true)} disabled={!preview || isExecuting || Boolean(executionResult)}><Trash2 />{t('admin:telemetryCleanup.enterConfirm')}</Button>
        </DialogFooter>
      </DialogContent>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('admin:telemetryCleanup.confirmDialogTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('admin:telemetryCleanup.confirmDialogDesc')}</AlertDialogDescription>
          </AlertDialogHeader>
          <Input value={phrase} onChange={(event) => setPhrase(event.target.value)} placeholder={t('admin:telemetryCleanup.confirmPhrasePlaceholder')} aria-label={t('admin:telemetryCleanup.confirmPhrasePlaceholder')} autoComplete="off" />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isExecuting}>{t('common:actions.back')}</AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button type="button" variant="destructive" onClick={() => void handleExecute()} disabled={isExecuting || phrase !== 'CLEAR_HISTORY'}>{isExecuting ? t('admin:telemetryCleanup.cleaning') : t('admin:telemetryCleanup.confirmExecute')}</Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
