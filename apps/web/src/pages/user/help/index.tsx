import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  Headphones,
  Search,
  X
} from 'lucide-react';
import { toast } from 'sonner';
import { PageContainer } from '@/components/shared/page-container';
import { EmptyState } from '@/components/shared/empty-state';
import { MarkdownRenderer } from '@/components/shared/markdown-renderer';
import { SupportDialog } from '@/components/shared/support-dialog';
import { usePublicSettings } from '@/lib/public-settings';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  useHelpArticleDetail,
  useHelpArticles
} from './use-help-articles';
import { HelpQuickImport } from './components/help-quick-import';
import { HelpToc } from './components/help-toc';
import { getPlatformIcon } from './components/help-platform-icons';

export default function HelpCenterPage() {
  const { t, i18n } = useTranslation(['user', 'common']);
  const [searchParams, setSearchParams] = useSearchParams();
  const publicSettings = usePublicSettings();

  const currentSlug = searchParams.get('slug') || '';
  const [searchKeyword, setSearchKeyword] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);

  // 获取全量文档（不在服务端做单一平台硬过滤，以支持左侧分组全览和跨平台即时搜索）
  const { data: articles = [], isLoading: isListLoading } = useHelpArticles(
    undefined,
    i18n.language,
    searchKeyword.trim() || undefined
  );

  // 默认选中指定的 slug 或第一篇
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

  const handleCopyPageLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      toast.success(t('help.linkCopied', { defaultValue: '本页链接已复制到剪贴板' }));
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      toast.error(t('common:actions.copyFailed', { defaultValue: '复制失败' }));
    }
  };

  // 左侧分组组织
  const groupedArticles = useMemo(() => {
    if (searchKeyword.trim()) {
      return [
        {
          id: 'search',
          title: `${t('help.groups.all')} (${articles.length})`,
          items: articles
        }
      ];
    }

    const desktopItems = articles.filter(
      (a) => a.platform === 'WINDOWS' || a.platform === 'MACOS'
    );
    const mobileItems = articles.filter(
      (a) => a.platform === 'IOS' || a.platform === 'ANDROID'
    );
    const otherItems = articles.filter(
      (a) => !['WINDOWS', 'MACOS', 'IOS', 'ANDROID'].includes(a.platform)
    );

    const groups = [];
    if (desktopItems.length > 0) {
      groups.push({
        id: 'desktop',
        title: t('help.groups.desktop'),
        items: desktopItems
      });
    }
    if (mobileItems.length > 0) {
      groups.push({
        id: 'mobile',
        title: t('help.groups.mobile'),
        items: mobileItems
      });
    }
    if (otherItems.length > 0) {
      groups.push({
        id: 'troubleshooting',
        title: t('help.groups.troubleshooting'),
        items: otherItems
      });
    }

    if (groups.length === 0 && articles.length > 0) {
      groups.push({
        id: 'all',
        title: t('help.groups.all'),
        items: articles
      });
    }

    return groups;
  }, [articles, searchKeyword, t]);

  // 前一篇 / 后一篇计算
  const currentIndex = articles.findIndex((a) => a.slug === activeSlug);
  const prevArticle = currentIndex > 0 ? articles[currentIndex - 1] : null;
  const nextArticle = currentIndex >= 0 && currentIndex < articles.length - 1 ? articles[currentIndex + 1] : null;

  return (
    <PageContainer>
      {/* 现代化纯净无边框三栏流式布局 (居中且向两侧充分延展) */}
      <div className="flex flex-col lg:flex-row items-start justify-center gap-6 xl:gap-10 py-2 w-full">
        {/* 左侧边栏：极简树状导航与搜索 */}
        <aside className="w-full lg:w-64 xl:w-72 shrink-0 lg:sticky lg:top-6 lg:max-h-[calc(100vh-5rem)] overflow-y-auto pr-1">
          {/* 搜索框 */}
          <div className="relative mb-5">
            <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
            <Input
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              placeholder={t('help.searchPlaceholder')}
              className="h-8 pl-8 pr-7 text-xs bg-muted/40 focus-visible:bg-background border-border/60"
            />
            {searchKeyword && (
              <button
                type="button"
                onClick={() => setSearchKeyword('')}
                className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          {/* 分组导航列表 */}
          {isListLoading ? (
            <div className="py-6 text-center text-xs text-muted-foreground">
              {t('help.loading')}
            </div>
          ) : articles.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground">
              {t('help.empty')}
            </div>
          ) : (
            <div className="space-y-6">
              {groupedArticles.map((group) => (
                <div key={group.id} className="space-y-1.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/75 px-2">
                    {group.title}
                  </p>
                  <nav className="space-y-0.5">
                    {group.items.map((item) => {
                      const IconComp = getPlatformIcon(item.platform, item.icon);
                      const isSelected = item.slug === activeSlug;

                      return (
                        <button
                          key={item.slug}
                          type="button"
                          onClick={() => handleSelectArticle(item.slug)}
                          className={`group flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors ${
                            isSelected
                              ? 'font-medium text-primary bg-primary/10'
                              : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                          }`}
                        >
                          <IconComp
                            className={`size-3.5 shrink-0 transition-colors ${
                              isSelected ? 'text-primary' : 'text-muted-foreground/70 group-hover:text-foreground'
                            }`}
                          />
                          <span className="truncate flex-1">{item.title}</span>
                        </button>
                      );
                    })}
                  </nav>
                </div>
              ))}
            </div>
          )}

          {/* 底部客服链接 */}
          <div className="pt-6 mt-8 border-t border-border/40">
            <SupportDialog
              settings={publicSettings.data}
              trigger={
                <button
                  type="button"
                  className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1"
                >
                  <Headphones className="size-3.5 text-primary" />
                  <span>{t('help.contactSupport')}</span>
                </button>
              }
            />
          </div>
        </aside>

        {/* 中间正文阅读流 (居中且往两侧充分填充) */}
        <main className="flex-1 min-w-0 max-w-4xl xl:max-w-5xl w-full">
          {isDetailLoading ? (
            <div className="py-24 text-center text-sm text-muted-foreground">
              {t('help.loadingArticle')}
            </div>
          ) : !articleDetail ? (
            <EmptyState
              title={t('help.emptySelect')}
              description={t('help.emptySelectDesc')}
            />
          ) : (
            <div>
              {/* 文档头部 */}
              <div className="pb-6 border-b border-border/50">
                <div className="flex items-center justify-between gap-4 mb-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">
                    {articleDetail.platform} GUIDE
                  </span>

                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleCopyPageLink}
                          className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground gap-1.5"
                        >
                          {copiedLink ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
                          <span className="text-[11px] font-normal">
                            {copiedLink ? t('common:actions.copied') : t('help.copyPageLink')}
                          </span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">
                        <p className="text-xs">{t('help.copyPageLink')}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>

                <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-foreground">
                  {articleDetail.title}
                </h1>

                {articleDetail.summary && (
                  <p className="mt-3 text-sm sm:text-base text-muted-foreground leading-relaxed">
                    {articleDetail.summary}
                  </p>
                )}
              </div>

              {/* 快捷配置条 (轻量无侵入) */}
              {articleDetail.clientName && articleDetail.variables?.subUrl && (
                <HelpQuickImport
                  clientName={articleDetail.clientName}
                  platform={articleDetail.platform}
                  variables={articleDetail.variables}
                />
              )}

              {/* Markdown 正文 */}
              <div className="py-6">
                <MarkdownRenderer content={articleDetail.content} />
              </div>

              {/* 底部上一篇 / 下一篇导航条 */}
              <div className="flex items-center justify-between gap-4 pt-6 mt-10 border-t border-border/50 text-xs">
                {prevArticle ? (
                  <button
                    type="button"
                    onClick={() => handleSelectArticle(prevArticle.slug)}
                    className="group flex flex-col items-start gap-1 p-2 rounded-lg hover:bg-muted/40 transition text-left"
                  >
                    <span className="flex items-center gap-1 text-[11px] text-muted-foreground group-hover:text-foreground">
                      <ArrowLeft className="size-3" />
                      {t('help.prevArticle')}
                    </span>
                    <span className="font-medium text-foreground truncate max-w-[200px] sm:max-w-xs">
                      {prevArticle.title}
                    </span>
                  </button>
                ) : (
                  <div />
                )}

                {nextArticle ? (
                  <button
                    type="button"
                    onClick={() => handleSelectArticle(nextArticle.slug)}
                    className="group flex flex-col items-end gap-1 p-2 rounded-lg hover:bg-muted/40 transition text-right"
                  >
                    <span className="flex items-center gap-1 text-[11px] text-muted-foreground group-hover:text-foreground">
                      {t('help.nextArticle')}
                      <ArrowRight className="size-3" />
                    </span>
                    <span className="font-medium text-foreground truncate max-w-[200px] sm:max-w-xs">
                      {nextArticle.title}
                    </span>
                  </button>
                ) : (
                  <div />
                )}
              </div>
            </div>
          )}
        </main>

        {/* 右侧：本页目录 TOC (大屏粘性浮动，无边框纯文本) */}
        <aside className="hidden xl:block w-52 xl:w-60 shrink-0 sticky top-6 max-h-[calc(100vh-5rem)] overflow-y-auto pl-3">
          {articleDetail?.content ? (
            <HelpToc content={articleDetail.content} />
          ) : null}
        </aside>
      </div>
    </PageContainer>
  );
}
