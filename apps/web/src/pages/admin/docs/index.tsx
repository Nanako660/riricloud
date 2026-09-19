import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Copy,
  Edit,
  Plus,
  Search,
  Trash2
} from 'lucide-react';
import { PageContainer, PageHeader } from '@/components/shared/page-container';
import { EmptyState } from '@/components/shared/empty-state';
import { CopyButton } from '@/components/shared/copy-button';
import { Button } from '@/components/ui/button';
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

  const handleDuplicate = (article: AdminHelpArticle) => {
    setEditingArticle({
      ...article,
      id: '',
      slug: `${article.slug}-copy`,
      title: `${article.title} (副本)`
    });
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

  return (
    <PageContainer>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <PageHeader
          title={t('admin:docs.title', { defaultValue: '帮助文档管理' })}
          description={t('admin:docs.subtitle', {
            defaultValue: '维护面向 0 基础用户的客户端图文教程与常见排错指南，支持动态变量插值与出厂预设恢复。'
          })}
        />
        <div className="flex items-center gap-2 shrink-0">
          <ResetDefaultsDialog
            onConfirm={() => resetDefaultsMutation.mutate()}
            isPending={resetDefaultsMutation.isPending}
          />
          <Button size="sm" className="gap-1.5 shadow-xs" onClick={handleOpenCreate}>
            <Plus className="size-4" />
            <span>新建帮助文档</span>
          </Button>
        </div>
      </div>

      {/* 顶部工具栏过滤 */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 rounded-xl border border-border bg-card shadow-2xs">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={platformFilter} onValueChange={setPlatformFilter}>
            <SelectTrigger className="w-[140px] h-8 text-xs">
              <SelectValue placeholder="平台分类" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">全部平台</SelectItem>
              <SelectItem value="WINDOWS">Windows</SelectItem>
              <SelectItem value="MACOS">macOS</SelectItem>
              <SelectItem value="IOS">iOS (苹果)</SelectItem>
              <SelectItem value="ANDROID">Android (安卓)</SelectItem>
              <SelectItem value="ROUTER">路由器</SelectItem>
              <SelectItem value="FAQ">常见排错</SelectItem>
              <SelectItem value="GENERAL">通用说明</SelectItem>
            </SelectContent>
          </Select>

          <Select value={localeFilter} onValueChange={setLocaleFilter}>
            <SelectTrigger className="w-[120px] h-8 text-xs">
              <SelectValue placeholder="全部语言" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">全部语言</SelectItem>
              <SelectItem value="zh-CN">简体中文</SelectItem>
              <SelectItem value="en-US">English</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
          <Input
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            placeholder="搜索文档标题或 slug…"
            className="pl-8 h-8 text-xs"
          />
        </div>
      </div>

      {/* 文档列表表格 */}
      <div className="rounded-xl border border-border bg-card shadow-2xs overflow-hidden">
        {isLoading ? (
          <div className="py-20 text-center text-xs text-muted-foreground">正在加载文档列表…</div>
        ) : articles.length === 0 ? (
          <EmptyState
            title="暂无帮助文档"
            description="您可以点击右上角「新建帮助文档」，或者点击「恢复官方预设」灌入标准新手教程。"
            action={
              <Button size="sm" variant="outline" onClick={handleOpenCreate} className="gap-1.5 text-xs">
                <Plus className="size-3.5" />
                <span>立即新建</span>
              </Button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-border bg-muted/40 font-semibold text-muted-foreground">
                  <th className="py-3 px-4">标题与摘要</th>
                  <th className="py-3 px-4">平台 / 客户端</th>
                  <th className="py-3 px-4">Slug 标识</th>
                  <th className="py-3 px-4">排序</th>
                  <th className="py-3 px-4">语言</th>
                  <th className="py-3 px-4">发布状态</th>
                  <th className="py-3 px-4">更新时间</th>
                  <th className="py-3 px-4 text-right">操作</th>
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

                      <td className="py-3 px-4">
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

                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1 font-mono text-[11px] text-muted-foreground">
                          <span className="truncate max-w-[120px]">{article.slug}</span>
                          <CopyButton value={article.slug} className="size-5" />
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

                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={article.isPublished}
                            onCheckedChange={(checked) => handleTogglePublish(article, checked)}
                            aria-label="发布开关"
                          />
                          <span className={`text-[11px] ${article.isPublished ? 'text-emerald-600 font-medium' : 'text-muted-foreground'}`}>
                            {article.isPublished ? '已发布' : '草稿'}
                          </span>
                        </div>
                      </td>

                      <td className="py-3 px-4 text-muted-foreground whitespace-nowrap text-[11px]">
                        {formatDateTime(article.updatedAt)}
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 text-muted-foreground hover:text-foreground"
                            onClick={() => handleOpenEdit(article)}
                            title="编辑"
                          >
                            <Edit className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 text-muted-foreground hover:text-foreground"
                            onClick={() => handleDuplicate(article)}
                            title="复制副本"
                          >
                            <Copy className="size-3.5" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-7 text-muted-foreground hover:text-destructive"
                                title="删除"
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>删除文档《{article.title}》？</AlertDialogTitle>
                                <AlertDialogDescription className="text-xs">
                                  删除后该文档将立即从用户侧帮助中心移除。此操作不可逆。
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>取消</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => deleteMutation.mutate(article.id)}
                                  className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                                >
                                  确认删除
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

      {/* 编辑弹窗 */}
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
