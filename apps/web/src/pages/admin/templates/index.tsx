import { useState, useMemo } from 'react';
import { Copy, Eye, FileCog, MoreHorizontal, Pencil, Search, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageContainer, PageHeader } from '@/components/shared/page-container';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { IconButton } from '@/components/ui/icon-button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { TemplateFormDialog } from './components/template-form-dialog';
import { useAdminTemplates, useTemplateMutations, type SubscriptionTemplate } from './use-templates';
import { TemplatePreviewDrawer } from './components/template-preview-drawer';

export default function TemplatesPage() {
  const { t } = useTranslation(['admin', 'common']);
  const { data, isPending, isError } = useAdminTemplates();
  const { remove, duplicate } = useTemplateMutations();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<SubscriptionTemplate | null>(null);
  const [previewing, setPreviewing] = useState<SubscriptionTemplate | null>(null);
  const [deleting, setDeleting] = useState<SubscriptionTemplate | null>(null);
  const [open, setOpen] = useState(false);

  const filteredTemplates = useMemo(() => {
    if (!data) return [];
    const keyword = search.trim().toLowerCase();
    if (!keyword) return data;
    return data.filter(
      (tpl) =>
        tpl.name.toLowerCase().includes(keyword) ||
        (tpl.description && tpl.description.toLowerCase().includes(keyword))
    );
  }, [data, search]);

  if (isPending) {
    return (
      <PageContainer>
        <PageHeader title={t('admin:templates.title')} description={t('admin:templates.subtitle')} />
        <Skeleton className="h-10 w-full max-w-sm" />
        <Card>
          <CardContent className="p-4 space-y-3">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </CardContent>
        </Card>
      </PageContainer>
    );
  }

  if (isError) {
    return (
      <PageContainer>
        <PageHeader title={t('admin:templates.title')} description={t('admin:templates.subtitle')} />
        <EmptyState title={t('admin:templates.emptyTemplates')} description={t('admin:nodes.emptyFilteredDesc')} />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader title={t('admin:templates.title')} description={t('admin:templates.subtitle')} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder={t('admin:templates.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <Button className="w-full sm:w-auto" onClick={() => { setEditing(null); setOpen(true); }}>
          <FileCog className="h-4 w-4 mr-1.5" />{t('admin:templates.addTemplate')}
        </Button>
      </div>

      <Card>
        <CardContent className="min-w-0 p-0">
          {filteredTemplates.length ? (
            <Table className="min-w-[760px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[30%]">{t('admin:templates.colTemplate')}</TableHead>
                  <TableHead>{t('admin:templates.colGroupsRules')}</TableHead>
                  <TableHead>{t('admin:templates.colDns')}</TableHead>
                  <TableHead>{t('admin:templates.colOverride')}</TableHead>
                  <TableHead className="text-right">{t('admin:templates.colActions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTemplates.map((template) => (
                  <TableRow key={template.id}>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-foreground">{template.name}</span>
                          {template.isBuiltin && <Badge variant="secondary" className="text-xs">{t('admin:templates.isBuiltin')}</Badge>}
                          {template.isDefault && <Badge className="text-xs">{t('admin:templates.isDefault')}</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-1">
                          {template.description || t('admin:templates.noDesc')}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-0.5 text-xs">
                        <div>
                          <span className="text-muted-foreground">{t('admin:templates.proxyGroups')}</span>
                          <span className="font-medium tabular-nums">{template.proxyGroups.length}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">{t('admin:templates.ruleSets')}</span>
                          <span className="font-medium tabular-nums">{template.ruleSets.length}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {Object.keys(template.dnsConfig).length ? (
                        <Badge variant="outline" className="text-xs">{t('admin:templates.dnsConfigured')}</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">{t('admin:templates.dnsDefault')}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {template.customInjectYaml || template.customInjectJson ? (
                        <div className="flex flex-wrap gap-1">
                          {template.customInjectYaml && (
                            <Badge variant="secondary" className="text-[10px]">YAML</Badge>
                          )}
                          {template.customInjectJson && (
                            <Badge variant="secondary" className="text-[10px]">JSON</Badge>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <IconButton
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t('admin:templates.preview')}
                          onClick={() => setPreviewing(template)}
                        >
                          <Eye className="size-4" />
                        </IconButton>
                        <IconButton
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t('admin:templates.editTemplate')}
                          onClick={() => { setEditing(template); setOpen(true); }}
                        >
                          <Pencil className="size-4" />
                        </IconButton>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <IconButton variant="ghost" size="icon-sm" aria-label={t('admin:templates.colActions')}>
                              <MoreHorizontal className="size-4" />
                            </IconButton>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => duplicate.mutate(template.id)}
                            >
                              <Copy className="mr-2 h-4 w-4" />
                              {t('admin:templates.duplicate')}
                            </DropdownMenuItem>
                            {!template.isBuiltin && (
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => setDeleting(template)}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                {t('admin:templates.delete')}
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState
              title={search ? t('admin:nodes.emptyFiltered') : t('admin:templates.emptyTemplates')}
              description={search ? t('admin:nodes.emptyFilteredDesc') : t('admin:templates.subtitle')}
              className="border-0"
            />
          )}
        </CardContent>
      </Card>

      <TemplateFormDialog
        open={open}
        onOpenChange={setOpen}
        template={editing}
      />

      <TemplatePreviewDrawer
        open={Boolean(previewing)}
        onOpenChange={(v) => !v && setPreviewing(null)}
        template={previewing}
      />

      <AlertDialog open={Boolean(deleting)} onOpenChange={(v) => !v && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('admin:templates.deleteDialogTitle', { name: deleting?.name ?? '' })}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('admin:templates.deleteDialogDesc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common:actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (deleting) {
                  remove.mutate(deleting.id, { onSuccess: () => setDeleting(null) });
                }
              }}
            >
              {t('common:actions.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}
