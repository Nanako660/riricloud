import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
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
function isJsonArray(value: string) { try { return Array.isArray(JSON.parse(value)); } catch { return false; } }
function isJsonObject(value: string) { try { const parsed = JSON.parse(value); return !!parsed && typeof parsed === 'object' && !Array.isArray(parsed); } catch { return false; } }

export function TemplateFormDialog({ open, onOpenChange, template }: { open: boolean; onOpenChange: (open: boolean) => void; template: SubscriptionTemplate | null }) {
  const { create, update } = useTemplateMutations();
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { name: '', description: '', proxyGroups: '[]', ruleSets: '[]', dnsConfig: '{}', customInjectYaml: '', customInjectJson: '', isDefault: false } });
  useEffect(() => {
    if (!open) return;
    form.reset(template ? { name: template.name, description: template.description ?? '', proxyGroups: JSON.stringify(template.proxyGroups, null, 2), ruleSets: JSON.stringify(template.ruleSets, null, 2), dnsConfig: JSON.stringify(template.dnsConfig, null, 2), customInjectYaml: template.customInjectYaml ?? '', customInjectJson: template.customInjectJson ?? '', isDefault: template.isDefault } : undefined);
  }, [open, template, form]);
  const submit = (values: FormValues) => {
    const payload: TemplatePayload = { name: values.name, description: values.description, proxyGroups: JSON.parse(values.proxyGroups), ruleSets: JSON.parse(values.ruleSets), dnsConfig: JSON.parse(values.dnsConfig), customInjectYaml: values.customInjectYaml || null, customInjectJson: values.customInjectJson || null, isDefault: values.isDefault };
    if (template) {
      update.mutate({ id: template.id, ...payload }, { onSuccess: () => onOpenChange(false) });
    } else {
      create.mutate(payload, { onSuccess: () => onOpenChange(false) });
    }
  };
  const busy = create.isPending || update.isPending;
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto"><DialogHeader><DialogTitle>{template ? '编辑订阅模板' : '新建订阅模板'}</DialogTitle><DialogDescription>用 JSON 配置策略组和规则集，YAML/JSON 覆写用于高级定制。</DialogDescription></DialogHeader><form onSubmit={form.handleSubmit(submit)} className="space-y-4"><div className="space-y-2"><Label htmlFor="template-name">模板名称</Label><Input id="template-name" {...form.register('name')} />{form.formState.errors.name && <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>}</div><div className="space-y-2"><Label htmlFor="template-description">描述</Label><Input id="template-description" {...form.register('description')} /></div><div className="grid gap-4 md:grid-cols-2"><div className="space-y-2"><Label htmlFor="template-groups">策略组 JSON</Label><Textarea id="template-groups" className="min-h-40 font-mono text-xs" {...form.register('proxyGroups')} />{form.formState.errors.proxyGroups && <p className="text-xs text-destructive">{form.formState.errors.proxyGroups.message}</p>}</div><div className="space-y-2"><Label htmlFor="template-rules">规则集 JSON</Label><Textarea id="template-rules" className="min-h-40 font-mono text-xs" {...form.register('ruleSets')} />{form.formState.errors.ruleSets && <p className="text-xs text-destructive">{form.formState.errors.ruleSets.message}</p>}</div></div><div className="space-y-2"><Label htmlFor="template-dns">DNS JSON</Label><Textarea id="template-dns" className="min-h-24 font-mono text-xs" {...form.register('dnsConfig')} />{form.formState.errors.dnsConfig && <p className="text-xs text-destructive">{form.formState.errors.dnsConfig.message}</p>}</div><div className="grid gap-4 md:grid-cols-2"><div className="space-y-2"><Label htmlFor="template-yaml">Clash YAML 覆写</Label><Textarea id="template-yaml" className="min-h-32 font-mono text-xs" placeholder={'mixed-port: 7891'} {...form.register('customInjectYaml')} /></div><div className="space-y-2"><Label htmlFor="template-json">Sing-box JSON 覆写</Label><Textarea id="template-json" className="min-h-32 font-mono text-xs" placeholder={'{"log":{"level":"debug"}}'} {...form.register('customInjectJson')} />{form.formState.errors.customInjectJson && <p className="text-xs text-destructive">{form.formState.errors.customInjectJson.message}</p>}</div></div><div className="flex items-center gap-3"><Switch checked={form.watch('isDefault')} onCheckedChange={(checked) => form.setValue('isDefault', checked)} /><Label>设为全局默认模板</Label></div><DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>取消</Button><Button type="submit" disabled={busy}>{busy ? '保存中…' : '保存模板'}</Button></DialogFooter></form></DialogContent></Dialog>;
}
