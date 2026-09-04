import { zodResolver } from '@hookform/resolvers/zod';
import { json } from '@codemirror/lang-json';
import { yaml } from '@codemirror/lang-yaml';
import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ResponsiveDialog, ResponsiveDialogContent } from '@/components/shared/responsive-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TemplateGroupsEditor } from './template-groups-editor';
import { TemplateRulesEditor } from './template-rules-editor';
import { TemplateCodeEditor } from './template-code-editor';
import { TemplatePreviewPanel } from './template-preview-drawer';
import { SubscriptionTemplate, TemplatePayload, useTemplateMutations } from '../use-templates';

const schema = z.object({
  name: z.string().min(1, '请输入模板名称'),
  description: z.string().optional(),
  proxyGroups: z.string().refine((value) => isJsonArray(value), '必须是 JSON 数组'),
  ruleSets: z.string().refine((value) => isJsonArray(value), '必须是 JSON 数组'),
  dnsConfig: z.string().refine((value) => isJsonObject(value), '必须是 JSON 对象'),
  customInjectYaml: z.string().optional(),
  customInjectJson: z.string().refine((value) => !value.trim() || isJsonObject(value), '必须是 JSON 对象'),
  isDefault: z.boolean()
});
type FormValues = z.infer<typeof schema>;

function isJsonArray(value: string) {
  try { return Array.isArray(JSON.parse(value)); } catch { return false; }
}

function isJsonObject(value: string) {
  try { const parsed = JSON.parse(value); return !!parsed && typeof parsed === 'object' && !Array.isArray(parsed); } catch { return false; }
}

function parseArray(value: string): unknown[] {
  try { const parsed: unknown = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
}

function parseObject(value: string): Record<string, unknown> {
  try { const parsed: unknown = JSON.parse(value); return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}; } catch { return {}; }
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function normalizeDns(value: Record<string, unknown>): Record<string, unknown> {
  if ('directDns' in value || 'proxyDns' in value || 'fakeIp' in value) return value;
  const nameserver = Array.isArray(value.nameserver) ? value.nameserver.filter((item): item is string => typeof item === 'string') : [];
  const fallback = Array.isArray(value.fallback) ? value.fallback.filter((item): item is string => typeof item === 'string') : [];
  return {
    enable: value.enable !== false,
    fakeIp: value['enhanced-mode'] === 'fake-ip' || value['fake-ip-range'] !== undefined,
    directDns: nameserver.slice(0, 1),
    proxyDns: fallback.length ? fallback : nameserver.slice(1),
    ipv6: value.ipv6 !== false
  };
}

const defaultDns = JSON.stringify({ enable: true, fakeIp: true, directDns: ['223.5.5.5'], proxyDns: ['https://1.1.1.1/dns-query'], ipv6: false }, null, 2);

export function TemplateFormDialog({ open, onOpenChange, template }: { open: boolean; onOpenChange: (open: boolean) => void; template: SubscriptionTemplate | null }) {
  const { create, update } = useTemplateMutations();
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { name: '', description: '', proxyGroups: '[]', ruleSets: '[]', dnsConfig: defaultDns, customInjectYaml: '', customInjectJson: '', isDefault: false } });
  const watchedGroups = form.watch('proxyGroups');
  const watchedRules = form.watch('ruleSets');
  const watchedDns = form.watch('dnsConfig');
  const watchedValues = form.watch();
  const dnsDraft = parseObject(watchedDns);

  useEffect(() => {
    if (!open) return;
    form.reset(template ? {
      name: template.name,
      description: template.description ?? '',
      proxyGroups: JSON.stringify(template.proxyGroups, null, 2),
      ruleSets: JSON.stringify(template.ruleSets, null, 2),
      dnsConfig: JSON.stringify(normalizeDns(template.dnsConfig), null, 2),
      customInjectYaml: template.customInjectYaml ?? '',
      customInjectJson: template.customInjectJson ?? '',
      isDefault: template.isDefault
    } : undefined);
  }, [open, template, form]);

  const targets = useMemo(() => parseArray(watchedGroups).map((item) => item && typeof item === 'object' && !Array.isArray(item) && typeof (item as Record<string, unknown>).name === 'string' ? (item as Record<string, unknown>).name as string : '').filter(Boolean), [watchedGroups]);
  const previewTemplate = useMemo<TemplatePayload>(() => ({
    name: watchedValues.name,
    description: watchedValues.description,
    proxyGroups: parseArray(watchedValues.proxyGroups),
    ruleSets: parseArray(watchedValues.ruleSets),
    dnsConfig: parseObject(watchedValues.dnsConfig),
    customInjectYaml: watchedValues.customInjectYaml || null,
    customInjectJson: watchedValues.customInjectJson || null,
    isDefault: watchedValues.isDefault
  }), [watchedValues]);

  const submit = (values: FormValues) => {
    const payload: TemplatePayload = {
      name: values.name,
      description: values.description,
      proxyGroups: JSON.parse(values.proxyGroups),
      ruleSets: JSON.parse(values.ruleSets),
      dnsConfig: JSON.parse(values.dnsConfig),
      customInjectYaml: values.customInjectYaml || null,
      customInjectJson: values.customInjectJson || null,
      isDefault: values.isDefault
    };
    if (template) update.mutate({ id: template.id, ...payload }, { onSuccess: () => onOpenChange(false) });
    else create.mutate(payload, { onSuccess: () => onOpenChange(false) });
  };

  const busy = create.isPending || update.isPending;
  const setJsonArray = (field: 'proxyGroups' | 'ruleSets', value: unknown[]) => form.setValue(field, JSON.stringify(value, null, 2), { shouldDirty: true, shouldValidate: true });
  const setDns = (patch: Record<string, unknown>) => form.setValue('dnsConfig', JSON.stringify({ ...parseObject(watchedDns), ...patch }, null, 2), { shouldDirty: true, shouldValidate: true });

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent size="wide" className="!flex min-h-0 min-w-0 flex-col overflow-hidden md:h-[calc(100dvh-2rem)] md:max-h-[94dvh]">
        <DialogHeader className="shrink-0">
          <DialogTitle>{template ? '编辑订阅模板' : '新建订阅模板'}</DialogTitle>
          <DialogDescription>用结构化工作台维护策略组、分流规则、DNS 与客户端覆写。</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(submit)} className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-hidden">
          <Tabs defaultValue="basic" className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
            <TabsList className="h-auto w-full shrink-0 justify-start gap-1 overflow-x-auto p-1">
              <TabsTrigger className="shrink-0" value="basic">基本信息</TabsTrigger>
              <TabsTrigger className="shrink-0" value="groups">策略组设计</TabsTrigger>
              <TabsTrigger className="shrink-0" value="rules">分流规则</TabsTrigger>
              <TabsTrigger className="shrink-0" value="dns">DNS 与高级覆写</TabsTrigger>
              <TabsTrigger className="shrink-0" value="preview">实时渲染预览</TabsTrigger>
            </TabsList>
            <TabsContent value="basic" className="min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2"><Label htmlFor="template-name">模板名称</Label><Input id="template-name" {...form.register('name')} />{form.formState.errors.name && <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>}</div>
                <div className="space-y-2"><Label htmlFor="template-description">描述</Label><Input id="template-description" {...form.register('description')} /></div>
              </div>
              <div className="flex items-center gap-3 rounded-md border p-3"><Switch checked={form.watch('isDefault')} onCheckedChange={(checked) => form.setValue('isDefault', checked, { shouldDirty: true })} /><div><Label>设为全局默认模板</Label><p className="text-xs text-muted-foreground">保存后会同步系统设置中的默认模板。</p></div></div>
            </TabsContent>
            <TabsContent value="groups" className="data-[state=active]:flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              <TemplateGroupsEditor value={parseArray(watchedGroups)} onChange={(value) => setJsonArray('proxyGroups', value)} />
              {form.formState.errors.proxyGroups && <p className="shrink-0 text-xs text-destructive">{form.formState.errors.proxyGroups.message}</p>}
            </TabsContent>
            <TabsContent value="rules" className="data-[state=active]:flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              <TemplateRulesEditor value={parseArray(watchedRules)} targets={targets} onChange={(value) => setJsonArray('ruleSets', value)} />
              {form.formState.errors.ruleSets && <p className="shrink-0 text-xs text-destructive">{form.formState.errors.ruleSets.message}</p>}
            </TabsContent>
            <TabsContent value="dns" className="data-[state=active]:flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto">
              <div className="grid shrink-0 gap-4 sm:grid-cols-2">
                <div className="flex items-center gap-3 rounded-md border p-3"><Switch checked={dnsDraft.enable !== false} onCheckedChange={(checked) => setDns({ enable: checked })} /><Label>启用 DNS 分流</Label></div>
                <div className="flex items-center gap-3 rounded-md border p-3"><Switch checked={dnsDraft.fakeIp === true} onCheckedChange={(checked) => setDns({ fakeIp: checked })} /><Label>启用 Fake-IP</Label></div>
                <div className="flex items-center gap-3 rounded-md border p-3"><Switch checked={dnsDraft.ipv6 !== false} onCheckedChange={(checked) => setDns({ ipv6: checked })} /><Label>启用 IPv6</Label></div>
                <div className="space-y-2"><Label>国内直连 DNS</Label><Input value={stringList(dnsDraft.directDns).join(', ')} onChange={(event) => setDns({ directDns: event.target.value.split(',').map((item) => item.trim()).filter(Boolean) })} placeholder="223.5.5.5, https://..." /></div>
                <div className="space-y-2 sm:col-span-2"><Label>远程代理 DNS</Label><Input value={stringList(dnsDraft.proxyDns).join(', ')} onChange={(event) => setDns({ proxyDns: event.target.value.split(',').map((item) => item.trim()).filter(Boolean) })} placeholder="https://1.1.1.1/dns-query" /></div>
              </div>
              <div className="grid min-h-0 min-w-0 flex-1 gap-4 md:grid-cols-2">
                <div className="flex min-h-[220px] min-w-0 flex-col gap-2"><Label className="shrink-0">Clash YAML 顶层覆写</Label><div className="min-h-0 min-w-0 flex-1 overflow-hidden rounded-md border bg-background shadow-sm"><TemplateCodeEditor value={watchedValues.customInjectYaml} height="100%" className="h-full" extensions={[yaml()]} basicSetup={{ lineNumbers: true, foldGutter: true }} onChange={(value) => form.setValue('customInjectYaml', value, { shouldDirty: true })} /></div></div>
                <div className="flex min-h-[220px] min-w-0 flex-col gap-2"><Label className="shrink-0">Sing-box JSON 顶层覆写</Label><div className="min-h-0 min-w-0 flex-1 overflow-hidden rounded-md border bg-background shadow-sm"><TemplateCodeEditor value={watchedValues.customInjectJson} height="100%" className="h-full" extensions={[json()]} basicSetup={{ lineNumbers: true, foldGutter: true }} onChange={(value) => form.setValue('customInjectJson', value, { shouldDirty: true, shouldValidate: true })} /></div>{form.formState.errors.customInjectJson && <p className="shrink-0 text-xs text-destructive">{form.formState.errors.customInjectJson.message}</p>}</div>
              </div>
              {form.formState.errors.dnsConfig && <p className="text-xs text-destructive">{form.formState.errors.dnsConfig.message}</p>}
            </TabsContent>
            <TabsContent value="preview" className="data-[state=active]:flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"><TemplatePreviewPanel template={previewTemplate} /></TabsContent>
          </Tabs>
          <DialogFooter className="shrink-0"><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>取消</Button><Button type="submit" disabled={busy}>{busy ? '保存中…' : '保存模板'}</Button></DialogFooter>
        </form>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
