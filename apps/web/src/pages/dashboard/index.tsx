import { PageContainer, PageHeader } from '@/components/shared/page-container';
import { EmptyState } from '@/components/shared/empty-state';

export default function DashboardPage() {
  return (
    <PageContainer>
      <PageHeader title="仪表盘" />
      <EmptyState title="建设中" description="用户仪表盘将在下一提交实现" />
    </PageContainer>
  );
}
