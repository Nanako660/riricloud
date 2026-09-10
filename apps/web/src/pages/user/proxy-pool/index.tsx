import { useState } from 'react';
import { Info } from 'lucide-react';
import { PageContainer, PageHeader } from '@/components/shared/page-container';
import { EmptyState } from '@/components/shared/empty-state';
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
  const endpoints = endpointsQuery.data?.endpoints ?? [];

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
        description="独立于客户端订阅的 SOCKS5 / HTTP 标准代理池，适用于爬虫、指纹浏览器与脚本工具。"
      />

      <div className="flex items-start gap-2.5 rounded-lg border bg-muted/30 p-3.5">
        <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 space-y-0.5">
          <p className="text-sm font-medium">与订阅体系完全解耦</p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            直连代理使用独立的 Proxy Key 凭据（pk_ 用户名 + 独立密码），不暴露账号密码、UUID 与订阅链接；
            流量统一计入主账户配额，超额或账号停用后凭据将自动熔断。
          </p>
        </div>
      </div>

      <ProxyKeySection
        keys={keys}
        limit={keysQuery.data?.limit ?? 20}
        isPending={keysQuery.isPending}
        onCreate={openCreate}
        onEdit={openEdit}
      />

      <ProxyExportSection keys={keys} endpoints={endpoints} endpointsPending={endpointsQuery.isPending} />

      <ProxyKeyDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} />
    </PageContainer>
  );
}
