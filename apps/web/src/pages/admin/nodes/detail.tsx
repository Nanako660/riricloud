import * as React from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useTheme } from 'next-themes';
import { useTranslation } from 'react-i18next';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import CodeMirror from '@uiw/react-codemirror';
import { json } from '@codemirror/lang-json';
import { ArrowLeft, Clock3, Cpu, FileText, GitBranch, KeyRound, Network, RefreshCw, RotateCcw, Server, ShieldAlert, Trash2, Wrench } from 'lucide-react';
import { PageContainer } from '@/components/shared/page-container';
import { CopyButton } from '@/components/shared/copy-button';
import { EmptyState } from '@/components/shared/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ResponsiveDialog, ResponsiveDialogContent } from '@/components/shared/responsive-dialog';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDateTime, formatRate } from '@/lib/utils';
import { useFormResetOnKey } from '@/hooks/use-form-reset';
import { useAdminBinaryInfo, useAdminNodeDetail, useNodeMutations, type AdminNode, type NodeLine, type ProbeSnapshot } from './use-nodes';
import { useAdminBinaryResources } from '../binaries/use-binaries';
import { UpgradeNodeDialog } from './components/upgrade-node-dialog';
import { NodeDeploymentHistory } from './components/node-deployment-history';
import { ProbeNodeDialog } from './components/probe-node-dialog';
import { RotateTokenDialog } from './components/rotate-token-dialog';
import { InstallCommandsPicker } from './components/install-commands-picker';

function nodeRate(status: string, value: number | null) {
  return status === 'ONLINE' && value != null ? formatRate(value) : '—';
}

function nodeTotalRate(node: AdminNode) {
  if (node.status !== 'ONLINE') return '—';
  if (node.uploadRate != null && node.downloadRate != null) return formatRate(node.uploadRate + node.downloadRate);
  return node.bandwidthRate != null ? formatRate(node.bandwidthRate) : '—';
}

const nodeDetailSchema = z.object({
  name: z.string().trim().min(1, '请输入节点名称').max(64, '名称最多 64 个字符'),
  reachability: z.enum(['PUBLIC', 'NAT']),
  serverHost: z.string().trim(),
  configOverride: z.string()
}).superRefine((data, ctx) => {
  if (data.reachability === 'PUBLIC' && !data.serverHost) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['serverHost'],
      message: '公网 VPS 必须输入有效的服务器公网地址'
    });
  }
});

type NodeDetailFormValues = z.infer<typeof nodeDetailSchema>;

function GeneratedConfigPreview({ node }: { node: { id: string; lines: NodeLine[] } }) {
  const inbounds = node.lines.flatMap((line) => {
    const result: Array<Record<string, unknown>> = [];
    if (line.entryNodeId === node.id) result.push({ type: line.type === 'RELAY' && line.relayMode === 'BLIND_FORWARD' ? 'direct' : line.protocolType.toLowerCase(), tag: line.type === 'RELAY' ? `relay-${line.id}` : `line-${line.id}`, listen: '0.0.0.0', listen_port: line.entryPort });
    if (line.landingNodeId === node.id && line.type === 'RELAY' && line.relayMode !== 'TARGET_LINE' && line.landingPort) result.push({ type: line.protocolType.toLowerCase(), tag: `line-${line.id}-landing`, listen: '0.0.0.0', listen_port: line.landingPort });
    return result;
  });
  return <pre className="max-h-[480px] overflow-auto rounded-md border bg-muted/50 p-3 text-xs leading-relaxed">{JSON.stringify({ log: { level: 'warn', timestamp: true }, inbounds, outbounds: [{ type: 'direct', tag: 'direct' }] }, null, 2)}</pre>;
}

function ProbeSnapshotCard({ snapshot }: { snapshot: ProbeSnapshot | null }) {
  const { t } = useTranslation(['admin']);
  if (!snapshot) return <p className="text-sm text-muted-foreground">{t('admin:nodes.emptyFilteredDesc')}</p>;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">{snapshot.success ? '诊断通过' : '诊断存在异常'}</p>
        <span className="text-xs text-muted-foreground">{formatDateTime(snapshot.completedAt)}</span>
      </div>
      {snapshot.results.map((result, index) => (
        <div key={`${result.type}-${result.target}-${index}`} className="rounded-md border p-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium">{result.type.toUpperCase()} · {result.target}</span>
            <Badge variant={result.success ? 'default' : 'destructive'}>{result.success ? '正常' : '失败'}</Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            延迟：{result.latencyMs != null ? `${result.latencyMs} ms` : '—'} · 丢包：{result.packetLossPercent ?? (result.success ? 0 : 100)}%{result.addresses?.length ? ` · 地址：${result.addresses.join(', ')}` : ''}
          </p>
          {result.message && <p className="mt-1 break-words text-xs text-destructive">{result.message}</p>}
        </div>
      ))}
    </div>
  );
}

function InstallCommandDialog({ open, onOpenChange, node }: { open: boolean; onOpenChange: (open: boolean) => void; node: AdminNode }) {
  const { t } = useTranslation(['admin', 'common']);
  const uninstallCommand = node.uninstallCommand ?? 'sudo /usr/local/bin/riri-agent uninstall --purge --yes';
  const windowsUninstallCommand = node.windowsUninstallCommand ?? '& "$env:ProgramFiles\\RiriCloud\\riri-agent.exe" uninstall --purge --yes';
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent size="compact">
        <DialogHeader>
          <DialogTitle>{t('admin:nodes.installTitle')}</DialogTitle>
          <DialogDescription>{t('admin:nodes.installSubtitle')}</DialogDescription>
        </DialogHeader>
        <div className="min-w-0 space-y-4">
          <InstallCommandsPicker key={open ? node.id : 'closed'} commands={node.installCommands} defaultMode={node.communicationMode === 'HTTP' ? 'http' : 'ws'} nodeOsArch={node.osArch} nodeId={node.id} />
          <div className="space-y-2">
            <Label>彻底卸载（Linux / macOS）</Label>
            <div className="flex min-w-0 items-start gap-2">
              <code className="min-w-0 flex-1 break-all rounded-md border bg-muted/40 p-3 text-xs">{uninstallCommand}</code>
              <CopyButton value={uninstallCommand} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>彻底卸载（Windows，管理员 PowerShell）</Label>
            <div className="flex min-w-0 items-start gap-2">
              <code className="min-w-0 flex-1 break-all rounded-md border bg-muted/40 p-3 text-xs">{windowsUninstallCommand}</code>
              <CopyButton value={windowsUninstallCommand} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('common:actions.close')}</Button>
        </DialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

function formatDiagnosticRemaining(expiresAt: string | null, now: number): string {
  if (!expiresAt) return '—';
  const remaining = Math.max(0, new Date(expiresAt).getTime() - now);
  const minutes = Math.floor(remaining / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1_000);
  return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
}

function SingboxDiagnosticsCard({
  node,
  enabling,
  disabling,
  onEnable,
  onDisable
}: {
  node: AdminNode;
  enabling: boolean;
  disabling: boolean;
  onEnable: (level: 'INFO' | 'DEBUG') => void;
  onDisable: () => void;
}) {
  const { t } = useTranslation(['admin', 'common']);
  const [level, setLevel] = React.useState<'INFO' | 'DEBUG'>('INFO');
  const [now, setNow] = React.useState(() => Date.now());
  const active = node.singboxLogMode !== 'NORMAL' && Boolean(node.singboxLogModeUntil);

  React.useEffect(() => {
    if (!active) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [active]);

  const available = node.status === 'ONLINE' && node.supportsSingboxLogCapture;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldAlert className="h-4 w-4" />
          {t('admin:nodes.diagLogTitle')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {active ? (
          <div className="flex flex-col gap-3 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1 text-sm">
              <div className="flex items-center gap-2">
                <Badge variant="outline">{node.singboxLogMode}</Badge>
                <span>{t('admin:nodes.diagLogActive')}</span>
              </div>
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock3 className="h-3 w-3" />
                {t('admin:nodes.diagLogRemaining', { time: formatDiagnosticRemaining(node.singboxLogModeUntil, now) })}
              </p>
            </div>
            <Button variant="outline" size="sm" disabled={disabling} onClick={onDisable}>
              {t('admin:nodes.stopDiag')}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0 flex-1 space-y-2">
              <p className="text-sm text-muted-foreground">{t('admin:nodes.diagLogDesc')}</p>
              {!node.supportsSingboxLogCapture && <p className="text-xs text-muted-foreground">{t('admin:nodes.diagUnsupported')}</p>}
              {node.status !== 'ONLINE' && <p className="text-xs text-muted-foreground">{t('admin:nodes.diagOffline')}</p>}
              <Select value={level} onValueChange={(value) => setLevel(value as 'INFO' | 'DEBUG')}>
                <SelectTrigger className="w-full sm:w-40">
                  <SelectValue placeholder={t('admin:nodes.diagLevel')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="INFO">{t('admin:nodes.diagLevelInfo')}</SelectItem>
                  <SelectItem value="DEBUG">{t('admin:nodes.diagLevelDebug')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" disabled={!available || enabling}>
                  {enabling ? t('admin:nodes.enablingDiag') : t('admin:nodes.enableDiag')}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t('admin:nodes.diagConfirmTitle', { level })}</AlertDialogTitle>
                  <AlertDialogDescription>{t('admin:nodes.diagConfirmDesc')}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t('common:actions.cancel')}</AlertDialogCancel>
                  <AlertDialogAction onClick={() => onEnable(level)}>{t('admin:nodes.confirmEnable')}</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function NodeDetailPage() {
  const { t } = useTranslation(['admin', 'common']);
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { resolvedTheme } = useTheme();
  const { data: node, isPending, isError } = useAdminNodeDetail(id);
  const { data: binaryInfo } = useAdminBinaryInfo();
  const { data: binaryResources } = useAdminBinaryResources({ status: 'ACTIVE', pageSize: 100 });
  const { updateNode, deleteNode, reloadNode, upgradeNode, probeNode, restartAgent, importBinary, waitForTask, enableLogDiagnostics, disableLogDiagnostics } = useNodeMutations();
  const [upgradeOpen, setUpgradeOpen] = React.useState(false);
  const [probeOpen, setProbeOpen] = React.useState(false);
  const [installOpen, setInstallOpen] = React.useState(false);
  const form = useForm<NodeDetailFormValues>({
    resolver: zodResolver(nodeDetailSchema),
    defaultValues: { name: '', reachability: 'PUBLIC', serverHost: '', configOverride: '' }
  });

  useFormResetOnKey({
    resetKey: node?.id ?? null,
    reset: () => form.reset({
      name: node?.name ?? '',
      reachability: node?.reachability ?? 'PUBLIC',
      serverHost: node?.serverHost ?? '',
      configOverride: node?.configOverride ?? ''
    })
  });

  const override = form.watch('configOverride');

  if (isPending) return <PageContainer><Skeleton className="h-8 w-48" /><Skeleton className="h-12 w-full" /><Skeleton className="h-72 w-full" /></PageContainer>;
  if (isError || !node) return (
    <PageContainer>
      <EmptyState title={t('admin:nodes.nodeNotFound')} description={t('admin:nodes.nodeNotFoundDesc')} />
      <Button variant="outline" size="sm" asChild>
        <Link to="/admin/nodes">{t('admin:nodes.backToNodes')}</Link>
      </Button>
    </PageContainer>
  );

  const statusLabel = node.status === 'ONLINE' ? (node.communicationMode === 'HTTP' ? t('admin:nodes.modeHttp') : t('admin:nodes.modeWs')) : node.status === 'DISABLED' ? t('admin:nodes.statusDisabled') : t('admin:nodes.statusOffline');
  const saveBasic = async () => {
    if (!(await form.trigger(['name', 'reachability', 'serverHost']))) return;
    const values = form.getValues();
    updateNode.mutate({
      id: node.id,
      name: values.name,
      reachability: values.reachability,
      serverHost: values.reachability === 'NAT' && !values.serverHost ? '127.0.0.1' : values.serverHost
    });
  };
  const saveOverride = () => {
    const value = form.getValues('configOverride').trim();
    if (value) {
      try { const parsed: unknown = JSON.parse(value); if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(); }
      catch { toast.error(t('admin:nodes.invalidJson')); return; }
    }
    updateNode.mutate({ id: node.id, configOverride: value || null });
  };
  const remove = () => deleteNode.mutate(node.id, { onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['admin', 'nodes'] }); navigate('/admin/nodes'); } });
  const wait = (taskId: string, label: string) => { void waitForTask({ nodeId: node.id, taskId, label }); };

  return (
    <PageContainer>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <Button variant="ghost" size="icon" asChild aria-label={t('common:actions.back')}>
            <Link to="/admin/nodes"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight">{node.name}</h1>
            <p className="truncate text-sm text-muted-foreground">{node.serverHost}</p>
          </div>
          <Badge variant={node.status === 'ONLINE' ? 'default' : 'secondary'}>{statusLabel}</Badge>
          <Badge variant={node.reachability === 'NAT' ? 'secondary' : 'outline'}>
            {node.reachability === 'NAT' ? t('admin:nodes.natTag') : t('admin:nodes.publicTag')}
          </Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to={`/admin/logs?nodeId=${node.id}&live=true`}><FileText />{t('admin:nodes.liveLogs')}</Link>
          </Button>
          <Button variant="outline" size="sm" disabled={reloadNode.isPending} onClick={() => reloadNode.mutate(node.id)}>
            <RefreshCw />{t('admin:nodes.restartKernel')}
          </Button>
          <Button variant="outline" size="sm" disabled={restartAgent.isPending} onClick={() => restartAgent.mutate(node.id, { onSuccess: (data) => data.requested && wait(data.taskId, t('admin:nodes.restartAgent')) })}>
            <RotateCcw />{t('admin:nodes.restartAgent')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setProbeOpen(true)}>
            <Network />{t('admin:nodes.probe')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setUpgradeOpen(true)}>
            <Wrench />{t('admin:nodes.upgradeCenter')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setInstallOpen(true)}>
            <Server />{t('admin:nodes.installCommands')}
          </Button>
        </div>
      </div>
      {node.configError && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          <span className="font-medium">{t('admin:nodes.recentKernelError')}</span>
          {node.configError}
        </div>
      )}
      <SingboxDiagnosticsCard node={node} enabling={enableLogDiagnostics.isPending} disabling={disableLogDiagnostics.isPending} onEnable={(level) => enableLogDiagnostics.mutate({ id: node.id, level })} onDisable={() => disableLogDiagnostics.mutate(node.id)} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card><CardContent className="pt-5"><p className="text-xs text-muted-foreground">{t('admin:nodes.statLines')}</p><p className="mt-1 text-2xl font-semibold">{node.lines.length}</p></CardContent></Card>
        <Card><CardContent className="pt-5"><p className="text-xs text-muted-foreground">{t('admin:nodes.statPorts')}</p><p className="mt-1 text-2xl font-semibold">{node.servicePorts.length}</p></CardContent></Card>
        <Card><CardContent className="pt-5"><p className="text-xs text-muted-foreground">{t('admin:nodes.statCpu')}</p><p className="mt-1 text-2xl font-semibold">{node.status === 'ONLINE' && node.cpuUsage != null ? `${node.cpuUsage.toFixed(1)}%` : '—'}</p></CardContent></Card>
        <Card><CardContent className="pt-5"><p className="text-xs text-muted-foreground">{t('admin:nodes.statMem')}</p><p className="mt-1 text-2xl font-semibold">{node.status === 'ONLINE' && node.memoryUsage != null ? `${node.memoryUsage.toFixed(1)}%` : '—'}</p></CardContent></Card>
      </div>
      {node.status === 'ONLINE' && !node.supportsAgentLogRotation ? (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
          {t('admin:nodes.logRotationNotice')}
        </div>
      ) : null}
      <Tabs defaultValue="lines">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="lines">{t('admin:nodes.tabLines')}</TabsTrigger>
          <TabsTrigger value="basic">{t('admin:nodes.tabBasic')}</TabsTrigger>
          <TabsTrigger value="advanced">{t('admin:nodes.tabAdvanced')}</TabsTrigger>
        </TabsList>
        <TabsContent value="lines" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <GitBranch className="h-4 w-4" />
                {t('admin:nodes.currentLines', { count: node.lines.length })}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {node.lines.length ? (
                <Table className="min-w-[720px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('admin:lines.colLine')}</TableHead>
                      <TableHead>{t('admin:lines.protocol')}</TableHead>
                      <TableHead>{t('admin:lines.type')}</TableHead>
                      <TableHead>{t('admin:lines.entryPort')}</TableHead>
                      <TableHead>{t('admin:lines.landingPort')}</TableHead>
                      <TableHead>{t('admin:lines.status')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {node.lines.map((line) => (
                      <TableRow key={line.id}>
                        <TableCell className="font-medium">{line.name}</TableCell>
                        <TableCell><Badge variant="outline">{line.protocolType}</Badge></TableCell>
                        <TableCell>
                          {line.role === 'DIRECT' ? t('admin:nodes.roleDirect') : line.role === 'ENTRY' ? t('admin:nodes.roleTransit') : t('admin:nodes.roleLanding')}
                          {line.type === 'RELAY' && <span className="ml-1 text-xs text-muted-foreground">· {line.relayMode === 'BLIND_FORWARD' ? t('admin:lines.relayBlindForward') : line.relayMode === 'TARGET_LINE' ? t('admin:lines.relayTargetBridge') : t('admin:lines.relayProtocolProxy')}</span>}
                        </TableCell>
                        <TableCell className="tabular-nums">{line.entryNodeId === node.id ? line.entryPort : '—'}</TableCell>
                        <TableCell className="tabular-nums">{line.landingNodeId === node.id ? (line.landingPort ?? '—') : '—'}</TableCell>
                        <TableCell><Badge variant={line.status === 'ACTIVE' ? 'default' : 'secondary'}>{line.status === 'ACTIVE' ? t('admin:lines.statusActive') : t('admin:lines.statusDisabled')}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <EmptyState title={t('admin:lines.emptyLines')} description={t('admin:nodes.emptyFilteredDesc')} className="border-0" />
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">{t('admin:nodes.derivedPorts')}</CardTitle></CardHeader>
            <CardContent className="grid gap-2 sm:grid-cols-2">
              {node.servicePorts.length ? node.servicePorts.map((port) => (
                <div key={`${port.lineId}-${port.role}`} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                  <span className="truncate">{port.lineName}</span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {port.port} · {port.role === 'DIRECT' ? t('admin:nodes.roleDirect') : port.role === 'TRANSIT' ? t('admin:nodes.roleTransit') : t('admin:nodes.roleLanding')}
                  </span>
                </div>
              )) : <p className="text-sm text-muted-foreground">{t('admin:nodes.noDerivedPorts')}</p>}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="basic" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">{t('admin:nodes.basicInfo')}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <Form {...form}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField control={form.control} name="name" render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('admin:nodes.name')}</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="reachability" render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('admin:nodes.reachability')}</FormLabel>
                      <Select value={field.value} onValueChange={(val: 'PUBLIC' | 'NAT') => { field.onChange(val); if (val === 'NAT' && !form.getValues('serverHost')) { form.setValue('serverHost', '127.0.0.1'); } }}>
                        <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="PUBLIC">{t('admin:nodes.reachabilityPublic')}</SelectItem>
                          <SelectItem value="NAT">{t('admin:nodes.reachabilityNat')}</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="serverHost" render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel>{t('admin:nodes.serverHost')}</FormLabel>
                      <FormControl>
                        <Input placeholder={form.watch('reachability') === 'NAT' ? '127.0.0.1' : '198.51.100.1'} {...field} />
                      </FormControl>
                      <FormDescription>
                        {form.watch('reachability') === 'NAT' ? t('admin:nodes.serverHostNatDesc') : t('admin:nodes.serverHostPublicDesc')}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                <Button size="sm" disabled={updateNode.isPending} onClick={saveBasic}>{t('admin:nodes.saveBasic')}</Button>
              </Form>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <KeyRound className="h-4 w-4" />
                {t('admin:nodes.agentProfile')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {node.pendingVersionConfirm && (
                <div className="rounded-md border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-600 dark:text-amber-400">
                  {t('admin:nodes.versionMismatchWarning', {
                    time: formatDateTime(node.pendingVersionConfirm.completedAt),
                    current: node.agentVersion || t('admin:nodes.notReported'),
                    expected: node.pendingVersionConfirm.expectedVersion
                  })}
                </div>
              )}
              <p className="text-sm text-muted-foreground">{t('admin:nodes.tokenNotice')}</p>
              {node.isLocal ? (
                <p className="text-sm text-muted-foreground">{t('admin:nodes.localNodeNotice')}</p>
              ) : (
                <RotateTokenDialog node={node} />
              )}
              <div className="grid gap-2 text-sm sm:grid-cols-2">
                <span className="text-muted-foreground">{t('admin:nodes.commMode')}<strong className="font-medium text-foreground">{node.communicationMode === 'HTTP' ? t('admin:nodes.commModeHttp') : t('admin:nodes.commModeWs')}</strong></span>
                <span className="text-muted-foreground">{t('admin:nodes.pollInterval')}<strong className="font-medium text-foreground">{node.pollIntervalSecs}s</strong></span>
                <span className="text-muted-foreground">{t('admin:nodes.version')}: <strong className="font-medium text-foreground">{node.agentVersion || t('admin:nodes.notReported')}</strong></span>
                <span className="text-muted-foreground">{t('admin:nodes.osArch')}: <strong className="font-medium text-foreground">{node.osArch || t('admin:nodes.notReported')}</strong></span>
                <span className="text-muted-foreground">{t('admin:nodes.kernelVersion')}: <strong className="font-medium text-foreground">{node.kernelVersion || t('admin:nodes.notReported')}</strong></span>
                <span className="text-muted-foreground">{t('admin:nodes.lastHeartbeat')}: <strong className="font-medium text-foreground">{node.lastSeenAt ? formatDateTime(node.lastSeenAt) : t('admin:nodes.notReported')}</strong></span>
              </div>
              <p className="text-sm text-muted-foreground">
                {t('admin:nodes.kernelRunningStatus')}{node.status !== 'ONLINE' ? t('admin:nodes.unknown') : node.kernelRunning == null ? t('admin:nodes.unknown') : node.kernelRunning ? t('admin:nodes.kernelRunning') : t('admin:nodes.kernelStopped')}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Cpu className="h-4 w-4" />{t('admin:nodes.realtimeTelemetry')}</CardTitle></CardHeader>
            <CardContent className="grid gap-4 text-sm text-muted-foreground sm:grid-cols-2 lg:grid-cols-5">
              <span>{t('admin:nodes.statCpu')} {node.status === 'ONLINE' && node.cpuUsage != null ? `${node.cpuUsage.toFixed(1)}%` : '—'}</span>
              <span>{t('admin:nodes.statMem')} {node.status === 'ONLINE' && node.memoryUsage != null ? `${node.memoryUsage.toFixed(1)}%` : '—'}</span>
              <span>{t('admin:nodes.statUp')}{nodeRate(node.status, node.uploadRate)}</span>
              <span>{t('admin:nodes.statDown')}{nodeRate(node.status, node.downloadRate)}</span>
              <span>{t('admin:nodes.statTotal')}{nodeTotalRate(node)}</span>
              <p className="sm:col-span-2 lg:col-span-5">{t('admin:nodes.telemetryNote')}</p>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="advanced" className="space-y-4">
          <Card><CardHeader><CardTitle className="text-base">{t('admin:nodes.probeSnapshot')}</CardTitle></CardHeader><CardContent><ProbeSnapshotCard snapshot={node.lastProbeResult} /></CardContent></Card>
          <NodeDeploymentHistory nodeId={node.id} />
          <Card><CardHeader><CardTitle className="text-base">{t('admin:nodes.configPreview')}</CardTitle></CardHeader><CardContent><GeneratedConfigPreview node={node} /></CardContent></Card>
          <Card>
            <CardHeader><CardTitle className="text-base">{t('admin:nodes.configOverride')}</CardTitle></CardHeader>
            <CardContent className="min-w-0 space-y-3">
              <CodeMirror value={override} height="360px" theme={resolvedTheme === 'dark' ? 'dark' : 'light'} extensions={[json()]} onChange={(value) => form.setValue('configOverride', value, { shouldDirty: true })} className="min-w-0 overflow-hidden rounded-md border" />
              <div className="flex flex-wrap gap-2">
                <Button size="sm" disabled={updateNode.isPending} onClick={saveOverride}>{t('admin:nodes.saveOverride')}</Button>
                <Button size="sm" variant="outline" disabled={!override} onClick={() => form.setValue('configOverride', '', { shouldDirty: true })}>{t('admin:nodes.clear')}</Button>
              </div>
              <Separator />
              <p className="text-xs text-muted-foreground">{t('admin:nodes.configOverrideDesc')}</p>
            </CardContent>
          </Card>
          {node.configError && (
            <Card>
              <CardHeader><CardTitle className="text-base text-destructive">{t('admin:nodes.recentKernelError')}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <pre className="max-h-64 overflow-auto rounded-md border border-destructive/30 bg-destructive/5 p-3 font-mono text-xs leading-relaxed text-destructive">{node.configError}</pre>
                <CopyButton value={node.configError} />
              </CardContent>
            </Card>
          )}
          {node.isLocal ? (
            <Card className="border-muted bg-muted/20">
              <CardHeader><CardTitle className="text-base">{t('admin:nodes.systemNode')}</CardTitle></CardHeader>
              <CardContent><p className="text-sm text-muted-foreground">{t('admin:nodes.systemNodeDesc')}</p></CardContent>
            </Card>
          ) : (
            <Card className="border-destructive/40 bg-destructive/5">
              <CardHeader><CardTitle className="flex items-center gap-2 text-base text-destructive"><Trash2 className="h-4 w-4" />{t('admin:nodes.dangerZone')}</CardTitle></CardHeader>
              <CardContent className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
                <p className="text-xs text-muted-foreground">{t('admin:nodes.dangerDesc')}</p>
                <AlertDialog>
                  <AlertDialogTrigger asChild><Button variant="destructive" size="sm" className="w-full sm:w-auto">{t('admin:nodes.deleteNode')}</Button></AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t('admin:nodes.confirmDelete')}</AlertDialogTitle>
                      <AlertDialogDescription>{t('admin:nodes.confirmDeleteDesc')}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t('common:actions.cancel')}</AlertDialogCancel>
                      <AlertDialogAction variant="destructive" onClick={remove}>{t('common:actions.confirm')}</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
      <InstallCommandDialog open={installOpen} onOpenChange={setInstallOpen} node={node} />
      <UpgradeNodeDialog open={upgradeOpen} onOpenChange={setUpgradeOpen} pending={upgradeNode.isPending} importing={importBinary.isPending} node={node} binaryInfo={binaryInfo} resources={binaryResources?.data} onSubmit={(values) => upgradeNode.mutate({ id: node.id, ...values }, { onSuccess: (data: { taskId: string; requested: boolean }) => data.requested && wait(data.taskId, t('admin:nodes.upgradeTitle')) })} onImport={(values) => importBinary.mutate(values)} />
      <ProbeNodeDialog open={probeOpen} onOpenChange={setProbeOpen} pending={probeNode.isPending} snapshot={node.lastProbeResult} onSubmit={(values) => probeNode.mutate({ id: node.id, ...values }, { onSuccess: (data: { taskId: string; requested: boolean }) => data.requested && wait(data.taskId, t('admin:nodes.probeTitle')) })} />
    </PageContainer>
  );
}
