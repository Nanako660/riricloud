import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo, useState } from 'react';
import { useFormResetOnKey } from '@/hooks/use-form-reset';
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
import { TemplateDnsEditor, SemanticDnsConfig } from './template-dns-editor';
import { TemplateOverrideEditor } from './template-override-editor';
import { TemplateSourceEditor } from './template-source-editor';
import { TemplatePreviewDrawer } from './template-preview-drawer';
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

function normalizeDns(value: Record<string, unknown>): Record<string, unknown> {
  if ('directDns' in value || 'proxyDns' in value || 'fakeIp' in value) return value;
  const nameserver = Array.isArray(value.nameserver) ? value.nameserver.filter((item): item is string => typeof item === 'string') : [];
  const fallback = Array.isArray(value.fallback) ? value.fallback.filter((item): item is string => typeof item === 'string') : [];
  return {
    enable: value.enable !== false,
    fakeIp: value['enhanced-mode'] === 'fake-ip' || value['fake-ip-range'] !== undefined,
    directDns: nameserver.length ? (fallback.length ? nameserver : [nameserver[0]]) : [],
    proxyDns: fallback.length ? fallback : nameserver.slice(1),
    ipv6: value.ipv6 !== false
  };
}

const defaultDns = JSON.stringify({ enable: true, fakeIp: true, directDns: ['https://223.5.5.5/dns-query', '223.5.5.5'], proxyDns: ['https://1.1.1.1/dns-query', 'https://8.8.8.8/dns-query', 'https://9.9.9.9/dns-query'], ipv6: false }, null, 2);

export function TemplateFormDialog({ open, onOpenChange, template }: { open: boolean; onOpenChange: (open: boolean) => void; template: SubscriptionTemplate | null }) {
  const { create, update } = useTemplateMutations();
  const [previewDrawerOpen, setPreviewDrawerOpen] = useState(false);
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { name: '', description: '', proxyGroups: '[]', ruleSets: '[]', dnsConfig: defaultDns, customInjectYaml: '', customInjectJson: '', isDefault: false } });
  const watchedGroups = form.watch('proxyGroups');
  const watchedRules = form.watch('ruleSets');
  const watchedDns = form.watch('dnsConfig');
  const watchedValues = form.watch();

  useFormResetOnKey({
    open,
    resetKey: template?.id ?? 'create',
    reset: () => form.reset(template ? {
      name: template.name,
      description: template.description ?? '',
      proxyGroups: JSON.stringify(template.proxyGroups, null, 2),
      ruleSets: JSON.stringify(template.ruleSets, null, 2),
      dnsConfig: JSON.stringify(normalizeDns(template.dnsConfig), null, 2),
      customInjectYaml: template.customInjectYaml ?? '',
      customInjectJson: template.customInjectJson ?? '',
      isDefault: template.isDefault
    } : undefined)
  });

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

  return (
    <>
      <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
        <ResponsiveDialogContent size="wide" className="!flex min-h-0 min-w-0 flex-col overflow-hidden md:h-[calc(100dvh-2rem)] md:max-h-[94dvh]">
          <DialogHeader className="shrink-0">
            <DialogTitle>{template ? '编辑订阅模板' : '新建订阅模板'}</DialogTitle>
            <DialogDescription>用结构化工作台维护策略组、分流规则、DNS、客户端覆写与源文件。</DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(submit)} className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-hidden">
            <Tabs defaultValue="basic" className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
              <TabsList className="h-auto w-full shrink-0 justify-start gap-1 overflow-x-auto p-1">
                <TabsTrigger className="shrink-0" value="basic">基本信息</TabsTrigger>
                <TabsTrigger className="shrink-0" value="groups">策略组设计</TabsTrigger>
                <TabsTrigger className="shrink-0" value="rules">分流规则</TabsTrigger>
                <TabsTrigger className="shrink-0" value="dns">DNS 设置</TabsTrigger>
                <TabsTrigger className="shrink-0" value="override">客户端高级覆写</TabsTrigger>
                <TabsTrigger className="shrink-0" value="source">源文件编辑</TabsTrigger>
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
              <TabsContent value="dns" className="data-[state=active]:flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                <TemplateDnsEditor
                  value={parseObject(watchedDns) as SemanticDnsConfig}
                  onChange={(nextDns) => form.setValue('dnsConfig', JSON.stringify(nextDns, null, 2), { shouldDirty: true, shouldValidate: true })}
                />
                {form.formState.errors.dnsConfig && <p className="shrink-0 text-xs text-destructive">{form.formState.errors.dnsConfig.message}</p>}
              </TabsContent>
              <TabsContent value="override" className="data-[state=active]:flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                <TemplateOverrideEditor
                  yamlValue={watchedValues.customInjectYaml || ''}
                  jsonValue={watchedValues.customInjectJson || ''}
                  onYamlChange={(value) => form.setValue('customInjectYaml', value, { shouldDirty: true })}
                  onJsonChange={(value) => form.setValue('customInjectJson', value, { shouldDirty: true, shouldValidate: true })}
                  yamlError={form.formState.errors.customInjectYaml?.message}
                  jsonError={form.formState.errors.customInjectJson?.message}
                />
              </TabsContent>
              <TabsContent value="source" className="data-[state=active]:flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                <TemplateSourceEditor
                  template={previewTemplate}
                  onChange={(nextPayload) => {
                    form.setValue('name', nextPayload.name, { shouldDirty: true });
                    if (nextPayload.description !== undefined) form.setValue('description', nextPayload.description ?? '', { shouldDirty: true });
                    form.setValue('proxyGroups', JSON.stringify(nextPayload.proxyGroups, null, 2), { shouldDirty: true, shouldValidate: true });
                    form.setValue('ruleSets', JSON.stringify(nextPayload.ruleSets, null, 2), { shouldDirty: true, shouldValidate: true });
                    form.setValue('dnsConfig', JSON.stringify(nextPayload.dnsConfig, null, 2), { shouldDirty: true, shouldValidate: true });
                    form.setValue('customInjectYaml', nextPayload.customInjectYaml || '', { shouldDirty: true });
                    form.setValue('customInjectJson', nextPayload.customInjectJson || '', { shouldDirty: true, shouldValidate: true });
                    form.setValue('isDefault', nextPayload.isDefault, { shouldDirty: true });
                  }}
                  onTestRender={() => setPreviewDrawerOpen(true)}
                />
              </TabsContent>
            </Tabs>
            <DialogFooter className="shrink-0"><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>取消</Button><Button type="submit" disabled={busy}>{busy ? '保存中…' : '保存模板'}</Button></DialogFooter>
          </form>
        </ResponsiveDialogContent>
      </ResponsiveDialog>

      <TemplatePreviewDrawer
        open={previewDrawerOpen}
        onOpenChange={setPreviewDrawerOpen}
        template={previewTemplate}
        title="快速渲染与内核校验"
      />
    </>
  );
}
