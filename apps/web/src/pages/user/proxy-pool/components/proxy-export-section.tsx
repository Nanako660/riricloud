import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ClipboardList, Globe, RefreshCw, Server, Terminal, Wand2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { CopyButton } from '@/components/shared/copy-button';
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
}

const FORMAT_LABELS: Record<ProxyPoolExportFormat, string> = {
  text: 'IP:Port:User:Pass',
  uri: 'URI 列表',
  json: 'JSON 对象'
};

export function ProxyExportSection({ keys, endpoints, endpointsPending }: ProxyExportSectionProps) {
  const publicSettings = usePublicSettings();
  const { rotateToken } = useProxyPoolMutations();
  const [keyId, setKeyId] = useState<string>('');
  const [selectedLineIds, setSelectedLineIds] = useState<string[]>([]);
  const [protocol, setProtocol] = useState<ProxyPoolExportProtocol>('socks5');
  const [format, setFormat] = useState<ProxyPoolExportFormat>('text');
  const [snippetTab, setSnippetTab] = useState('python-requests');

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
      password: currentKey.password
    });
  }, [currentKey, previewEndpoint, protocol]);

  const automationBase = (publicSettings.data?.publicBaseUrl || publicSettings.data?.subscriptionBaseUrl || window.location.origin).replace(/\/+$/, '');
  const automationUrl = currentKey
    ? `${automationBase}/api/v1/user/proxy-pool/export?token=${encodeURIComponent(currentKey.exportToken)}&format=text&protocol=${protocol}`
    : '';

  const toggleLine = (lineId: string, checked: boolean) => {
    setSelectedLineIds((current) => (checked ? [...new Set([...current, lineId])] : current.filter((id) => id !== lineId)));
  };

  const exportContent = !keyId
    ? '请先创建并启用一条直连代理凭据'
    : !selectedLineIds.length
      ? '请至少选择一个节点端点'
      : exportQuery.isPending
        ? '正在生成…'
        : exportQuery.isError
          ? '导出失败，请检查凭据与节点可用性'
          : (exportQuery.data ?? '');

  if (!keys.length) {
    return (
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <Wand2 className="size-4" />
            代理池提取与导出
          </CardTitle>
          <CardDescription>创建凭据后即可提取多格式代理列表与自动化代码片段。</CardDescription>
        </CardHeader>
        <CardContent>
          <EmptyState title="暂无可导出的凭据" description="请先在上方创建一条直连代理凭据。" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <Wand2 className="size-4" />
          代理池提取与导出
        </CardTitle>
        <CardDescription>
          选择凭据与节点后，一键导出工业标准代理列表，并生成主流自动化工具可直接运行的代码片段。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2 rounded-lg border p-3.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-sm font-medium">
                <Globe className="size-4" />
                选择节点端点（{selectedLineIds.length}/{endpoints.length}）
              </div>
              <div className="flex gap-1.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setSelectedLineIds(endpoints.map((endpoint) => endpoint.lineId))}
                >
                  全选
                </Button>
                <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSelectedLineIds([])}>
                  清空
                </Button>
              </div>
            </div>
            {endpointsPending ? (
              <p className="py-4 text-center text-xs text-muted-foreground animate-pulse">加载中…</p>
            ) : endpoints.length ? (
              <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
                {endpoints.map((endpoint) => (
                  <div
                    key={endpoint.lineId}
                    className={cn(
                      'flex items-center gap-2.5 rounded-md border p-2.5 transition-colors',
                      selectedLineIds.includes(endpoint.lineId) ? 'border-primary/50 bg-primary/5' : 'hover:bg-muted/50'
                    )}
                  >
                    <Checkbox
                      id={`pool-line-${endpoint.lineId}`}
                      checked={selectedLineIds.includes(endpoint.lineId)}
                      onCheckedChange={(checked) => toggleLine(endpoint.lineId, checked === true)}
                    />
                    <Label htmlFor={`pool-line-${endpoint.lineId}`} className="min-w-0 flex-1 cursor-pointer font-normal">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="truncate text-sm font-medium">{endpoint.name}</span>
                        {endpoint.region ? (
                          <Badge variant="secondary" className="shrink-0 text-[11px]">
                            {endpoint.region}
                          </Badge>
                        ) : null}
                        <Badge variant={endpoint.online ? 'default' : 'outline'} className="shrink-0 text-[11px]">
                          {endpoint.online ? '在线' : endpoint.nodeStatus}
                        </Badge>
                      </div>
                      <p className="truncate font-mono text-[11px] text-muted-foreground">
                        {endpoint.host}:{endpoint.port} · {endpoint.nodeName}
                        {endpoint.latencyMs != null ? ` · ${endpoint.latencyMs} ms` : ''}
                      </p>
                    </Label>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-4 text-center text-xs text-muted-foreground">
                管理员尚未配置 Mixed 线路，暂无可用的直连代理节点。
              </p>
            )}
          </div>

          <div className="space-y-3 rounded-lg border p-3.5">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <span className="text-sm font-medium">导出凭据</span>
                <Select value={keyId} onValueChange={setKeyId}>
                  <SelectTrigger aria-label="选择导出凭据">
                    <SelectValue placeholder="选择凭据" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeKeys.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <span className="text-sm font-medium">导出协议</span>
                <Select value={protocol} onValueChange={(value) => setProtocol(value as ProxyPoolExportProtocol)}>
                  <SelectTrigger aria-label="选择导出协议">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="socks5">SOCKS5</SelectItem>
                    <SelectItem value="http">HTTP CONNECT</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <span className="text-sm font-medium">导出格式</span>
              <Tabs value={format} onValueChange={(value) => setFormat(value as ProxyPoolExportFormat)}>
                <TabsList className="grid w-full grid-cols-3">
                  {(Object.keys(FORMAT_LABELS) as ProxyPoolExportFormat[]).map((item) => (
                    <TabsTrigger key={item} value={item} className="text-xs">
                      {FORMAT_LABELS[item]}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>
            <div className="flex items-center justify-between gap-2 pt-1">
              <p className="text-xs text-muted-foreground">
                {exportQuery.data ? `${selectedLineIds.length} 个端点已生成` : '等待生成'}
              </p>
              <CopyButton value={exportQuery.data ?? ''} />
            </div>
          </div>
        </div>

        <Textarea
          readOnly
          rows={format === 'json' ? 12 : 6}
          value={exportContent}
          aria-label="导出内容预览"
          className="font-mono text-xs"
        />

        <div className="space-y-2 rounded-lg border p-3.5">
          <div className="flex items-center gap-1.5 text-sm font-medium">
            <Terminal className="size-4" />
            自动化代码片段
          </div>
          {snippets.length ? (
            <Tabs value={snippetTab} onValueChange={setSnippetTab}>
              <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-transparent p-0">
                {snippets.map((snippet) => (
                  <TabsTrigger key={snippet.id} value={snippet.id} className="text-xs data-[state=active]:bg-muted">
                    {snippet.label}
                  </TabsTrigger>
                ))}
              </TabsList>
              {snippets.map((snippet) => (
                <TabsContent key={snippet.id} value={snippet.id} className="space-y-2">
                  <Textarea readOnly rows={10} value={snippet.code} aria-label={`${snippet.label} 代码片段`} className="font-mono text-xs" />
                  <div className="flex justify-end">
                    <CopyButton value={snippet.code} />
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          ) : (
            <p className="py-3 text-center text-xs text-muted-foreground">请先选择至少一个节点端点。</p>
          )}
        </div>

        <div className="space-y-2 rounded-lg border bg-muted/20 p-3.5">
          <div className="flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
            <div className="min-w-0 space-y-0.5">
              <div className="flex items-center gap-1.5 text-sm font-medium">
                <Server className="size-4" />
                免登录定时拉取（第三方爬虫框架）
              </div>
              <p className="text-xs text-muted-foreground">
                携带令牌即可免 Cookie 拉取纯文本代理列表，适用于定时同步到调度器或指纹浏览器。
              </p>
            </div>
            {currentKey ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 gap-1.5"
                disabled={rotateToken.isPending}
                onClick={() => rotateToken.mutate(currentKey.id)}
              >
                <RefreshCw className="size-3.5" />
                {rotateToken.isPending ? '轮换中…' : '轮换令牌'}
              </Button>
            ) : null}
          </div>
          {automationUrl ? (
            <div className="flex min-w-0 items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-md border bg-background px-3 py-2 font-mono text-xs">{automationUrl}</code>
              <CopyButton value={automationUrl} />
            </div>
          ) : null}
        </div>

        <div className="flex items-start gap-2 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
          <ClipboardList className="mt-0.5 size-3.5 shrink-0" />
          <p className="leading-relaxed">
            <span className="font-medium text-foreground">指纹浏览器导入：</span>
            选择 <Badge variant="secondary" className="mx-0.5 font-mono text-[11px]">IP:Port:User:Pass</Badge>
            格式后按行复制，可直接粘贴到 AdsPower / Hubstudio 等工具的批量导入框
            <Check className="mx-1 inline size-3 align-text-bottom" />
            流量将统一计入主账户配额，超额后凭据自动熔断。
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
