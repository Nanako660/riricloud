import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Calendar,
  ChevronRight,
  Headphones,
  Laptop,
  Monitor,
  Search,
  Smartphone,
  Sparkles
} from 'lucide-react';
import { PageContainer, PageHeader } from '@/components/shared/page-container';
import { EmptyState } from '@/components/shared/empty-state';
import { MarkdownRenderer } from '@/components/shared/markdown-renderer';
import { SupportDialog } from '@/components/shared/support-dialog';
import { usePublicSettings } from '@/lib/public-settings';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatDate } from '@/lib/utils';
import {
  type PlatformType,
  useHelpArticleDetail,
  useHelpArticles
} from './use-help-articles';
import { HelpQuickImport } from './components/help-quick-import';
import { HelpToc } from './components/help-toc';
import { getPlatformIcon } from './components/help-platform-icons';

const PLATFORM_TABS: Array<{ value: PlatformType; label: string; icon: typeof Monitor }> = [
  { value: 'ALL', label: '全部文档', icon: BookOpen },
  { value: 'WINDOWS', label: 'Windows', icon: Monitor },
  { value: 'MACOS', label: 'macOS', icon: Laptop },
  { value: 'IOS', label: 'iOS (苹果)', icon: Smartphone },
  { value: 'ANDROID', label: 'Android (安卓)', icon: Smartphone },
  { value: 'FAQ', label: '常见排错 FAQ', icon: Sparkles }
];

export default function HelpCenterPage() {
  const { t, i18n } = useTranslation(['user', 'common']);
  const [searchParams, setSearchParams] = useSearchParams();
  const publicSettings = usePublicSettings();

  const currentPlatform = (searchParams.get('platform') || 'ALL') as PlatformType;
  const currentSlug = searchParams.get('slug') || '';
  const [searchKeyword, setSearchKeyword] = useState('');

  const { data: articles = [], isLoading: isListLoading } = useHelpArticles(
    currentPlatform,
    i18n.language,
    searchKeyword
  );

  // 默认选中第一篇或指定的 slug
  const activeSlug = useMemo(() => {
    if (currentSlug && articles.some((a) => a.slug === currentSlug)) {
      return currentSlug;
    }
    return articles[0]?.slug || '';
  }, [currentSlug, articles]);

  const { data: articleDetail, isLoading: isDetailLoading } = useHelpArticleDetail(activeSlug);

  const handleSelectArticle = (slug: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('slug', slug);
      return next;
    });
  };

  const handleSelectPlatform = (platform: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('platform', platform);
      next.delete('slug'); // 切换分类后自动选该分类第一篇
      return next;
    });
  };

  // 前一篇 / 后一篇计算
  const currentIndex = articles.findIndex((a) => a.slug === activeSlug);
  const prevArticle = currentIndex > 0 ? articles[currentIndex - 1] : null;
  const nextArticle = currentIndex >= 0 && currentIndex < articles.length - 1 ? articles[currentIndex + 1] : null;

  return (
    <PageContainer>
      <PageHeader
        title={t('user:help.title', { defaultValue: '使用文档与帮助中心' })}
        description={t('user:help.subtitle', {
          defaultValue: '面向 0 基础用户的主流客户端安装配置指南与连接排错手册。'
        })}
      />

      {/* 顶部平台分类筛选 Tab + 搜索框 */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-2 border-b border-border/50">
        <Tabs
          value={currentPlatform}
          onValueChange={handleSelectPlatform}
          className="w-full sm:w-auto"
        >
          <TabsList className="grid grid-cols-3 sm:flex sm:flex-wrap h-auto p-1 gap-1">
            {PLATFORM_TABS.map((tab) => {
              const TabIcon = tab.icon;
              return (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="gap-1.5 px-3 py-1.5 text-xs font-medium"
                >
                  <TabIcon className="size-3.5" />
                  <span>{tab.label}</span>
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>

        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            placeholder="搜索教程标题或问题…"
            className="pl-8 h-9 text-xs"
          />
        </div>
      </div>

      {/* 主体三栏响应式网格 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start mt-4">
        {/* 左侧：文章列表目录 */}
        <div className="lg:col-span-4 xl:col-span-3 space-y-3">
          <div className="rounded-xl border border-border bg-card p-3 shadow-2xs">
            <div className="flex items-center justify-between px-2 pb-2 mb-1 border-b border-border/40 text-xs font-semibold text-muted-foreground">
              <span>教程导航 ({articles.length})</span>
              {currentPlatform !== 'ALL' && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                  {currentPlatform}
                </Badge>
              )}
            </div>

            {isListLoading ? (
              <div className="py-8 text-center text-xs text-muted-foreground">正在加载文档列表…</div>
            ) : articles.length === 0 ? (
              <div className="py-6 text-center text-xs text-muted-foreground">该分类下暂无文档</div>
            ) : (
              <div className="overflow-y-auto max-h-[calc(100vh-280px)] pr-2">
                <div className="space-y-1">
                  {articles.map((item) => {
                    const IconComp = getPlatformIcon(item.platform, item.icon);
                    const isSelected = item.slug === activeSlug;

                    return (
                      <button
                        key={item.slug}
                        type="button"
                        onClick={() => handleSelectArticle(item.slug)}
                        className={`w-full text-left rounded-lg p-2.5 transition flex items-start gap-2.5 ${
                          isSelected
                            ? 'bg-primary/10 border border-primary/30 text-foreground font-medium shadow-2xs'
                            : 'hover:bg-muted/60 text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        <span
                          className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md ${
                            isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground/70'
                          }`}
                        >
                          <IconComp className="size-3.5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-xs font-medium">{item.title}</span>
                          </div>
                          {item.summary && (
                            <p className="line-clamp-2 text-[11px] text-muted-foreground/80 mt-1 leading-snug">
                              {item.summary}
                            </p>
                          )}
                          {item.clientName && (
                            <div className="mt-1.5 flex items-center gap-1">
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-border/70 text-muted-foreground font-normal">
                                {item.clientName}
                              </Badge>
                            </div>
                          )}
                        </div>
                        <ChevronRight className={`size-3.5 mt-1 shrink-0 opacity-40 ${isSelected ? 'text-primary opacity-100' : ''}`} />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* 桌面端客服支持卡片 */}
          <Card className="border-border/60 bg-muted/20">
            <CardContent className="p-4 space-y-2 text-xs">
              <div className="flex items-center gap-2 font-semibold text-foreground">
                <Headphones className="size-4 text-primary" />
                <span>仍然无法连接？</span>
              </div>
              <p className="text-muted-foreground leading-relaxed">
                如果在阅读教程后仍然无法连接或遇到报错，欢迎联系人工技术支持。
              </p>
              <SupportDialog
                settings={publicSettings.data}
                trigger={
                  <Button variant="outline" size="sm" className="w-full text-xs h-8 gap-1.5 mt-1">
                    <Headphones className="size-3.5" />
                    <span>联系在线客服</span>
                  </Button>
                }
              />
            </CardContent>
          </Card>
        </div>

        {/* 中间：文档正文主阅读区 */}
        <div className="lg:col-span-8 xl:col-span-6 space-y-4">
          {isDetailLoading ? (
            <Card>
              <CardContent className="py-20 text-center text-muted-foreground text-sm">
                正在加载教程正文…
              </CardContent>
            </Card>
          ) : !articleDetail ? (
            <EmptyState
              title="未选中或暂无可用文档"
              description="请在左侧列表中选择一篇教程开始阅读。"
            />
          ) : (
            <Card className="border-border bg-card shadow-2xs">
              <CardContent className="p-5 sm:p-7 space-y-5">
                {/* 文章标题与元数据头 */}
                <div className="space-y-2 pb-4 border-b border-border/50">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="secondary" className="text-xs px-2 py-0.5">
                      {articleDetail.platform}
                    </Badge>
                    {articleDetail.clientName && (
                      <Badge variant="outline" className="text-xs px-2 py-0.5 border-primary/30 text-primary">
                        {articleDetail.clientName}
                      </Badge>
                    )}
                    <span className="flex items-center gap-1 ml-auto text-[11px]">
                      <Calendar className="size-3" />
                      <span>更新于 {formatDate(articleDetail.updatedAt)}</span>
                    </span>
                  </div>
                  <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                    {articleDetail.title}
                  </h1>
                  {articleDetail.summary && (
                    <p className="text-sm text-muted-foreground leading-relaxed pt-1">
                      {articleDetail.summary}
                    </p>
                  )}
                </div>

                {/* 如果是客户端类教程，展示置顶快捷配置卡片 */}
                {articleDetail.variables && (
                  <HelpQuickImport
                    clientName={articleDetail.clientName}
                    platform={articleDetail.platform}
                    variables={articleDetail.variables}
                  />
                )}

                {/* Markdown 正文渲染 */}
                <div className="pt-2">
                  <MarkdownRenderer content={articleDetail.content} />
                </div>

                {/* 底部前一篇 / 后一篇导航 */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-6 mt-8 border-t border-border/60">
                  {prevArticle ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full sm:w-auto gap-2 text-xs"
                      onClick={() => handleSelectArticle(prevArticle.slug)}
                    >
                      <ArrowLeft className="size-3.5" />
                      <span className="truncate max-w-[180px]">上一篇：{prevArticle.title}</span>
                    </Button>
                  ) : (
                    <div />
                  )}

                  {nextArticle ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full sm:w-auto gap-2 text-xs ml-auto"
                      onClick={() => handleSelectArticle(nextArticle.slug)}
                    >
                      <span className="truncate max-w-[180px]">下一篇：{nextArticle.title}</span>
                      <ArrowRight className="size-3.5" />
                    </Button>
                  ) : (
                    <div />
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* 右侧：目录大纲 TOC (在桌面大屏幕展示) */}
        <div className="hidden xl:block xl:col-span-3 sticky top-6">
          <div className="rounded-xl border border-border/70 bg-card/60 backdrop-blur p-4 shadow-2xs space-y-4">
            {articleDetail ? (
              <HelpToc content={articleDetail.content} />
            ) : (
              <div className="text-xs text-muted-foreground py-2">暂无目录</div>
            )}
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
