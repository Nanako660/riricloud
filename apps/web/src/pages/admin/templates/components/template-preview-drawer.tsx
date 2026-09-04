import { useEffect, useMemo, useState } from 'react';
import { json } from '@codemirror/lang-json';
import { yaml } from '@codemirror/lang-yaml';
import { Copy, Eye, LoaderCircle } from 'lucide-react';
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
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2"><Tabs value={format} onValueChange={(value) => setFormat(value as 'clash' | 'singbox')}><TabsList><TabsTrigger value="clash">Clash YAML</TabsTrigger><TabsTrigger value="singbox">Sing-box JSON</TabsTrigger></TabsList></Tabs>{result && <PreviewActions result={result} />}</div>
      {result && <div className="flex shrink-0 flex-wrap gap-2 text-xs"><Badge variant="secondary">节点 {result.stats.totalNodes}</Badge><Badge variant="secondary">命中 {result.stats.matchedNodes}</Badge><Badge variant="secondary">策略组 {result.stats.proxyGroupsCount}</Badge><Badge variant="secondary">规则 {result.stats.rulesCount}</Badge></div>}
      <div className="min-h-[360px] min-w-0 flex-1 overflow-hidden rounded-md border bg-background shadow-sm">
        {preview.isPending ? <div className="flex h-full min-h-[360px] items-center justify-center text-sm text-muted-foreground"><LoaderCircle className="mr-2 size-4 animate-spin" />渲染中…</div> : result ? <TemplateCodeEditor value={result.content} height="100%" className="h-full" extensions={format === 'singbox' ? [json()] : [yaml()]} readOnly basicSetup={{ lineNumbers: true, foldGutter: true }} /> : <div className="flex h-full min-h-[360px] items-center justify-center text-sm text-muted-foreground">调整模板配置后将在这里显示渲染结果。</div>}
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
