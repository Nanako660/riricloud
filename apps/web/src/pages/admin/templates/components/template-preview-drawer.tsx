import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { json } from '@codemirror/lang-json';
import { yaml } from '@codemirror/lang-yaml';
import { Copy, Eye, LoaderCircle, CheckCircle2, AlertTriangle, Info } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTemplatePreview, type TemplatePayload, type TemplatePreviewResponse, type KernelCheckResult } from '../use-templates';
import { TemplateCodeEditor } from './template-code-editor';

export function TemplatePreviewPanel({ template }: { template: TemplatePayload }) {
  const { t } = useTranslation(['admin', 'common']);
  const [format, setFormat] = useState<'clash' | 'singbox'>('clash');
  const preview = useTemplatePreview();
  const serializedTemplate = useMemo(() => JSON.stringify(template), [template]);

  useEffect(() => {
    preview.mutate({ format, template });
    // The serialized draft is the intentional dependency: it refreshes the output as form fields change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [format, serializedTemplate]);

  const result = preview.data;
  const singboxCheck = result?.singboxCheck;
  const mihomoCheck = result?.mihomoCheck;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <Tabs value={format} onValueChange={(value) => setFormat(value as 'clash' | 'singbox')}>
          <TabsList>
            <TabsTrigger value="clash">{t('admin:templatePreview.clashTab')}</TabsTrigger>
            <TabsTrigger value="singbox">{t('admin:templatePreview.singboxTab')}</TabsTrigger>
          </TabsList>
        </Tabs>
        {result && <PreviewActions result={result} />}
      </div>

      {result && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 text-xs">
          <Badge variant="secondary">{t('admin:templatePreview.badgeTotalNodes', { count: result.stats.totalNodes })}</Badge>
          <Badge variant="secondary">{t('admin:templatePreview.badgeMatchedNodes', { count: result.stats.matchedNodes })}</Badge>
          <Badge variant="secondary">{t('admin:templatePreview.badgeProxyGroups', { count: result.stats.proxyGroupsCount })}</Badge>
          <Badge variant="secondary">{t('admin:templatePreview.badgeRules', { count: result.stats.rulesCount })}</Badge>
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <KernelStatusBadge name="Sing-box" check={singboxCheck} />
            <KernelStatusBadge name="Mihomo" check={mihomoCheck} />
          </div>
        </div>
      )}

      {/* 若内核报错，展示详细日志卡片 */}
      {singboxCheck?.executed && !singboxCheck.passed && singboxCheck.message && (
        <KernelDiagnosticCard title={t('admin:templatePreview.singboxDiagnosticTitle')} message={singboxCheck.message} />
      )}
      {mihomoCheck?.executed && !mihomoCheck.passed && mihomoCheck.message && (
        <KernelDiagnosticCard title={t('admin:templatePreview.mihomoDiagnosticTitle')} message={mihomoCheck.message} />
      )}

      <div className="min-h-[340px] min-w-0 flex-1 overflow-hidden rounded-md border bg-background shadow-sm">
        {preview.isPending ? (
          <div className="flex h-full min-h-[340px] items-center justify-center text-sm text-muted-foreground">
            <LoaderCircle className="mr-2 size-4 animate-spin" />
            {t('admin:templatePreview.rendering')}
          </div>
        ) : result ? (
          <TemplateCodeEditor
            value={result.content}
            height="100%"
            className="h-full"
            extensions={format === 'singbox' ? [json()] : [yaml()]}
            readOnly
            basicSetup={{ lineNumbers: true, foldGutter: true }}
          />
        ) : (
          <div className="flex h-full min-h-[340px] items-center justify-center text-sm text-muted-foreground">
            {t('admin:templatePreview.placeholder')}
          </div>
        )}
      </div>
    </div>
  );
}

function KernelStatusBadge({
  name,
  check
}: {
  name: string;
  check?: KernelCheckResult;
}) {
  const { t } = useTranslation(['admin', 'common']);
  if (!check) return null;
  return (
    <Badge
      variant={check.passed ? 'outline' : 'destructive'}
      className="flex items-center gap-1 font-mono text-[11px]"
    >
      {check.executed ? (
        check.passed ? (
          <>
            <CheckCircle2 className="h-3 w-3 text-emerald-500" />
            {t('admin:templatePreview.checkPassed', { name })}
          </>
        ) : (
          <>
            <AlertTriangle className="h-3 w-3" />
            {t('admin:templatePreview.checkError', { name })}
          </>
        )
      ) : (
        <>
          <Info className="h-3 w-3 text-muted-foreground" />
          {t('admin:templatePreview.checkNotMounted', { name })}
        </>
      )}
    </Badge>
  );
}

function KernelDiagnosticCard({
  title,
  message
}: {
  title: string;
  message: string;
}) {
  return (
    <div className="shrink-0 rounded-md border border-destructive/50 bg-destructive/10 p-2.5 text-xs text-destructive">
      <div className="flex items-center gap-1.5 font-semibold text-destructive">
        <AlertTriangle className="h-4 w-4" />
        <span>{title}：</span>
      </div>
      <div className="mt-1.5 max-h-36 overflow-y-auto rounded bg-zinc-950/90 p-2 font-mono text-[11px] leading-relaxed text-zinc-200 dark:bg-black/60">
        {message.split('\n').map((line, idx) => {
          const isFatal = line.includes('FATAL');
          const isError = line.includes('ERROR');
          const isWarn = line.includes('WARN');
          return (
            <div key={idx} className="flex items-start gap-1.5 py-0.5">
              {isFatal ? (
                <span className="shrink-0 rounded bg-red-600 px-1 py-0.2 text-[9px] font-bold text-white">FATAL</span>
              ) : isError ? (
                <span className="shrink-0 rounded bg-rose-500 px-1 py-0.2 text-[9px] font-bold text-white">ERROR</span>
              ) : isWarn ? (
                <span className="shrink-0 rounded bg-amber-500 px-1 py-0.2 text-[9px] font-bold text-black">WARN</span>
              ) : null}
              <span className={isFatal || isError ? 'text-red-300' : isWarn ? 'text-amber-200' : 'text-zinc-300'}>
                {line.replace(/^(FATAL|ERROR|WARN)(\[\d+\])?\s*/, '')}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PreviewActions({ result }: { result: TemplatePreviewResponse }) {
  const { t } = useTranslation(['admin', 'common']);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(result.content);
          toast.success(t('admin:templatePreview.copySuccess'));
        } catch {
          toast.error(t('admin:templatePreview.copyFailed'));
        }
      }}
    >
      <Copy className="size-4" />
      {t('admin:templatePreview.copyButton')}
    </Button>
  );
}

export function TemplatePreviewDrawer({
  open,
  onOpenChange,
  template,
  title
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: TemplatePayload | null;
  title?: string;
}) {
  const { t } = useTranslation(['admin', 'common']);
  const drawerTitle = title || t('admin:templatePreview.drawerTitle');

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="!flex h-full w-full flex-col overflow-hidden sm:max-w-3xl">
        <SheetHeader className="shrink-0">
          <SheetTitle className="flex items-center gap-2">
            <Eye className="size-4" />
            {drawerTitle}
          </SheetTitle>
          <SheetDescription>{t('admin:templatePreview.drawerDesc')}</SheetDescription>
        </SheetHeader>
        <div className="mt-6 flex min-h-0 flex-1 flex-col">
          {template ? (
            <TemplatePreviewPanel template={template} />
          ) : (
            <p className="text-sm text-muted-foreground">{t('admin:templatePreview.selectTemplatePrompt')}</p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
