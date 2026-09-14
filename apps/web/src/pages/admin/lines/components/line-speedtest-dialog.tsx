import * as React from 'react';
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Clock,
  Globe,
  Loader2,
  MinusCircle,
  RefreshCw,
  Server,
  XCircle,
  AlertCircle
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent } from '@/components/ui/card';
import { cn, formatDateTime } from '@/lib/utils';
import { useLineMutations, type AdminLine, type SpeedTestExecutionResult, type SpeedTestStage } from '../use-lines';

export interface LineSpeedtestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  line: AdminLine | null;
}

export function LineSpeedtestDialog({ open, onOpenChange, line }: LineSpeedtestDialogProps) {
  const { speedtest } = useLineMutations();
  const [result, setResult] = React.useState<SpeedTestExecutionResult | null>(null);

  const runTest = React.useCallback(() => {
    if (!line) return;
    speedtest.mutate(line.id, {
      onSuccess: (data) => {
        setResult(data);
      },
      onError: () => {
        // error toast handled in use-lines
      }
    });
  }, [line, speedtest]);

  // 打开弹窗或切换线路时自动触发一次测速
  React.useEffect(() => {
    if (open && line) {
      setResult(null);
      runTest();
    } else {
      setResult(null);
    }
  }, [open, line?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!line) return null;

  const isPending = speedtest.isPending && speedtest.variables === line.id;
  const isRelay = line.type === 'RELAY';
  const entryHost = (line.endpointOverrideEnabled && line.serverHost ? line.serverHost : line.entryNode.serverHost).trim();
  const entryPort = line.endpointOverrideEnabled && line.serverPort ? line.serverPort : line.entryPort;

  const landingHost = isRelay
    ? line.relayMode === 'TARGET_LINE' && line.targetLine
      ? line.targetLine.entryNode.serverHost
      : line.landingNode?.serverHost ?? '—'
    : null;
  const landingPort = isRelay
    ? line.relayMode === 'TARGET_LINE' && line.targetLine
      ? line.targetLine.entryPort
      : line.landingPort ?? '—'
    : null;
  const landingName = isRelay
    ? line.relayMode === 'TARGET_LINE' && line.targetLine
      ? line.targetLine.entryNode.name
      : line.landingNode?.name ?? '—'
    : null;

  const latencyRating = (ms: number | null | undefined) => {
    if (ms == null) return null;
    if (ms < 150) return { label: '延迟极佳', color: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/30' };
    if (ms < 400) return { label: '延迟一般', color: 'text-amber-500 bg-amber-500/10 border-amber-500/30' };
    return { label: '延迟较高', color: 'text-rose-500 bg-rose-500/10 border-rose-500/30' };
  };

  const rating = latencyRating(result?.latencyMs ?? line.lastLatencyMs);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl sm:max-w-2xl">
        <DialogHeader className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle className="text-lg font-semibold flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary shrink-0" />
              <span>链路测试流程</span>
              <span className="text-muted-foreground font-normal">·</span>
              <span className="truncate">{line.name}</span>
            </DialogTitle>
            <Badge variant="outline" className="font-mono text-xs">{line.protocolType}</Badge>
            <Badge variant="secondary" className="text-xs">{line.type === 'DIRECT' ? '直连' : '中继'}</Badge>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            探测由 Master 主控服务器直接发起，模拟真实客户端经节点通道访问公网测试源，诊断链路连通性与分段延时。
          </DialogDescription>
        </DialogHeader>

        {/* 链路流程拓扑示意 */}
        <div className="rounded-lg border bg-muted/30 p-3.5 space-y-2">
          <div className="text-[11px] font-medium text-muted-foreground flex items-center justify-between">
            <span>网络拓扑路径</span>
            <span className="font-mono text-[10px] text-muted-foreground/75">
              目标: {result?.targetUrl || 'http://cp.cloudflare.com/generate_204'}
            </span>
          </div>

          <div className="flex items-center justify-between gap-1 overflow-x-auto py-1">
            {/* 1. Master 主控 */}
            <div className="flex flex-col items-center min-w-24 text-center shrink-0">
              <div className="size-9 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mb-1">
                <Server className="size-4" />
              </div>
              <span className="text-xs font-medium">Master 主控</span>
              <span className="text-[10px] text-muted-foreground">发起端</span>
            </div>

            <div className="flex-1 flex flex-col items-center min-w-8">
              <ArrowRight className="size-3.5 text-muted-foreground/60" />
              <span className="text-[9px] text-muted-foreground">网络拨测</span>
            </div>

            {/* 2. 入口节点 */}
            <div className="flex flex-col items-center min-w-28 text-center shrink-0">
              <div className="size-9 rounded-full bg-secondary border border-border flex items-center justify-center mb-1">
                <Server className="size-4" />
              </div>
              <span className="text-xs font-medium truncate max-w-28" title={line.entryNode.name}>{line.entryNode.name}</span>
              <span className="text-[10px] font-mono text-muted-foreground truncate max-w-28" title={`${entryHost}:${entryPort}`}>
                {entryHost}:{entryPort}
              </span>
            </div>

            {/* 3. 若为中继：落地节点 */}
            {isRelay && (
              <>
                <div className="flex-1 flex flex-col items-center min-w-8">
                  <ArrowRight className="size-3.5 text-muted-foreground/60" />
                  <span className="text-[9px] text-muted-foreground">{line.relayMode === 'BLIND_FORWARD' ? '盲转发' : line.relayMode === 'PROTOCOL_PROXY' ? '协议代理' : '中转桥接'}</span>
                </div>

                <div className="flex flex-col items-center min-w-28 text-center shrink-0">
                  <div className="size-9 rounded-full bg-secondary border border-border flex items-center justify-center mb-1">
                    <Server className="size-4" />
                  </div>
                  <span className="text-xs font-medium truncate max-w-28" title={landingName ?? ''}>{landingName}</span>
                  <span className="text-[10px] font-mono text-muted-foreground truncate max-w-28">
                    {landingHost}:{landingPort}
                  </span>
                </div>
              </>
            )}

            <div className="flex-1 flex flex-col items-center min-w-8">
              <ArrowRight className="size-3.5 text-muted-foreground/60" />
              <span className="text-[9px] text-muted-foreground">代理出站</span>
            </div>

            {/* 4. 测试目标 */}
            <div className="flex flex-col items-center min-w-24 text-center shrink-0">
              <div className="size-9 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400 mb-1">
                <Globe className="size-4" />
              </div>
              <span className="text-xs font-medium">Cloudflare</span>
              <span className="text-[10px] font-mono text-muted-foreground">generate_204</span>
            </div>
          </div>
        </div>

        {/* 综合结果卡片 */}
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border p-3 bg-card">
            <div className="space-y-0.5">
              <div className="text-xs text-muted-foreground">当前测速结果</div>
              <div className="flex items-center gap-2">
                {isPending ? (
                  <div className="flex items-center gap-1.5 text-sm font-medium text-primary">
                    <Loader2 className="size-4 animate-spin" />
                    <span>正在发起链路测试…</span>
                  </div>
                ) : result ? (
                  result.status === 'SUCCESS' ? (
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-2xl font-bold tracking-tight text-foreground">
                        {result.latencyMs ?? '—'} <span className="text-sm font-normal text-muted-foreground">ms</span>
                      </span>
                      {rating && (
                        <Badge variant="outline" className={cn('text-xs', rating.color)}>
                          {rating.label}
                        </Badge>
                      )}
                      <Badge variant="secondary" className="text-xs">
                        {result.mode === 'END_TO_END' ? '端到端 Sing-box 代理' : '入口 TCP 握手延时'}
                      </Badge>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400">
                        {result.status === 'TIMEOUT' ? '测速超时' : '测速失败'}
                      </Badge>
                      <span className="text-xs text-muted-foreground truncate max-w-sm">{result.message}</span>
                    </div>
                  )
                ) : (
                  <span className="text-sm text-muted-foreground">准备测试…</span>
                )}
              </div>
            </div>

            <div className="text-right text-xs text-muted-foreground">
              <div className="flex items-center gap-1 text-[11px] justify-end">
                <Clock className="size-3" />
                <span>{result?.testedAt ? formatDateTime(result.testedAt) : '刚刚'}</span>
              </div>
            </div>
          </div>

          {/* 分阶段流程详情 */}
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground">分段链路执行阶段</div>
            <div className="space-y-1.5">
              {isPending && !result?.stages?.length ? (
                <div className="flex items-center justify-center p-6 border rounded-md text-xs text-muted-foreground gap-2">
                  <Loader2 className="size-4 animate-spin text-primary" />
                  <span>正在执行链路拨测与协议握手…</span>
                </div>
              ) : (
                (result?.stages ?? ([
                  { id: 'master_ready', name: '主控探测引擎', target: 'Master 服务端', status: 'SUCCESS', message: '等待初始化' },
                  { id: 'entry_handshake', name: '入口网络联通', target: `${entryHost}:${entryPort}`, status: 'SUCCESS', message: '等待探测' },
                  ...(isRelay ? [{ id: 'relay_transit', name: '中继链路转发', target: `${landingHost}:${landingPort}`, status: 'SUCCESS', message: '等待验证' }] : []),
                  { id: 'target_http', name: '端到端请求', target: 'http://cp.cloudflare.com/generate_204', status: 'SUCCESS', message: '等待请求' }
                ] as SpeedTestStage[])).map((stage: SpeedTestStage, idx: number) => (
                  <Card key={`${stage.id}-${idx}`} className="shadow-none border bg-card/50">
                    <CardContent className="p-2.5 flex items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-2.5 min-w-0">
                        {isPending ? (
                          <Loader2 className="size-4 animate-spin text-primary shrink-0" />
                        ) : stage.status === 'SUCCESS' ? (
                          <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />
                        ) : stage.status === 'SKIPPED' ? (
                          <MinusCircle className="size-4 text-muted-foreground/60 shrink-0" />
                        ) : (
                          <XCircle className="size-4 text-rose-500 shrink-0" />
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-foreground">{stage.name}</span>
                            <span className="font-mono text-[10px] text-muted-foreground truncate max-w-44" title={stage.target}>
                              {stage.target}
                            </span>
                          </div>
                          <div className="text-[11px] text-muted-foreground truncate max-w-md">
                            {stage.message || '—'}
                          </div>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        {stage.latencyMs != null ? (
                          <span className="font-mono text-xs font-semibold text-foreground">
                            {stage.latencyMs} ms
                          </span>
                        ) : stage.status === 'SKIPPED' ? (
                          <span className="text-[10px] text-muted-foreground">跳过</span>
                        ) : stage.status === 'FAILED' ? (
                          <span className="text-[10px] text-rose-500 font-medium">异常</span>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">—</span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </div>

          {/* 异常诊断提示 */}
          {result && result.status !== 'SUCCESS' && (
            <div className="rounded-md border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-600 dark:text-rose-400 space-y-1">
              <div className="font-semibold flex items-center gap-1.5">
                <AlertCircle className="size-4 shrink-0" />
                <span>排查与诊断指引</span>
              </div>
              <ul className="list-disc list-inside space-y-0.5 text-[11px] opacity-90">
                <li>请核查入口节点防火墙及安全组是否放行监听端口 <code className="font-mono font-semibold">{entryPort}</code>。</li>
                {isRelay && <li>中继线路请检查入口与落地节点的联通状态（若为 NAT 落地，请确认反向隧道服务是否在线）。</li>}
                <li>若为纯 UDP 协议（Hysteria 2 / TUIC），请确认云厂商安全组未屏蔽 UDP 流量或遭遇端口限速。</li>
                <li>若入口为 Master 本机节点，请检查宿主机 NAT 回环及本地回环策略。</li>
              </ul>
            </div>
          )}
        </div>

        <Separator />

        <DialogFooter className="flex items-center justify-between sm:justify-between w-full">
          <div className="text-[11px] text-muted-foreground">
            {result?.mode === 'TCP_HANDSHAKE' && '提示：当前测得为入口 TCP 往返延时，非端到端代理延时。'}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={isPending}
              onClick={runTest}
              className="gap-1.5"
            >
              <RefreshCw className={cn('size-3.5', isPending && 'animate-spin')} />
              <span>重新测速</span>
            </Button>
            <Button size="sm" onClick={() => onOpenChange(false)}>
              关闭
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
