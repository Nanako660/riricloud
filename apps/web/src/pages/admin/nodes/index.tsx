import { PageContainer, PageHeader } from '@/components/shared/page-container';
import { EmptyState } from '@/components/shared/empty-state';

export default function AdminNodesPage() {
  return (
    <PageContainer>
      <PageHeader title="节点管理" />
      <EmptyState title="建设中" description="管理员节点页将在下一提交实现" />
    </PageContainer>
  );
}
