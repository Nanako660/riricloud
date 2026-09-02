import { Link } from 'react-router-dom';
import { PageContainer, PageHeader } from '@/components/shared/page-container';
import { EmptyState } from '@/components/shared/empty-state';
import { LineCard } from '@/components/shared/line-card';
import { Button } from '@/components/ui/button';
import { useUserSubscription } from '../subscription/use-user-subscription';

export default function UserLinesPage() {
  const { data, isPending, isError } = useUserSubscription();

  if (isPending) {
    return (
      <PageContainer>
        <PageHeader title="可用线路" />
        <p className="text-sm text-muted-foreground animate-pulse">加载中…</p>
      </PageContainer>
    );
  }

  if (isError) {
    return (
      <PageContainer>
        <PageHeader title="可用线路" />
        <EmptyState title="无法加载线路" description="请稍后刷新重试" />
      </PageContainer>
    );
  }

  if (!data?.subscription) {
    return (
      <PageContainer>
        <PageHeader title="可用线路" description="当前套餐授权的接入线路与底层健康状态。" />
        <EmptyState
          title="订阅后查看可用线路"
          description="前往套餐市场选择并开通套餐，系统将根据套餐规则自动分配授权的接入线路。"
          action={
            <Button asChild size="sm">
              <Link to="/market">前往套餐市场</Link>
            </Button>
          }
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader title="可用线路" description="当前套餐授权的接入线路与底层健康状态。" />

      {data.lines.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.lines.map((line) => (
            <LineCard key={line.id} line={line} variant="full" />
          ))}
        </div>
      ) : (
        <EmptyState
          title="暂无可用线路"
          description="当前套餐尚未匹配到在线线路，请稍后刷新或联系管理员。"
        />
      )}
    </PageContainer>
  );
}
