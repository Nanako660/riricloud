import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { AdminNode } from '../../nodes/use-nodes';
import type { AdminLine, LinePayload } from '../use-lines';

const optionalPortSchema = z.preprocess(
  (value) => (value === '' || value === null || value === undefined ? undefined : value),
  z.coerce.number().int().min(1, '端口 1~65535').max(65535, '端口 1~65535').optional()
);

const schema = z.object({
  name: z.string().trim().min(1, '请输入线路名称'),
  type: z.enum(['DIRECT', 'RELAY']),
  relayMode: z.enum(['BLIND_FORWARD', 'PROTOCOL_PROXY']).optional(),
  entryNodeId: z.string().optional(),
  entryPort: optionalPortSchema,
  targetInboundId: z.string().min(1, '请选择目标入站'),
  endpointOverrideEnabled: z.boolean(),
  serverHost: z.string().optional(),
  serverPort: z.coerce.number().int().min(1).max(65535).optional(),
  serverName: z.string().optional(),
  host: z.string().optional(),
  trafficRate: z.coerce.number().min(0.01),
  tags: z.string().optional(),
  level: z.coerce.number().int().min(0),
  sortOrder: z.coerce.number().int().min(0),
  isPublic: z.boolean(),
  status: z.enum(['ACTIVE', 'DISABLED'])
});

type FormValues = z.infer<typeof schema>;

interface LineFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  line: AdminLine | null;
  nodes: AdminNode[];
  pending: boolean;
  onSubmit: (payload: LinePayload) => void;
}

const emptyValues: FormValues = {
  name: '',
  type: 'DIRECT',
  relayMode: 'BLIND_FORWARD',
  entryNodeId: '',
  entryPort: undefined,
  targetInboundId: '',
  endpointOverrideEnabled: false,
  serverHost: '',
  serverPort: undefined,
  serverName: '',
  host: '',
  trafficRate: 1,
  tags: '',
  level: 0,
  sortOrder: 0,
  isPublic: true,
  status: 'ACTIVE'
};

export function LineFormDialog({ open, onOpenChange, line, nodes, pending, onSubmit }: LineFormDialogProps) {
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: emptyValues });
  const type = form.watch('type');
  const endpointOverrideEnabled = form.watch('endpointOverrideEnabled');

  useEffect(() => {
    if (!open) return;
    if (!line) {
      form.reset(emptyValues);
      return;
    }
    form.reset({
      name: line.name,
      type: line.type,
      relayMode: line.relayMode ?? 'BLIND_FORWARD',
      entryNodeId: line.entryNodeId ?? '',
      entryPort: line.entryPort ?? undefined,
      targetInboundId: line.targetInboundId,
      endpointOverrideEnabled: line.endpointOverrideEnabled,
      serverHost: line.endpointOverrides?.serverHost ?? (line.endpointOverrideEnabled ? line.serverHost : ''),
      serverPort: line.endpointOverrides?.serverPort ?? (line.endpointOverrideEnabled ? line.serverPort : undefined),
      serverName: line.endpointOverrides?.serverName ?? line.serverName ?? '',
      host: line.endpointOverrides?.host ?? line.host ?? '',
      trafficRate: line.trafficRate,
      tags: line.tags.join(', '),
      level: line.level,
      sortOrder: line.sortOrder,
      isPublic: line.isPublic,
      status: line.status
    });
  }, [form, line, open]);

  const submit = (values: FormValues) => {
    if (values.type === 'RELAY' && (!values.entryNodeId || !values.relayMode)) {
      form.setError('entryNodeId', { message: '中继线路必须选择入口节点和机制' });
      return;
    }
    const savedOverrides = line?.endpointOverrides;
    const textOverride = (value: string | undefined, fallback: string | null | undefined) =>
      value === undefined ? fallback ?? null : value.trim() || null;
    const portOverride = (value: number | undefined, fallback: number | null | undefined) =>
      value === undefined ? fallback ?? null : value || null;
    onSubmit({
      name: values.name,
      type: values.type,
      relayMode: values.type === 'RELAY' ? values.relayMode : null,
      entryNodeId: values.type === 'RELAY' ? values.entryNodeId : null,
      entryPort: values.type === 'RELAY' ? values.entryPort : null,
      targetInboundId: values.targetInboundId,
      endpointOverrideEnabled: values.endpointOverrideEnabled,
      serverHost: textOverride(values.serverHost, savedOverrides?.serverHost),
      serverPort: portOverride(values.serverPort, savedOverrides?.serverPort),
      serverName: textOverride(values.serverName, savedOverrides?.serverName),
      host: textOverride(values.host, savedOverrides?.host),
      trafficRate: values.trafficRate,
      tags: values.tags?.split(',').map((tag) => tag.trim()).filter(Boolean) ?? [],
      level: values.level,
      sortOrder: values.sortOrder,
      isPublic: values.isPublic,
      status: values.status
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{line ? '编辑线路' : '新建线路'}</DialogTitle>
          <DialogDescription>线路负责承载用户订阅展示；节点和入站只提供底层能力。</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(submit)} className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="line-name">线路名称</Label>
            <Input id="line-name" {...form.register('name')} />
            {form.formState.errors.name && <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>}
          </div>
          <div className="space-y-2">
            <Label>线路类型</Label>
            <Controller control={form.control} name="type" render={({ field }) => <Select value={field.value} onValueChange={field.onChange}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="DIRECT">直连</SelectItem><SelectItem value="RELAY">中继 / 链式</SelectItem></SelectContent></Select>} />
          </div>
          <div className="space-y-2">
            <Label>目标入站</Label>
            <Controller control={form.control} name="targetInboundId" render={({ field }) => <Select value={field.value} onValueChange={field.onChange}><SelectTrigger><SelectValue placeholder="选择出口入站" /></SelectTrigger><SelectContent>{nodes.flatMap((node) => node.inbounds.map((inbound) => <SelectItem key={inbound.id} value={inbound.id}>{node.name} · {inbound.tag} · {inbound.type}:{inbound.port}</SelectItem>))}</SelectContent></Select>} />
            {form.formState.errors.targetInboundId && <p className="text-xs text-destructive">{form.formState.errors.targetInboundId.message}</p>}
          </div>
          {type === 'RELAY' && <>
            <div className="space-y-2">
              <Label>入口节点</Label>
              <Controller control={form.control} name="entryNodeId" render={({ field }) => <Select value={field.value || ''} onValueChange={field.onChange}><SelectTrigger><SelectValue placeholder="选择入口节点" /></SelectTrigger><SelectContent>{nodes.map((node) => <SelectItem key={node.id} value={node.id}>{node.name} · {node.serverHost}</SelectItem>)}</SelectContent></Select>} />
              {form.formState.errors.entryNodeId && <p className="text-xs text-destructive">{form.formState.errors.entryNodeId.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="line-entry-port">入口端口（可选）</Label>
              <Input id="line-entry-port" type="number" min="1" max="65535" placeholder="留空自动生成五位端口" {...form.register('entryPort')} />
              <p className="text-xs text-muted-foreground">新建时留空由服务端随机分配；编辑时保留当前端口。</p>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>中继机制</Label>
              <Controller control={form.control} name="relayMode" render={({ field }) => <Select value={field.value} onValueChange={field.onChange}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="BLIND_FORWARD">盲转发（端口转发）</SelectItem><SelectItem value="PROTOCOL_PROXY">协议重加密代理</SelectItem></SelectContent></Select>} />
            </div>
          </>}
          <div className="flex items-center justify-between rounded-md border p-3 shadow-sm sm:col-span-2">
            <div><Label>启用对外覆盖</Label><p className="text-xs text-muted-foreground">关闭时复用入口节点、目标入站的默认设置，已填写的覆盖值会保留。</p></div>
            <Controller control={form.control} name="endpointOverrideEnabled" render={({ field }) => <Switch checked={field.value} onCheckedChange={field.onChange} />} />
          </div>
          <div className="space-y-2"><Label htmlFor="line-host">对外地址覆盖</Label><Input id="line-host" disabled={!endpointOverrideEnabled} placeholder="留空使用底层节点地址" {...form.register('serverHost')} /></div>
          <div className="space-y-2"><Label htmlFor="line-port">对外端口覆盖</Label><Input id="line-port" disabled={!endpointOverrideEnabled} type="number" min="1" max="65535" placeholder="留空使用默认端口" {...form.register('serverPort')} /></div>
          <div className="space-y-2"><Label htmlFor="line-server-name">SNI 覆盖</Label><Input id="line-server-name" disabled={!endpointOverrideEnabled} placeholder="例如 www.apple.com" {...form.register('serverName')} /></div>
          <div className="space-y-2"><Label htmlFor="line-host-header">Host 覆盖</Label><Input id="line-host-header" disabled={!endpointOverrideEnabled} {...form.register('host')} /></div>
          <div className="space-y-2"><Label htmlFor="line-rate">流量倍率</Label><Input id="line-rate" type="number" min="0.01" step="0.01" {...form.register('trafficRate')} /></div>
          <div className="space-y-2"><Label htmlFor="line-level">线路等级</Label><Input id="line-level" type="number" min="0" {...form.register('level')} /></div>
          <div className="space-y-2 sm:col-span-2"><Label htmlFor="line-tags">线路标签</Label><Input id="line-tags" placeholder="hk, relay, premium" {...form.register('tags')} /></div>
          <div className="space-y-2"><Label htmlFor="line-sort">排序</Label><Input id="line-sort" type="number" min="0" {...form.register('sortOrder')} /></div>
          <div className="flex items-center justify-between rounded-md border p-3 shadow-sm">
            <div><Label>对订阅公开</Label><p className="text-xs text-muted-foreground">关闭后不会被套餐匹配。</p></div>
            <Controller control={form.control} name="isPublic" render={({ field }) => <Switch checked={field.value} onCheckedChange={field.onChange} />} />
          </div>
          <div className="flex items-center justify-between rounded-md border p-3 shadow-sm">
            <div><Label>线路已启用</Label><p className="text-xs text-muted-foreground">禁用后保留配置但不参与订阅。</p></div>
            <Controller control={form.control} name="status" render={({ field }) => <Switch checked={field.value === 'ACTIVE'} onCheckedChange={(checked) => field.onChange(checked ? 'ACTIVE' : 'DISABLED')} />} />
          </div>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
            <Button type="submit" disabled={pending}>{pending ? '保存中…' : '保存线路'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
