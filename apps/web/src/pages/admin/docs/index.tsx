import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Copy,
  Edit,
  Plus,
  Search,
  Trash2
} from 'lucide-react';
import { toast } from 'sonner';
import { PageContainer, PageHeader } from '@/components/shared/page-container';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog';
import { formatDateTime } from '@/lib/utils';
import {
  type AdminHelpArticle,
  type AdminHelpArticlePayload,
  useAdminHelpArticles,
  useAdminHelpMutations
} from './use-admin-docs';
import { DocEditorDialog } from './components/doc-editor-dialog';
import { ResetDefaultsDialog } from './components/reset-defaults-dialog';
import { getPlatformIcon } from '@/pages/user/help/components/help-platform-icons';

export default function AdminDocsPage() {
  const { t } = useTranslation(['admin', 'common']);
  const [platformFilter, setPlatformFilter] = useState('ALL');
  const [localeFilter, setLocaleFilter] = useState('ALL');
  const [searchKeyword, setSearchKeyword] = useState('');

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingArticle, setEditingArticle] = useState<AdminHelpArticle | null>(null);

  const { data: articles = [], isLoading } = useAdminHelpArticles({
    platform: platformFilter !== 'ALL' ? platformFilter : undefined,
    locale: localeFilter !== 'ALL' ? localeFilter : undefined,
    keyword: searchKeyword ? searchKeyword.trim() : undefined
  });

  const {
    createMutation,
    updateMutation,
    deleteMutation,
    resetDefaultsMutation
  } = useAdminHelpMutations();

  const handleOpenCreate = () => {
    setEditingArticle(null);
    setEditorOpen(true);
  };

  const handleOpenEdit = (article: AdminHelpArticle) => {
    setEditingArticle(article);
    setEditorOpen(true);
  };

  const handleSave = (payload: AdminHelpArticlePayload) => {
    if (editingArticle && editingArticle.id) {
      updateMutation.mutate(
        { id: editingArticle.id, payload },
        { onSuccess: () => setEditorOpen(false) }
      );
    } else {
      createMutation.mutate(payload, {
        onSuccess: () => setEditorOpen(false)
      });
    }
  };

  const handleTogglePublish = (article: AdminHelpArticle, isPublished: boolean) => {
    updateMutation.mutate({
      id: article.id,
      payload: { isPublished }
    });
  };

  const handleCopySlug = async (slug: string) => {
    try {
      await navigator.clipboard.writeText(slug);
      toast.success(t('admin:docs.copiedSlug'));
    } catch {
      toast.error(t('common:actions.copyFailed'));
    }
  };

  return (
    <PageContainer>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <PageHeader
          title={t('admin:docs.title')}
          description={t('admin:docs.subtitle')}
        />
        <div className="flex items-center gap-2 shrink-0">
          <ResetDefaultsDialog
            onConfirm={() => resetDefaultsMutation.mutate()}
            isPending={resetDefaultsMutation.isPending}
          />
          <Button size="sm" className="gap-1.5 shadow-xs" onClick={handleOpenCreate}>
            <Plus className="size-4" />
            <span>{t('admin:docs.newDoc')}</span>
          </Button>
        </div>
      </div>

      {/* 顶部工具栏过滤 */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 rounded-xl border border-border bg-card shadow-2xs">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={platformFilter} onValueChange={setPlatformFilter}>
            <SelectTrigger className="w-[140px] h-8 text-xs">
              <SelectValue placeholder={t('admin:docs.platform')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{t('admin:docs.platforms.all')}</SelectItem>
              <SelectItem value="WINDOWS">{t('admin:docs.platforms.windows')}</SelectItem>
              <SelectItem value="MACOS">{t('admin:docs.platforms.macos')}</SelectItem>
              <SelectItem value="IOS">{t('admin:docs.platforms.ios')}</SelectItem>
              <SelectItem value="ANDROID">{t('admin:docs.platforms.android')}</SelectItem>
              <SelectItem value="ROUTER">{t('admin:docs.platforms.router')}</SelectItem>
              <SelectItem value="FAQ">{t('admin:docs.platforms.faq')}</SelectItem>
              <SelectItem value="GENERAL">{t('admin:docs.platforms.general')}</SelectItem>
            </SelectContent>
          </Select>

          <Select value={localeFilter} onValueChange={setLocaleFilter}>
            <SelectTrigger className="w-[120px] h-8 text-xs">
              <SelectValue placeholder={t('admin:docs.allLocales')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{t('admin:docs.allLocales')}</SelectItem>
              <SelectItem value="zh-CN">简体中文</SelectItem>
              <SelectItem value="en-US">English</SelectItem>
              <SelectItem value="ja-JP">日本語</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
          <Input
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            placeholder={t('admin:docs.searchPlaceholder')}
            className="pl-8 h-8 text-xs"
          />
        </div>
      </div>

      {/* 文档列表表格 */}
      <div className="rounded-xl border border-border bg-card shadow-2xs overflow-hidden">
        {isLoading ? (
          <div className="py-20 text-center text-xs text-muted-foreground">{t('admin:docs.loading')}</div>
        ) : articles.length === 0 ? (
          <EmptyState
            title={t('admin:docs.emptyTitle')}
            description={t('admin:docs.emptyDesc')}
            action={
              <Button size="sm" variant="outline" onClick={handleOpenCreate} className="gap-1.5 text-xs">
                <Plus className="size-3.5" />
                <span>{t('admin:docs.createNow')}</span>
              </Button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-border bg-muted/40 font-semibold text-muted-foreground">
                  <th className="py-3 px-4">{t('admin:docs.table.title')}</th>
                  <th className="py-3 px-4">{t('admin:docs.table.platformClient')}</th>
                  <th className="py-3 px-4">{t('admin:docs.table.slug')}</th>
                  <th className="py-3 px-4">{t('admin:docs.table.sort')}</th>
                  <th className="py-3 px-4">{t('admin:docs.table.locale')}</th>
                  <th className="py-3 px-4">{t('admin:docs.table.status')}</th>
                  <th className="py-3 px-4">{t('admin:docs.table.updatedAt')}</th>
                  <th className="py-3 px-4 text-right">{t('admin:docs.table.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {articles.map((article) => {
                  const IconComp = getPlatformIcon(article.platform, article.icon);

                  return (
                    <tr key={article.id} className="hover:bg-muted/30 transition-colors">
                      <td className="py-3 px-4 max-w-[280px]">
                        <div className="flex items-start gap-2.5">
                          <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-foreground/80">
                            <IconComp className="size-3.5" />
                          </span>
                          <div className="min-w-0">
                            <div className="font-semibold text-foreground truncate" title={article.title}>
                              {article.title}
                            </div>
                            {article.summary && (
                              <div className="text-[11px] text-muted-foreground truncate mt-0.5" title={article.summary}>
                                {article.summary}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 font-normal">
                            {article.platform}
                          </Badge>
                          {article.clientName && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 font-normal border-primary/30 text-primary">
                              {article.clientName}
                            </Badge>
                          )}
                        </div>
                      </td>

                      {/* Slug 标识列：优化等宽样式与纯图标独立复制按钮，杜绝文字遮挡与换行 */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5 font-mono text-[11px] bg-muted/40 border border-border/70 px-2 py-0.5 rounded-md text-foreground/90">
                          <span className="select-all">{article.slug}</span>
                          <IconButton
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            className="shrink-0 rounded text-muted-foreground hover:text-foreground"
                            title={t('admin:docs.copySlug')}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopySlug(article.slug);
                            }} aria-label={t('admin:docs.copySlug')}
                          >
                            <Copy className="size-4" />
                          </IconButton>
                        </div>
                      </td>

                      <td className="py-3 px-4 font-mono text-muted-foreground">
                        {article.sortOrder}
                      </td>

                      <td className="py-3 px-4">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 font-mono font-normal">
                          {article.locale}
                        </Badge>
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={article.isPublished}
                            onCheckedChange={(checked) => handleTogglePublish(article, checked)}
                            aria-label={t('admin:docs.table.status')}
                          />
                          <span className={`text-[11px] ${article.isPublished ? 'text-emerald-600 dark:text-emerald-400 font-medium' : 'text-muted-foreground'}`}>
                            {article.isPublished ? t('admin:docs.table.published') : t('admin:docs.table.draft')}
                          </span>
                        </div>
                      </td>

                      <td className="py-3 px-4 text-muted-foreground whitespace-nowrap text-[11px]">
                        {formatDateTime(article.updatedAt)}
                      </td>

                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          <IconButton
                            variant="ghost"
                            size="icon-sm"
                            className="text-muted-foreground hover:text-foreground"
                            onClick={() => handleOpenEdit(article)}
                            title={t('admin:docs.edit')} aria-label={t('admin:docs.edit')}
                          >
                            <Edit className="size-4" />
                          </IconButton>

                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <IconButton
                                variant="ghost"
                                size="icon-sm"
                                className="text-muted-foreground hover:text-destructive"
                                title={t('admin:docs.delete')} aria-label={t('admin:docs.delete')}
                              >
                                <Trash2 className="size-4" />
                              </IconButton>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>{t('admin:docs.deleteConfirmTitle')}</AlertDialogTitle>
                                <AlertDialogDescription>
                                  {t('admin:docs.deleteConfirm', { title: article.title })}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>{t('common:actions.cancel')}</AlertDialogCancel>
                                <AlertDialogAction
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  onClick={() => deleteMutation.mutate(article.id)}
                                >
                                  {t('common:actions.delete')}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 新建/编辑文档分屏弹窗 */}
      <DocEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        article={editingArticle}
        onSave={handleSave}
        isSaving={createMutation.isPending || updateMutation.isPending}
      />
    </PageContainer>
  );
}
