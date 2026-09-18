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
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmptyState } from '@/components/shared/empty-state';
import { usePublicSettings } from '@/lib/public-settings';
import { cn } from '@/lib/utils';
import { buildMultiProxyCodeSnippets, buildProxyCodeSnippets } from '../proxy-snippets';
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
  uri: 'URI',
  json: 'JSON'
};

export function ProxyExportSection({
  keys,
  endpoints,
  endpointsPending,
  onOpenCreateKey
}: ProxyExportSectionProps) {
  const { t } = useTranslation(['user', 'common']);
  const publicSettings = usePublicSettings();
  const { rotateToken } = useProxyPoolMutations();
  const [keyId, setKeyId] = useState<string>('');
  const [selectedLineIds, setSelectedLineIds] = useState<string[]>([]);
  const [protocol, setProtocol] = useState<ProxyPoolExportProtocol>('socks5');
  const [format, setFormat] = useState<ProxyPoolExportFormat>('text');
  const [viewMode, setViewMode] = useState<'export' | 'code'>('export');
  const [snippetTab, setSnippetTab] = useState('python-requests');
  const [selectedNodeView, setSelectedNodeView] = useState<string>('all');
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

  const selectedEndpoints = useMemo(() => {
    return endpoints.filter((endpoint) => selectedLineIds.includes(endpoint.lineId));
  }, [endpoints, selectedLineIds]);

  const allSelectedAreTls = useMemo(() => {
    return selectedEndpoints.length > 0 && selectedEndpoints.every((endpoint) => endpoint.tls);
  }, [selectedEndpoints]);

  const hasTlsInSelected = useMemo(() => {
    return selectedEndpoints.some((endpoint) => endpoint.tls);
  }, [selectedEndpoints]);

  // 当勾选的节点全部启用 TLS 时，自动切为 http 协议（即 https:// 代理），并锁定 SOCKS5
  useEffect(() => {
    if (allSelectedAreTls && protocol === 'socks5') {
      setProtocol('http');
    }
  }, [allSelectedAreTls, protocol]);

  // 智能过滤：若为 SOCKS5 协议，过滤出支持明文 SOCKS5 的节点（排除开启 TLS 的节点）
  const effectiveEndpoints = useMemo(() => {
    if (protocol === 'socks5') {
      return selectedEndpoints.filter((e) => !e.tls);
    }
    return selectedEndpoints;
  }, [selectedEndpoints, protocol]);

  // 若当前单节点视图被取消选择，或在 SOCKS5 模式下被过滤，自动重置为 'all'
  useEffect(() => {
    if (selectedNodeView !== 'all') {
      const isValid = effectiveEndpoints.some((e) => e.lineId === selectedNodeView);
      if (!isValid) {
        setSelectedNodeView('all');
      }
    }
  }, [effectiveEndpoints, selectedNodeView]);

  const currentKey = activeKeys.find((item) => item.id === keyId) ?? null;
  const exportQuery = useProxyPoolExport({
    keyId,
    format,
    protocol,
    lineIds: selectedLineIds,
    enabled: Boolean(keyId) && selectedLineIds.length > 0
  });

  const snippets = useMemo(() => {
    if (!currentKey || effectiveEndpoints.length === 0) return [];

    // 单节点视图
    if (selectedNodeView !== 'all') {
      const targetEndpoint = effectiveEndpoints.find((e) => e.lineId === selectedNodeView);
      if (targetEndpoint) {
        return buildProxyCodeSnippets({
          protocol,
          host: targetEndpoint.host,
          port: targetEndpoint.port,
          username: currentKey.username,
          password: currentKey.password,
          tls: targetEndpoint.tls,
          serverName: targetEndpoint.serverName
        });
      }
    }

    // 仅单个有效节点
    if (effectiveEndpoints.length === 1) {
      const single = effectiveEndpoints[0];
      return buildProxyCodeSnippets({
        protocol,
        host: single.host,
        port: single.port,
        username: currentKey.username,
        password: currentKey.password,
        tls: single.tls,
        serverName: single.serverName
      });
    }

    // 多节点轮换池模式
    return buildMultiProxyCodeSnippets({
      protocol,
      username: currentKey.username,
      password: currentKey.password,
      endpoints: effectiveEndpoints.map((e) => ({
        lineId: e.lineId,
        name: e.name,
        host: e.host,
        port: e.port,
        tls: e.tls,
        serverName: e.serverName
      }))
    });
  }, [currentKey, effectiveEndpoints, protocol, selectedNodeView]);

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
    ? t('user:proxyPool.createAndEnableKeyPrompt')
    : !selectedLineIds.length
      ? t('user:proxyPool.atLeastOneEndpointPrompt')
      : exportQuery.isPending
        ? t('user:proxyPool.generatingProxies')
        : exportQuery.isError
          ? t('user:proxyPool.exportFailed')
          : (exportQuery.data ?? '');

  const copyExportContent = async () => {
    const textToCopy = viewMode === 'export' ? exportContent : currentSnippet?.code || '';
    if (!textToCopy) return;
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      toast.success(viewMode === 'export' ? t('user:proxyPool.listCopiedToast') : t('user:proxyPool.codeCopiedToast'));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t('user:proxyPool.copyFailedToast'));
    }
  };

  const downloadTxt = () => {
    const content = exportQuery.data ?? '';
    if (!content) {
      toast.error(t('user:proxyPool.noListToDownload'));
      return;
    }
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `riricloud-proxies-${protocol}-${format}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(t('user:proxyPool.downloadedToast'));
  };

  if (!keys.length) {
    return (
      <Card className="border-dashed bg-muted/10">
        <CardContent className="py-12">
          <EmptyState
            title={t('user:proxyPool.noExportableKeyTitle')}
            description={t('user:proxyPool.noExportableKeyDesc')}
            action={
              onOpenCreateKey ? (
                <Button size="sm" onClick={onOpenCreateKey}>
                  {t('user:proxyPool.createFirstKey')}
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
              {t('user:proxyPool.configTitle')}
            </CardTitle>
            <CardDescription className="text-xs">
              {t('user:proxyPool.configDesc')}
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
                {t('user:proxyPool.credentialSelectLabel')}
              </label>
              <Select value={keyId} onValueChange={setKeyId}>
                <SelectTrigger className="h-9 text-xs" aria-label="Select export credential">
                  <SelectValue placeholder={t('user:proxyPool.credentialSelectPlaceholder')} />
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
              <label className="text-xs font-medium text-muted-foreground flex items-center justify-between">
                <span>{t('user:proxyPool.exportProtocolLabel')}</span>
                {allSelectedAreTls && (
                  <span className="text-[10px] text-sky-400/90 font-normal">{t('user:proxyPool.allTlsTip')}</span>
                )}
              </label>
              <div className="grid grid-cols-2 gap-1 rounded-md border bg-muted/40 p-0.5">
                <Button
                  type="button"
                  variant={protocol === 'socks5' ? 'default' : 'ghost'}
                  size="sm"
                  disabled={allSelectedAreTls}
                  title={allSelectedAreTls ? t('user:proxyPool.allTlsTitle') : undefined}
                  className={cn(
                    'h-7 text-xs font-medium',
                    allSelectedAreTls && 'cursor-not-allowed opacity-40'
                  )}
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
                  {hasTlsInSelected ? 'HTTP (HTTPS)' : 'HTTP'}
                </Button>
              </div>
            </div>

            {/* 3. 导出格式 */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">{t('user:proxyPool.exportFormatLabel')}</label>
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
                {t('user:proxyPool.selectNodesTitle', { selected: selectedLineIds.length, total: endpoints.length })}
              </div>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                  onClick={selectAllLines}
                >
                  {t('user:proxyPool.selectAll')}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                  onClick={clearAllLines}
                >
                  {t('user:proxyPool.clearAll')}
                </Button>
              </div>
            </div>

            {endpointsPending ? (
              <p className="py-4 text-center text-xs text-muted-foreground animate-pulse">{t('user:proxyPool.loadingNodes')}</p>
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
                        'h-auto py-1.5 px-2.5 w-full sm:w-auto max-w-full justify-between sm:justify-start gap-2 text-left font-normal transition-all rounded-md overflow-hidden',
                        isSelected
                          ? 'border-primary/50 bg-primary/10 text-foreground ring-1 ring-primary/20 shadow-2xs'
                          : 'border-border/60 bg-card/60 text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                      )}
                      onClick={() => toggleLine(endpoint.lineId, !isSelected)}
                    >
                      <div className="flex min-w-0 items-center gap-1.5 shrink">
                        <span
                          className={cn(
                            'size-2 rounded-full shrink-0',
                            endpoint.online ? 'bg-emerald-500' : 'bg-muted-foreground/40'
                          )}
                        />
                        <span
                          className="font-semibold text-xs text-foreground truncate max-w-[90px] sm:max-w-[130px]"
                          title={endpoint.name}
                        >
                          {endpoint.name}
                        </span>
                        {endpoint.region ? (
                          <span className="text-[10px] px-1 rounded bg-muted text-muted-foreground shrink-0">
                            {endpoint.region}
                          </span>
                        ) : null}
                        {endpoint.tls ? (
                          <span className="text-[10px] px-1 rounded bg-sky-500/10 text-sky-600 dark:text-sky-400 font-medium shrink-0">
                            HTTPS
                          </span>
                        ) : null}
                      </div>

                      <div className="flex min-w-0 items-center gap-1.5 shrink-0 text-muted-foreground/80 ml-auto sm:ml-0">
                        <span
                          className="font-mono text-[11px] truncate max-w-[110px] sm:max-w-[160px] md:max-w-none text-muted-foreground/80"
                          title={`${endpoint.host}:${endpoint.port}`}
                        >
                          {endpoint.host}:{endpoint.port}
                        </span>
                        {endpoint.latencyMs != null ? (
                          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono shrink-0">
                            {endpoint.latencyMs}ms
                          </span>
                        ) : null}
                        {isSelected && <Check className="size-3 text-primary shrink-0 ml-0.5" />}
                      </div>
                    </Button>
                  );
                })}
              </div>
            ) : (
              <p className="py-3 text-center text-xs text-muted-foreground">
                {t('user:proxyPool.noNodesConfigured')}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 终端风格一体化结果工作台 */}
      <div className="dark overflow-hidden rounded-xl border border-border/80 bg-zinc-950 text-zinc-100 shadow-md">
        {/* macOS 终端控制条 */}
        <div className="flex items-center justify-between gap-2 border-b border-zinc-800/80 bg-zinc-900/90 px-3 sm:px-4 py-2">
          {/* 左侧：经典三色圆点 + 模式切换 Tab */}
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            {/* 经典三色红黄绿圆点 */}
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="size-2.5 rounded-full bg-rose-500/80" />
              <span className="size-2.5 rounded-full bg-amber-500/80" />
              <span className="size-2.5 rounded-full bg-emerald-500/80" />
            </div>

            {/* 终端子功能切换 Tab */}
            <div className="flex items-center gap-0.5 rounded-md bg-zinc-800/80 p-0.5 text-xs">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={cn(
                  'h-6 px-2 sm:px-2.5 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/70 transition-colors',
                  viewMode === 'export' && 'bg-zinc-700 text-zinc-100 font-medium shadow-2xs hover:bg-zinc-700 hover:text-zinc-100'
                )}
                onClick={() => setViewMode('export')}
              >
                <ClipboardList className="size-3 mr-1" />
                <span>{t('user:proxyPool.tabTerminalExport')}</span>
                <span className="hidden sm:inline text-zinc-300 ml-0.5">
                  ({format === 'text' ? 'TXT' : format === 'uri' ? 'URI' : 'JSON'})
                </span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={cn(
                  'h-6 px-2 sm:px-2.5 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/70 transition-colors',
                  viewMode === 'code' && 'bg-zinc-700 text-zinc-100 font-medium shadow-2xs hover:bg-zinc-700 hover:text-zinc-100'
                )}
                onClick={() => setViewMode('code')}
              >
                <Terminal className="size-3 mr-1" />
                <span>{t('user:proxyPool.tabTerminalCode')}</span>
              </Button>
            </div>
          </div>

          {/* 桌面端右侧操作按钮组 (移动端隐藏，转移至下方次级栏以避免狭窄屏幕遮挡碰撞) */}
          <div className="hidden sm:flex items-center gap-1.5 shrink-0">
            {viewMode === 'export' ? (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 px-2 text-xs text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
                  onClick={downloadTxt}
                  disabled={!exportQuery.data}
                >
                  <Download className="size-3.5" />
                  <span className="hidden sm:inline">{t('user:proxyPool.downloadTxt')}</span>
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
                  <span>{copied ? t('user:proxyPool.copied') : t('user:proxyPool.copyResult')}</span>
                </Button>
              </>
            ) : (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-7 gap-1 px-2.5 text-xs bg-zinc-800 text-zinc-100 hover:bg-zinc-700"
                onClick={copyExportContent}
                disabled={!currentSnippet}
              >
                {copied ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
                <span>{copied ? t('user:proxyPool.copied') : t('user:proxyPool.copyCode')}</span>
              </Button>
            )}
          </div>
        </div>

        {/* 提取结果模式下的移动端二级控制条 (格式状态徽标 + 下载/复制操作按钮) */}
        {viewMode === 'export' && (
          <div className="flex sm:hidden items-center justify-between gap-2 border-b border-zinc-800/80 bg-zinc-900/60 px-3 py-1.5 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="rounded border border-zinc-700/60 bg-zinc-800/80 px-1.5 py-0.5 font-mono text-[10px] text-zinc-300">
                {format === 'text' ? 'TXT' : format === 'uri' ? 'URI' : 'JSON'}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 gap-1 px-2 text-[11px] text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
                onClick={downloadTxt}
                disabled={!exportQuery.data}
              >
                <Download className="size-3" />
                <span>{t('user:proxyPool.downloadTxt')}</span>
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-6 gap-1 px-2 text-[11px] bg-zinc-800 text-zinc-100 hover:bg-zinc-700"
                onClick={copyExportContent}
                disabled={!exportQuery.data}
              >
                {copied ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
                <span>{copied ? t('user:proxyPool.copied') : t('user:proxyPool.copyResult')}</span>
              </Button>
            </div>
          </div>
        )}

        {/* 自动化代码模式下的二级控制条 (语言切换 + 移动端复制 / 桌面端出网节点视图选择) */}
        {viewMode === 'code' && (
          <>
            <div className="flex items-center justify-between gap-2 border-b border-zinc-800/80 bg-zinc-900/60 px-3 sm:px-4 py-1.5 text-xs">
              {/* 多语言切换药丸 (横向平滑滚动) */}
              <div className="flex items-center gap-1 overflow-x-auto py-0.5 no-scrollbar">
                {snippets.map((snippet) => (
                  <Button
                    key={snippet.id}
                    type="button"
                    variant="ghost"
                    size="sm"
                    className={cn(
                      'h-6 px-2 text-[11px] text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/70 shrink-0 transition-colors',
                      snippetTab === snippet.id && 'bg-zinc-700 text-zinc-100 font-medium shadow-xs hover:bg-zinc-700 hover:text-zinc-100'
                    )}
                    onClick={() => setSnippetTab(snippet.id)}
                  >
                    {snippet.label.split(' ')[0]}
                  </Button>
                ))}
              </div>

              {/* 移动端专属复制代码按钮 (紧凑常驻在多语言右侧) */}
              <div className="flex sm:hidden items-center shrink-0">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-6 gap-1 px-2 text-[11px] bg-zinc-800 text-zinc-100 hover:bg-zinc-700 shrink-0"
                  onClick={copyExportContent}
                  disabled={!currentSnippet}
                >
                  {copied ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
                  <span>{copied ? t('user:proxyPool.copied') : t('user:proxyPool.copyCode')}</span>
                </Button>
              </div>

              {/* 桌面端出网节点切换器 (仅在桌面端且多于 1 个有效节点时在此行展示) */}
              {effectiveEndpoints.length > 1 && (
                <div className="hidden sm:flex items-center gap-1.5 ml-auto shrink-0">
                  <span className="text-[11px] text-zinc-500">{t('user:proxyPool.egressNode')}</span>
                  {effectiveEndpoints.length <= 2 ? (
                    <div className="flex items-center gap-1 rounded-md bg-zinc-800/80 p-0.5 text-xs">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className={cn(
                          'h-6 px-2 text-[11px] text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/70 transition-colors',
                          selectedNodeView === 'all' && 'bg-zinc-700 text-zinc-100 font-medium hover:bg-zinc-700 hover:text-zinc-100'
                        )}
                        onClick={() => setSelectedNodeView('all')}
                      >
                        {t('user:proxyPool.rotationPool', { count: effectiveEndpoints.length })}
                      </Button>
                      {effectiveEndpoints.map((ep) => (
                        <Button
                          key={ep.lineId}
                          type="button"
                          variant="ghost"
                          size="sm"
                          className={cn(
                            'h-6 max-w-[120px] truncate px-2 text-[11px] text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/70 transition-colors',
                            selectedNodeView === ep.lineId && 'bg-zinc-700 text-zinc-100 font-medium hover:bg-zinc-700 hover:text-zinc-100'
                          )}
                          onClick={() => setSelectedNodeView(ep.lineId)}
                          title={`${ep.name} (${ep.host}:${ep.port})`}
                        >
                          {ep.name}
                        </Button>
                      ))}
                    </div>
                  ) : (
                    <Select value={selectedNodeView} onValueChange={setSelectedNodeView}>
                      <SelectTrigger
                        className="h-6 min-w-[120px] max-w-[170px] border-zinc-700/80 bg-zinc-800/90 text-[11px] text-zinc-200"
                        aria-label="Select egress node view"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="border-zinc-700 bg-zinc-900 text-zinc-200">
                        <SelectItem value="all" className="text-xs">
                          {t('user:proxyPool.allRotationPool', { count: effectiveEndpoints.length })}
                        </SelectItem>
                        {effectiveEndpoints.map((ep) => (
                          <SelectItem key={ep.lineId} value={ep.lineId} className="text-xs">
                            {ep.name} ({ep.host}:{ep.port})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}
            </div>

            {/* 移动端专属三级控制条 (仅在移动端且多于 1 个有效节点时展示出网节点选择) */}
            {effectiveEndpoints.length > 1 && (
              <div className="flex sm:hidden items-center justify-between gap-2 border-b border-zinc-800/80 bg-zinc-900/40 px-3 py-1.5 text-xs">
                <span className="text-[11px] text-zinc-400 shrink-0">{t('user:proxyPool.egressNode')}</span>
                {effectiveEndpoints.length <= 2 ? (
                  <div className="flex items-center gap-1 rounded-md bg-zinc-800/80 p-0.5 text-xs overflow-x-auto no-scrollbar">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className={cn(
                        'h-6 px-2 text-[11px] text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/70 shrink-0 transition-colors',
                        selectedNodeView === 'all' && 'bg-zinc-700 text-zinc-100 font-medium hover:bg-zinc-700 hover:text-zinc-100'
                      )}
                      onClick={() => setSelectedNodeView('all')}
                    >
                      {t('user:proxyPool.rotationPool', { count: effectiveEndpoints.length })}
                    </Button>
                    {effectiveEndpoints.map((ep) => (
                      <Button
                        key={ep.lineId}
                        type="button"
                        variant="ghost"
                        size="sm"
                        className={cn(
                          'h-6 max-w-[110px] truncate px-2 text-[11px] text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/70 shrink-0 transition-colors',
                          selectedNodeView === ep.lineId && 'bg-zinc-700 text-zinc-100 font-medium hover:bg-zinc-700 hover:text-zinc-100'
                        )}
                        onClick={() => setSelectedNodeView(ep.lineId)}
                        title={`${ep.name} (${ep.host}:${ep.port})`}
                      >
                        {ep.name}
                      </Button>
                    ))}
                  </div>
                ) : (
                  <Select value={selectedNodeView} onValueChange={setSelectedNodeView}>
                    <SelectTrigger
                      className="h-6 w-full max-w-[200px] border-zinc-700/80 bg-zinc-800/90 text-[11px] text-zinc-200"
                      aria-label="Select egress node view"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="border-zinc-700 bg-zinc-900 text-zinc-200">
                      <SelectItem value="all" className="text-xs">
                        {t('user:proxyPool.allRotationPool', { count: effectiveEndpoints.length })}
                      </SelectItem>
                      {effectiveEndpoints.map((ep) => (
                        <SelectItem key={ep.lineId} value={ep.lineId} className="text-xs">
                          {ep.name} ({ep.host}:{ep.port})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}
          </>
        )}

        {/* 终端内容视窗 */}
        {viewMode === 'code' && protocol === 'socks5' && selectedEndpoints.some((e) => e.tls) && (
          <div className="flex items-center gap-2 border-b border-amber-500/20 bg-amber-500/10 px-4 py-2 text-[11px] text-amber-300">
            <span>{t('user:proxyPool.tlsWarning', { count: selectedEndpoints.filter((e) => e.tls).length })}</span>
          </div>
        )}
        <div className="max-h-80 min-h-36 overflow-auto p-4 font-mono text-xs leading-relaxed select-text">
          {viewMode === 'export' ? (
            <pre className="whitespace-pre-wrap break-all text-zinc-200">{exportContent}</pre>
          ) : (
            <pre className="whitespace-pre-wrap text-emerald-400 dark:text-emerald-300">
              {currentSnippet?.code || t('user:proxyPool.selectAtLeastOneNode')}
            </pre>
          )}
        </div>
      </div>

      {/* 免登录自动化 API 提取卡片 */}
      <div className="flex flex-col gap-2 rounded-lg border bg-muted/20 p-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-0.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold">
            <Server className="size-3.5 text-sky-500" />
            {t('user:proxyPool.apiTitle')}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {t('user:proxyPool.apiDesc')}
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
              {rotateToken.isPending ? t('user:proxyPool.rotatingToken') : t('user:proxyPool.rotateTokenButton')}
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
                toast.success(t('user:proxyPool.apiUrlCopiedToast'));
              }}
            >
              <Copy className="size-3" />
              {t('user:proxyPool.copyApiUrl')}
            </Button>
          ) : null}
        </div>
      </div>

      {/* 指纹浏览器导入提示 */}
      <div className="flex items-start gap-2 rounded-lg border border-dashed bg-muted/10 p-3 text-xs text-muted-foreground">
        <ClipboardList className="mt-0.5 size-3.5 shrink-0 text-sky-500" />
        <p className="leading-relaxed">
          <span className="font-medium text-foreground">{t('user:proxyPool.fingerprintTipTitle')}</span>{' '}
          {t('user:proxyPool.fingerprintTipDesc')}
        </p>
      </div>
    </div>
  );
}
