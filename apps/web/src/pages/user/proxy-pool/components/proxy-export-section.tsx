import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ClipboardList,
  Copy,
  Download,
  Globe,
  KeyRound,
  RefreshCw,
  Server,
  Terminal,
  Wand2
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmptyState } from '@/components/shared/empty-state';
import { usePublicSettings } from '@/lib/public-settings';
import { cn } from '@/lib/utils';
import { buildProxyCodeSnippets } from '../proxy-snippets';
import {
  type ProxyKey,
  type ProxyPoolEndpoint,
  type ProxyPoolExportFormat,
  type ProxyPoolExportProtocol,
  useProxyPoolExport,
  useProxyPoolMutations
} from '../use-proxy-pool';

interface ProxyExportSectionProps {
  keys: ProxyKey[];
  endpoints: ProxyPoolEndpoint[];
  endpointsPending: boolean;
  onOpenCreateKey?: () => void;
}

const FORMAT_LABELS: Record<ProxyPoolExportFormat, string> = {
  text: 'IP:Port:User:Pass',
  uri: 'URI 列表',
  json: 'JSON 对象'
};

export function ProxyExportSection({
  keys,
  endpoints,
  endpointsPending,
  onOpenCreateKey
}: ProxyExportSectionProps) {
  const publicSettings = usePublicSettings();
  const { rotateToken } = useProxyPoolMutations();
  const [keyId, setKeyId] = useState<string>('');
  const [selectedLineIds, setSelectedLineIds] = useState<string[]>([]);
  const [protocol, setProtocol] = useState<ProxyPoolExportProtocol>('socks5');
  const [format, setFormat] = useState<ProxyPoolExportFormat>('text');
  const [viewMode, setViewMode] = useState<'export' | 'code'>('export');
  const [snippetTab, setSnippetTab] = useState('python-requests');
  const [copied, setCopied] = useState(false);

  const activeKeys = useMemo(() => keys.filter((item) => item.isActive), [keys]);

  // 默认选中第一条启用凭据与全部可用端点
  useEffect(() => {
    if (!activeKeys.length) {
      setKeyId('');
      return;
    }
    setKeyId((current) => (activeKeys.some((item) => item.id === current) ? current : activeKeys[0].id));
  }, [activeKeys]);

  // 仅当可用端点集合本身发生变化时重置选择，避免定时刷新清空用户的多选结果
  const endpointKey = endpoints.map((endpoint) => endpoint.lineId).join(',');
  const appliedEndpointKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!endpointKey || appliedEndpointKeyRef.current === endpointKey) return;
    appliedEndpointKeyRef.current = endpointKey;
    setSelectedLineIds(endpointKey.split(','));
  }, [endpointKey]);

  const currentKey = activeKeys.find((item) => item.id === keyId) ?? null;
  const exportQuery = useProxyPoolExport({
    keyId,
    format,
    protocol,
    lineIds: selectedLineIds,
    enabled: Boolean(keyId) && selectedLineIds.length > 0
  });

  const previewEndpoint = endpoints.find((endpoint) => selectedLineIds.includes(endpoint.lineId)) ?? null;
  const snippets = useMemo(() => {
    if (!currentKey || !previewEndpoint) return [];
    return buildProxyCodeSnippets({
      protocol,
      host: previewEndpoint.host,
      port: previewEndpoint.port,
      username: currentKey.username,
      password: currentKey.password,
      tls: previewEndpoint.tls,
      serverName: previewEndpoint.serverName
    });
  }, [currentKey, previewEndpoint, protocol]);

  const currentSnippet = snippets.find((s) => s.id === snippetTab) ?? snippets[0];

  const automationBase = (
    publicSettings.data?.publicBaseUrl ||
    publicSettings.data?.subscriptionBaseUrl ||
    window.location.origin
  ).replace(/\/+$/, '');
  const automationUrl = currentKey
    ? `${automationBase}/api/v1/user/proxy-pool/export?token=${encodeURIComponent(currentKey.exportToken)}&format=text&protocol=${protocol}`
    : '';

  const toggleLine = (lineId: string, checked: boolean) => {
    setSelectedLineIds((current) =>
      checked ? [...new Set([...current, lineId])] : current.filter((id) => id !== lineId)
    );
  };

  const selectAllLines = () => setSelectedLineIds(endpoints.map((e) => e.lineId));
  const clearAllLines = () => setSelectedLineIds([]);

  const exportContent = !keyId
    ? '请先创建并启用一条直连代理凭据'
    : !selectedLineIds.length
      ? '请至少选择一个节点端点'
      : exportQuery.isPending
        ? '正在生成代理列表…'
        : exportQuery.isError
          ? '导出失败，请检查凭据与节点可用性'
          : (exportQuery.data ?? '');

  const copyExportContent = async () => {
    const textToCopy = viewMode === 'export' ? exportContent : currentSnippet?.code || '';
    if (!textToCopy) return;
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      toast.success(viewMode === 'export' ? '代理列表已复制到剪贴板' : '代码片段已复制到剪贴板');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('复制失败，请手动选择复制');
    }
  };

  const downloadTxt = () => {
    const content = exportQuery.data ?? '';
    if (!content) {
      toast.error('暂无生成的代理列表可下载');
      return;
    }
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `riricloud-proxies-${protocol}-${format}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('已下载代理列表文件');
  };

  if (!keys.length) {
    return (
      <Card className="border-dashed bg-muted/10">
        <CardContent className="py-12">
          <EmptyState
            title="暂无可导出的凭据"
            description="直连代理池需要先创建至少一条 Proxy Key 凭据方可提取代理列表与生成代码。"
            action={
              onOpenCreateKey ? (
                <Button size="sm" onClick={onOpenCreateKey}>
                  新建第一条凭据
                </Button>
              ) : undefined
            }
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* 提取配置与节点选择卡片 */}
      <Card className="border-border/80 bg-card/60">
        <CardHeader className="p-4 pb-3">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Wand2 className="size-4 text-sky-500" />
              提取参数配置
            </CardTitle>
            <CardDescription className="text-xs">
              选择使用的凭据、协议与导出格式，即时生成直连代理
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-4 pt-0 space-y-4">
          {/* 三联参数配置条 */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {/* 1. 凭据选择 */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <KeyRound className="size-3.5" />
                使用凭据
              </label>
              <Select value={keyId} onValueChange={setKeyId}>
                <SelectTrigger className="h-9 text-xs" aria-label="选择导出凭据">
                  <SelectValue placeholder="选择凭据" />
                </SelectTrigger>
                <SelectContent>
                  {activeKeys.map((item) => (
                    <SelectItem key={item.id} value={item.id} className="text-xs">
                      {item.name} ({item.username})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 2. 导出协议 */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">导出协议</label>
              <div className="grid grid-cols-2 gap-1 rounded-md border bg-muted/40 p-0.5">
                <Button
                  type="button"
                  variant={protocol === 'socks5' ? 'default' : 'ghost'}
                  size="sm"
                  className="h-7 text-xs font-medium"
                  onClick={() => setProtocol('socks5')}
                >
                  SOCKS5
                </Button>
                <Button
                  type="button"
                  variant={protocol === 'http' ? 'default' : 'ghost'}
                  size="sm"
                  className="h-7 text-xs font-medium"
                  onClick={() => setProtocol('http')}
                >
                  {previewEndpoint?.tls ? 'HTTP (HTTPS)' : 'HTTP'}
                </Button>
              </div>
            </div>

            {/* 3. 导出格式 */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">导出格式</label>
              <div className="grid grid-cols-3 gap-1 rounded-md border bg-muted/40 p-0.5">
                {(Object.keys(FORMAT_LABELS) as ProxyPoolExportFormat[]).map((item) => (
                  <Button
                    key={item}
                    type="button"
                    variant={format === item ? 'default' : 'ghost'}
                    size="sm"
                    className="h-7 px-1.5 text-xs font-medium truncate"
                    onClick={() => setFormat(item)}
                  >
                    {item === 'text' ? 'TXT' : item === 'uri' ? 'URI' : 'JSON'}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          {/* 节点端点芯片选择区 */}
          <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                <Globe className="size-3.5 text-sky-500" />
                选择出网节点（已选 {selectedLineIds.length}/{endpoints.length}）
              </div>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                  onClick={selectAllLines}
                >
                  全选
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                  onClick={clearAllLines}
                >
                  清空
                </Button>
              </div>
            </div>

            {endpointsPending ? (
              <p className="py-4 text-center text-xs text-muted-foreground animate-pulse">正在加载节点…</p>
            ) : endpoints.length ? (
              <div className="flex flex-wrap gap-2 pt-0.5">
                {endpoints.map((endpoint) => {
                  const isSelected = selectedLineIds.includes(endpoint.lineId);
                  return (
                    <Button
                      key={endpoint.lineId}
                      type="button"
                      variant={isSelected ? 'secondary' : 'outline'}
                      size="sm"
                      className={cn(
                        'h-auto py-1.5 px-2.5 justify-start gap-2 text-left font-normal transition-all rounded-md',
                        isSelected
                          ? 'border-primary/50 bg-primary/10 text-foreground ring-1 ring-primary/20 shadow-2xs'
                          : 'border-border/60 bg-card/60 text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                      )}
                      onClick={() => toggleLine(endpoint.lineId, !isSelected)}
                    >
                      <span
                        className={cn(
                          'size-2 rounded-full shrink-0',
                          endpoint.online ? 'bg-emerald-500' : 'bg-muted-foreground/40'
                        )}
                      />
                      <span className="font-semibold text-xs text-foreground">{endpoint.name}</span>
                      {endpoint.region ? (
                        <span className="text-[10px] px-1 rounded bg-muted text-muted-foreground">
                          {endpoint.region}
                        </span>
                      ) : null}
                      {endpoint.tls ? (
                        <span className="text-[10px] px-1 rounded bg-sky-500/10 text-sky-600 dark:text-sky-400 font-medium">
                          HTTPS
                        </span>
                      ) : null}
                      <span className="font-mono text-[11px] text-muted-foreground/80">
                        {endpoint.host}:{endpoint.port}
                      </span>
                      {endpoint.latencyMs != null ? (
                        <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono">
                          {endpoint.latencyMs}ms
                        </span>
                      ) : null}
                      {isSelected && <Check className="size-3 text-primary shrink-0 ml-0.5" />}
                    </Button>
                  );
                })}
              </div>
            ) : (
              <p className="py-3 text-center text-xs text-muted-foreground">
                管理员尚未配置 Mixed 直连线路，暂无可用的直连代理节点。
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 终端风格一体化结果工作台 */}
      <div className="overflow-hidden rounded-xl border border-border/80 bg-zinc-950 text-zinc-100 shadow-md">
        {/* macOS 终端控制条 */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/80 bg-zinc-900/90 px-4 py-2.5">
          <div className="flex items-center gap-3">
            {/* 经典三色红黄绿圆点 */}
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="size-2.5 rounded-full bg-rose-500/80" />
              <span className="size-2.5 rounded-full bg-amber-500/80" />
              <span className="size-2.5 rounded-full bg-emerald-500/80" />
            </div>

            {/* 终端子功能切换 Tab */}
            <div className="flex items-center gap-1 rounded-md bg-zinc-800/80 p-0.5 text-xs">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={cn(
                  'h-6 px-2.5 text-xs text-zinc-400 hover:text-zinc-100',
                  viewMode === 'export' && 'bg-zinc-700 text-zinc-100 font-medium shadow-2xs'
                )}
                onClick={() => setViewMode('export')}
              >
                <ClipboardList className="size-3 mr-1.5" />
                提取结果 ({FORMAT_LABELS[format]})
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={cn(
                  'h-6 px-2.5 text-xs text-zinc-400 hover:text-zinc-100',
                  viewMode === 'code' && 'bg-zinc-700 text-zinc-100 font-medium shadow-2xs'
                )}
                onClick={() => setViewMode('code')}
              >
                <Terminal className="size-3 mr-1.5" />
                自动化代码
              </Button>
            </div>
          </div>

          {/* 右侧操作按钮组 */}
          <div className="flex items-center gap-1.5 shrink-0">
            {viewMode === 'export' ? (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 px-2.5 text-xs text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
                  onClick={downloadTxt}
                  disabled={!exportQuery.data}
                >
                  <Download className="size-3.5" />
                  下载 .txt
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-7 gap-1 px-2.5 text-xs bg-zinc-800 text-zinc-100 hover:bg-zinc-700"
                  onClick={copyExportContent}
                  disabled={!exportQuery.data}
                >
                  {copied ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
                  {copied ? '已复制' : '复制结果'}
                </Button>
              </>
            ) : (
              <>
                {/* 多语言代码切换 */}
                <div className="flex items-center gap-1 pr-1">
                  {snippets.map((snippet) => (
                    <Button
                      key={snippet.id}
                      type="button"
                      variant="ghost"
                      size="sm"
                      className={cn(
                        'h-6 px-2 text-[11px] text-zinc-400 hover:text-zinc-200',
                        snippetTab === snippet.id && 'bg-zinc-800 text-zinc-100 font-medium'
                      )}
                      onClick={() => setSnippetTab(snippet.id)}
                    >
                      {snippet.label.split(' ')[0]}
                    </Button>
                  ))}
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-7 gap-1 px-2.5 text-xs bg-zinc-800 text-zinc-100 hover:bg-zinc-700"
                  onClick={copyExportContent}
                  disabled={!currentSnippet}
                >
                  {copied ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
                  {copied ? '已复制' : '复制代码'}
                </Button>
              </>
            )}
          </div>
        </div>

        {/* 终端内容视窗 */}
        <div className="max-h-80 min-h-36 overflow-auto p-4 font-mono text-xs leading-relaxed select-all">
          {viewMode === 'export' ? (
            <pre className="whitespace-pre-wrap break-all text-zinc-200">{exportContent}</pre>
          ) : (
            <pre className="whitespace-pre-wrap text-emerald-400 dark:text-emerald-300">
              {currentSnippet?.code || '请先选择至少一个节点端点。'}
            </pre>
          )}
        </div>
      </div>

      {/* 免登录自动化 API 提取卡片 */}
      <div className="flex flex-col gap-2 rounded-lg border bg-muted/20 p-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-0.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold">
            <Server className="size-3.5 text-sky-500" />
            自动化动态拉取 API（第三方爬虫框架 / 指纹浏览器）
          </div>
          <p className="text-[11px] text-muted-foreground">
            脚本携带 Token 可免 Cookie 直接拉取最新直连代理列表，支持定时轮询与节点热更新。
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {currentKey ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              disabled={rotateToken.isPending}
              onClick={() => rotateToken.mutate(currentKey.id)}
            >
              <RefreshCw className="size-3" />
              {rotateToken.isPending ? '轮换中…' : '轮换 Token'}
            </Button>
          ) : null}
          {automationUrl ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-7 gap-1 px-2.5 text-xs font-mono"
              onClick={async () => {
                await navigator.clipboard.writeText(automationUrl);
                toast.success('自动化拉取 API 已复制');
              }}
            >
              <Copy className="size-3" />
              复制 API URL
            </Button>
          ) : null}
        </div>
      </div>

      {/* 指纹浏览器导入提示 */}
      <div className="flex items-start gap-2 rounded-lg border border-dashed bg-muted/10 p-3 text-xs text-muted-foreground">
        <ClipboardList className="mt-0.5 size-3.5 shrink-0 text-sky-500" />
        <p className="leading-relaxed">
          <span className="font-medium text-foreground">指纹浏览器一键导入贴士：</span>
          选择 <Badge variant="secondary" className="mx-0.5 font-mono text-[10px] px-1">TXT</Badge> 格式（
          <code className="font-mono text-foreground font-semibold">IP:Port:User:Pass</code>
          ）后直接点击“复制结果”，可在 AdsPower、Hubstudio、比特指纹浏览器中直接批量粘贴导入。
        </p>
      </div>
    </div>
  );
}

