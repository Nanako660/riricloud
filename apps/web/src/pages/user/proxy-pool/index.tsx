import { useState } from 'react';
import { Globe, Info, KeyRound, Network, Wand2, Zap } from 'lucide-react';
import { PageContainer, PageHeader } from '@/components/shared/page-container';
import { StatCard } from '@/components/shared/stat-card';
import { EmptyState } from '@/components/shared/empty-state';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ProxyKeyDialog } from './components/proxy-key-dialog';
import { ProxyKeySection } from './components/proxy-key-section';
import { ProxyExportSection } from './components/proxy-export-section';
import { type ProxyKey, useProxyPoolEndpoints, useProxyPoolKeys } from './use-proxy-pool';

// 用户中心「直连代理」：独立于客户端翻墙订阅的 SOCKS5/HTTP 直连代理池
export default function UserProxyPoolPage() {
  const keysQuery = useProxyPoolKeys();
  const endpointsQuery = useProxyPoolEndpoints();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ProxyKey | null>(null);

  const keys = keysQuery.data?.keys ?? [];
  const limit = keysQuery.data?.limit ?? 20;
  const endpoints = endpointsQuery.data?.endpoints ?? [];
  const activeKeys = keys.filter((k) => k.isActive);
  const onlineEndpointsCount = endpoints.filter((e) => e.nodeStatus === 'ONLINE').length;

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (item: ProxyKey) => {
    setEditing(item);
    setDialogOpen(true);
  };

  if (keysQuery.isError) {
    return (
      <PageContainer>
        <PageHeader title="直连代理" description="面向自动化环境的 SOCKS5 / HTTP 标准代理池。" />
        <EmptyState title="无法加载直连代理凭据" description="请稍后刷新重试" />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="直连代理"
        description="独立于客户端订阅的 SOCKS5 / HTTP 标准代理池，专为爬虫采集、指纹浏览器多开与自动化脚本打造。"
      />

      {/* 顶部轻量说明横幅 */}
      <div className="flex items-center gap-2.5 rounded-lg border bg-muted/20 px-3.5 py-2.5 text-xs text-muted-foreground transition-colors hover:bg-muted/30">
        <Info className="size-4 shrink-0 text-sky-500" />
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <span className="truncate">
            直连代理使用独立的 Proxy Key 凭据（<code className="font-mono font-medium text-foreground">pk_</code> 用户名 + 密码），与客户端翻墙订阅完全解耦。
          </span>
          <span className="shrink-0 text-muted-foreground/80">流量计入主账户用量 · 超额自动熔断</span>
        </div>
      </div>

      {/* 顶部微型指标仪表盘 */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          title="活跃凭据"
          value={`${activeKeys.length} / ${limit}`}
          hint={keys.length >= limit ? '已达上限' : `已创建 ${keys.length} 条凭据`}
          icon={<KeyRound className="text-emerald-500" />}
        />
        <StatCard
          title="可用端点"
          value={`${endpoints.length} 节点`}
          hint={endpoints.length ? `${onlineEndpointsCount || endpoints.length} 在线可用` : '暂无可用线路'}
          icon={<Globe className="text-sky-500" />}
        />
        <StatCard
          title="协议支持"
          value="Mixed 单端口"
          hint="SOCKS5 + HTTP 双协议共存"
          icon={<Network className="text-violet-500" />}
        />
        <StatCard
          title="计费联动"
          value="主账户共享"
          hint="统一扣减 · 超额自动阻断"
          icon={<Zap className="text-amber-500" />}
        />
      </div>

      {/* 响应式 Tabs 分页结构：提取工作台 vs 凭据管理 */}
      <Tabs defaultValue="export" className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <TabsList className="grid h-9 w-full grid-cols-2 bg-muted/60 p-1 sm:w-auto">
            <TabsTrigger value="export" className="gap-1.5 text-xs sm:text-sm">
              <Wand2 className="size-3.5" />
              代理提取与集成
            </TabsTrigger>
            <TabsTrigger value="keys" className="gap-1.5 text-xs sm:text-sm">
              <KeyRound className="size-3.5" />
              凭据与白名单
              {keys.length ? (
                <span className="ml-1 rounded-full bg-muted-foreground/15 px-1.5 py-0.5 text-[10px] font-medium leading-none">
                  {keys.length}
                </span>
              ) : null}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="export" className="m-0 focus-visible:outline-none">
          <ProxyExportSection
            keys={keys}
            endpoints={endpoints}
            endpointsPending={endpointsQuery.isPending}
            onOpenCreateKey={openCreate}
          />
        </TabsContent>

        <TabsContent value="keys" className="m-0 focus-visible:outline-none">
          <ProxyKeySection
            keys={keys}
            limit={limit}
            isPending={keysQuery.isPending}
            onCreate={openCreate}
            onEdit={openEdit}
          />
        </TabsContent>
      </Tabs>

      <ProxyKeyDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} />
    </PageContainer>
  );
}

