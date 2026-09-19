import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTheme } from 'next-themes';
import CodeMirror from '@uiw/react-codemirror';
import { EditorView } from '@codemirror/view';
import { MarkdownRenderer } from '@/components/shared/markdown-renderer';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useFormResetOnKey } from '@/hooks/use-form-reset';
import {
  Columns2,
  Eye,
  FileCode2,
  Save
} from 'lucide-react';
import type { AdminHelpArticle, AdminHelpArticlePayload } from '../use-admin-docs';

const articleSchema = z.object({
  slug: z
    .string()
    .min(2, 'Slug 至少 2 个字符')
    .max(64, 'Slug 最多 64 个字符')
    .regex(/^[a-z0-9-]+$/, 'Slug 仅限小写字母、数字和连字符'),
  title: z.string().min(2, '标题至少 2 个字符').max(128, '标题最多 128 个字符'),
  platform: z.string().default('ALL'),
  clientName: z.string().max(64).optional(),
  icon: z.string().max(64).optional(),
  summary: z.string().max(255).optional(),
  content: z.string().min(1, '正文内容不能为空'),
  sortOrder: z.coerce.number().int().default(0),
  isPublished: z.boolean().default(true),
  locale: z.string().default('zh-CN')
});

type ArticleFormValues = z.infer<typeof articleSchema>;

interface DocEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  article: AdminHelpArticle | null;
  onSave: (payload: AdminHelpArticlePayload) => void;
  isSaving: boolean;
}

const editorScrollTheme = EditorView.theme({
  '&': { height: '100%', minHeight: '380px' },
  '.cm-scroller': {
    height: '100% !important',
    overflowX: 'auto',
    overflowY: 'auto'
  }
});

export function DocEditorDialog({
  open,
  onOpenChange,
  article,
  onSave,
  isSaving
}: DocEditorDialogProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const [viewMode, setViewMode] = useState<'split' | 'edit' | 'preview'>('split');

  const form = useForm<ArticleFormValues>({
    resolver: zodResolver(articleSchema),
    defaultValues: {
      slug: '',
      title: '',
      platform: 'ALL',
      clientName: '',
      icon: '',
      summary: '',
      content: '# 教程标题\n\n在此输入 Markdown 内容…',
      sortOrder: 0,
      isPublished: true,
      locale: 'zh-CN'
    }
  });

  useFormResetOnKey({
    open,
    resetKey: article?.id ?? 'create',
    reset: () =>
      form.reset(
        article
          ? {
              slug: article.slug,
              title: article.title,
              platform: article.platform,
              clientName: article.clientName || '',
              icon: article.icon || '',
              summary: article.summary || '',
              content: article.content,
              sortOrder: article.sortOrder,
              isPublished: article.isPublished,
              locale: article.locale
            }
          : {
              slug: '',
              title: '',
              platform: 'ALL',
              clientName: '',
              icon: '',
              summary: '',
              content: '# 教程标题\n\n在此输入 Markdown 内容…',
              sortOrder: 0,
              isPublished: true,
              locale: 'zh-CN'
            }
      )
  });

  const insertSnippet = (snippet: string) => {
    const current = form.getValues('content');
    form.setValue('content', `${current}\n${snippet}\n`, { shouldDirty: true });
  };

  const onSubmit = (values: ArticleFormValues) => {
    onSave({
      slug: values.slug,
      title: values.title,
      platform: values.platform,
      clientName: values.clientName ? values.clientName.trim() : null,
      icon: values.icon ? values.icon.trim() : null,
      summary: values.summary ? values.summary.trim() : null,
      content: values.content,
      sortOrder: values.sortOrder,
      isPublished: values.isPublished,
      locale: values.locale
    });
  };

  const currentContent = form.watch('content');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[92vh] flex flex-col p-4 sm:p-6 overflow-hidden">
        <DialogHeader className="shrink-0 pb-2 border-b border-border/50">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-lg font-bold">
              {article ? '编辑帮助文档' : '新建帮助文档'}
            </DialogTitle>
            {/* 视图切换模式 */}
            <div className="flex items-center rounded-lg border border-border bg-muted/40 p-0.5">
              <Button
                type="button"
                variant={viewMode === 'split' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 px-2.5 text-xs gap-1"
                onClick={() => setViewMode('split')}
              >
                <Columns2 className="size-3.5" />
                <span className="hidden sm:inline">分屏预览</span>
              </Button>
              <Button
                type="button"
                variant={viewMode === 'edit' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 px-2.5 text-xs gap-1"
                onClick={() => setViewMode('edit')}
              >
                <FileCode2 className="size-3.5" />
                <span className="hidden sm:inline">纯编辑</span>
              </Button>
              <Button
                type="button"
                variant={viewMode === 'preview' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 px-2.5 text-xs gap-1"
                onClick={() => setViewMode('preview')}
              >
                <Eye className="size-3.5" />
                <span className="hidden sm:inline">纯预览</span>
              </Button>
            </div>
          </div>
          <DialogDescription className="text-xs">
            支持标准 Markdown 语法、GFM 表格、GitHub Alert 提示块以及专属动态订阅占位符。
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col flex-1 min-h-0 space-y-4 pt-2">
            {/* 基础元数据网格 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs shrink-0">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem className="space-y-1 sm:col-span-2">
                    <FormLabel className="text-xs">文档标题 *</FormLabel>
                    <FormControl>
                      <Input placeholder="如：Windows 新手指南：Clash Verge Rev 安装" className="h-8 text-xs" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="slug"
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <FormLabel className="text-xs">唯一 Slug *</FormLabel>
                    <FormControl>
                      <Input placeholder="如：windows-clash-verge" className="h-8 text-xs font-mono" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="platform"
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <FormLabel className="text-xs">平台分类</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="选择分类" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="ALL">通用 (ALL)</SelectItem>
                        <SelectItem value="WINDOWS">Windows</SelectItem>
                        <SelectItem value="MACOS">macOS</SelectItem>
                        <SelectItem value="IOS">iOS (苹果)</SelectItem>
                        <SelectItem value="ANDROID">Android (安卓)</SelectItem>
                        <SelectItem value="ROUTER">路由器 (Router)</SelectItem>
                        <SelectItem value="FAQ">常见排错 (FAQ)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="clientName"
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <FormLabel className="text-xs">客户端名称 (选填)</FormLabel>
                    <FormControl>
                      <Input placeholder="如：Clash Verge Rev" className="h-8 text-xs" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="icon"
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <FormLabel className="text-xs">图标标识 (选填)</FormLabel>
                    <FormControl>
                      <Input placeholder="如：Monitor, Laptop, Smartphone" className="h-8 text-xs" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="sortOrder"
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <FormLabel className="text-xs">排序权重 (越小越靠前)</FormLabel>
                    <FormControl>
                      <Input type="number" className="h-8 text-xs" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="locale"
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <FormLabel className="text-xs">语言版本</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="语言" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="zh-CN">简体中文 (zh-CN)</SelectItem>
                        <SelectItem value="en-US">English (en-US)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="summary"
                render={({ field }) => (
                  <FormItem className="space-y-1 sm:col-span-3">
                    <FormLabel className="text-xs">简要说明</FormLabel>
                    <FormControl>
                      <Input placeholder="简短摘要，展示在目录卡片下方" className="h-8 text-xs" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="isPublished"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border border-border p-2 space-y-0 mt-3">
                    <div className="space-y-0.5">
                      <FormLabel className="text-xs">上架发布</FormLabel>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            {/* 动态占位符与语法快捷插入工具栏 */}
            <div className="flex flex-wrap items-center gap-1.5 p-2 rounded-lg bg-muted/30 border border-border text-xs shrink-0">
              <span className="text-muted-foreground text-[11px] font-medium mr-1">快捷插入:</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-6 text-[11px] px-2 font-mono"
                onClick={() => insertSnippet('`{{subscription_url}}`')}
              >
                + 专属订阅链接
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-6 text-[11px] px-2 font-mono"
                onClick={() => insertSnippet('[一键导入到 Clash](clash://install-config?url={{clash_import_url}}&name={{site_name}})')}
              >
                + Clash 导入按钮
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-6 text-[11px] px-2 font-mono"
                onClick={() => insertSnippet('[一键导入到 Shadowrocket](shadowrocket://add/sub://{{shadowrocket_import_url}}?title={{site_name}})')}
              >
                + 小火箭导入按钮
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-6 text-[11px] px-2 font-mono"
                onClick={() => insertSnippet('> [!NOTE]\n> 这里填写需要提醒新手的关键注意事项。')}
              >
                + Note 提示框
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-6 text-[11px] px-2 font-mono"
                onClick={() => insertSnippet('> [!TIP]\n> 这里填写实用操作技巧或快捷键。')}
              >
                + Tip 技巧框
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-6 text-[11px] px-2 font-mono"
                onClick={() => insertSnippet('> [!WARNING]\n> 这里填写重要警告，避免用户误操作。')}
              >
                + Warning 警告框
              </Button>
            </div>

            {/* 编辑与预览容器 */}
            <div className="flex-1 min-h-[360px] grid grid-cols-1 lg:grid-cols-12 gap-4 border border-border rounded-lg overflow-hidden bg-background">
              {/* 编辑区 */}
              {(viewMode === 'split' || viewMode === 'edit') && (
                <div className={`${viewMode === 'split' ? 'lg:col-span-6 border-b lg:border-b-0 lg:border-r border-border' : 'lg:col-span-12'} flex flex-col h-full overflow-hidden`}>
                  <div className="px-3 py-1.5 bg-muted/50 border-b border-border text-[11px] font-semibold text-muted-foreground flex items-center justify-between shrink-0">
                    <span>Markdown 源码</span>
                    <Badge variant="outline" className="text-[10px] h-4">
                      {currentContent.length} 字符
                    </Badge>
                  </div>
                  <div className="flex-1 overflow-auto">
                    <FormField
                      control={form.control}
                      name="content"
                      render={({ field }) => (
                        <CodeMirror
                          value={field.value}
                          height="100%"
                          theme={isDark ? 'dark' : 'light'}
                          extensions={[editorScrollTheme]}
                          onChange={(val) => field.onChange(val)}
                          className="h-full text-xs font-mono"
                        />
                      )}
                    />
                  </div>
                </div>
              )}

              {/* 实时渲染预览区 */}
              {(viewMode === 'split' || viewMode === 'preview') && (
                <div className={`${viewMode === 'split' ? 'lg:col-span-6' : 'lg:col-span-12'} flex flex-col h-full overflow-hidden`}>
                  <div className="px-3 py-1.5 bg-muted/50 border-b border-border text-[11px] font-semibold text-muted-foreground flex items-center justify-between shrink-0">
                    <span>实时排版预览效果</span>
                    <Badge variant="secondary" className="text-[10px] h-4">
                      渲染预览
                    </Badge>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 bg-card/40">
                    <MarkdownRenderer content={currentContent} />
                  </div>
                </div>
              )}
            </div>

            {/* 对话框操作底栏 */}
            <DialogFooter className="shrink-0 pt-2 border-t border-border/50">
              <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                取消
              </Button>
              <Button type="submit" size="sm" disabled={isSaving} className="gap-1.5">
                <Save className="size-3.5" />
                <span>{isSaving ? '正在保存…' : '保存文档'}</span>
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
