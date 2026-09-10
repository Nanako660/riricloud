import { useEffect, useMemo, useState } from 'react';
import { json } from '@codemirror/lang-json';
import { yaml } from '@codemirror/lang-yaml';
import { Copy, Eye, LoaderCircle, CheckCircle2, AlertTriangle, Info } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTemplatePreview, type TemplatePayload, type TemplatePreviewResponse } from '../use-templates';
import { TemplateCodeEditor } from './template-code-editor';

export function TemplatePreviewPanel({ template }: { template: TemplatePayload }) {
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

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <Tabs value={format} onValueChange={(value) => setFormat(value as 'clash' | 'singbox')}>
          <TabsList>
            <TabsTrigger value="clash">Clash YAML</TabsTrigger>
            <TabsTrigger value="singbox">Sing-box JSON</TabsTrigger>
          </TabsList>
        </Tabs>
        {result && <PreviewActions result={result} />}
      </div>

      {result && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 text-xs">
          <Badge variant="secondary">节点 {result.stats.totalNodes}</Badge>
          <Badge variant="secondary">命中 {result.stats.matchedNodes}</Badge>
          <Badge variant="secondary">策略组 {result.stats.proxyGroupsCount}</Badge>
          <Badge variant="secondary">规则 {result.stats.rulesCount}</Badge>
          {singboxCheck && (
            <Badge
              variant={singboxCheck.passed ? 'outline' : 'destructive'}
              className="ml-auto flex items-center gap-1 font-mono text-[11px]"
            >
              {singboxCheck.executed ? (
                singboxCheck.passed ? (
                  <>
                    <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                    Sing-box 内核校验通过
                  </>
                ) : (
                  <>
                    <AlertTriangle className="h-3 w-3" />
                    Sing-box 内核报错
                  </>
                )
              ) : (
                <>
                  <Info className="h-3 w-3 text-muted-foreground" />
                  未挂载内核二进制 (纯语法校验)
                </>
              )}
            </Badge>
          )}
        </div>
      )}

      {/* 若内核报错，展示详细日志卡片 */}
      {singboxCheck?.executed && !singboxCheck.passed && singboxCheck.message && (
        <div className="shrink-0 rounded-md border border-destructive/50 bg-destructive/10 p-2.5 text-xs text-destructive">
          <div className="flex items-center gap-1.5 font-semibold text-destructive">
            <AlertTriangle className="h-4 w-4" />
            <span>Sing-box 内核诊断报错：</span>
          </div>
          <div className="mt-1.5 max-h-36 overflow-y-auto rounded bg-zinc-950/90 p-2 font-mono text-[11px] leading-relaxed text-zinc-200 dark:bg-black/60">
            {singboxCheck.message.split('\n').map((line, idx) => {
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
      )}

      <div className="min-h-[340px] min-w-0 flex-1 overflow-hidden rounded-md border bg-background shadow-sm">
        {preview.isPending ? (
          <div className="flex h-full min-h-[340px] items-center justify-center text-sm text-muted-foreground">
            <LoaderCircle className="mr-2 size-4 animate-spin" />
            渲染与校验中…
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
            调整模板配置后将在这里显示渲染结果与内核校验。
          </div>
        )}
      </div>
    </div>
  );
}

function PreviewActions({ result }: { result: TemplatePreviewResponse }) {
  return <Button type="button" variant="outline" size="sm" onClick={async () => { try { await navigator.clipboard.writeText(result.content); toast.success('配置已复制'); } catch { toast.error('复制失败，请手动选择配置'); } }}><Copy className="size-4" />复制配置</Button>;
}

export function TemplatePreviewDrawer({ open, onOpenChange, template, title = '快速预览订阅配置' }: { open: boolean; onOpenChange: (open: boolean) => void; template: TemplatePayload | null; title?: string }) {
  return <Sheet open={open} onOpenChange={onOpenChange}><SheetContent side="right" className="!flex h-full w-full flex-col overflow-hidden sm:max-w-3xl"><SheetHeader className="shrink-0"><SheetTitle className="flex items-center gap-2"><Eye className="size-4" />{title}</SheetTitle><SheetDescription>使用当前模板与可用线路生成实际客户端配置。</SheetDescription></SheetHeader><div className="mt-6 flex min-h-0 flex-1 flex-col">{template ? <TemplatePreviewPanel template={template} /> : <p className="text-sm text-muted-foreground">请选择一个模板。</p>}</div></SheetContent></Sheet>;
}
