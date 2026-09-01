import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ResponsiveDialog, ResponsiveDialogContent } from '@/components/shared/responsive-dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { AdminNode } from '../../nodes/use-nodes';
import type { AdminLine, LinePayload } from '../use-lines';
import { useRealityKeypair } from '../use-lines';
import { LineAdvancedFields } from './line-advanced-fields';
import { LineInboundFields } from './line-inbound-fields';
import { defaultLineFormValues, lineFormSchema, lineToFormValues, newLineFormValues, toLinePayload, type LineFormValues } from './line-form-schema';
import type { ApiCertificate, ProtocolType } from '@/lib/api';

interface LineFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  line: AdminLine | null;
  nodes: AdminNode[];
  certificates: ApiCertificate[];
  pending: boolean;
  onSubmit: (payload: LinePayload) => void;
}

export function LineFormDialog({ open, onOpenChange, line, nodes, certificates, pending, onSubmit }: LineFormDialogProps) {
  const [tab, setTab] = useState('inbound');
  const form = useForm<LineFormValues>({
    resolver: zodResolver(lineFormSchema),
    defaultValues: defaultLineFormValues()
  });
  const realityKeypair = useRealityKeypair();
  const type = form.watch('type');
  const entryNodeId = form.watch('entryNodeId');
  const entryPort = form.watch('entryPort');

  useEffect(() => {
    if (!open) return;
    setTab('inbound');
    form.reset(line ? lineToFormValues(line) : newLineFormValues());
  }, [form, line, open]);

  useEffect(() => {
    if (type !== 'DIRECT') return;
    if (entryNodeId && form.getValues('exitNodeId') !== entryNodeId) {
      form.setValue('exitNodeId', entryNodeId, { shouldDirty: true });
    }
    const syncedExitPort = entryPort || undefined;
    if (form.getValues('exitPort') !== syncedExitPort) {
      form.setValue('exitPort', syncedExitPort, { shouldDirty: true });
    }
  }, [entryNodeId, entryPort, form, type]);

  const changeProtocol = (protocolType: ProtocolType) => {
    const current = form.getValues();
    const next = defaultLineFormValues(protocolType);
    form.reset({
      ...next,
      name: current.name,
      tag: current.tag,
      listen: current.listen,
      type: current.type,
      relayMode: current.relayMode,
      entryNodeId: current.entryNodeId,
      entryPort: current.entryPort,
      exitNodeId: current.exitNodeId,
      exitPort: current.exitPort,
      certificateId: current.certificateId,
      endpointOverrideEnabled: current.endpointOverrideEnabled,
      serverHost: current.serverHost,
      serverPort: current.serverPort,
      serverName: current.serverName,
      host: current.host,
      trafficRate: current.trafficRate,
      tags: current.tags,
      level: current.level,
      sortOrder: current.sortOrder,
      isPublic: current.isPublic,
      status: current.status
    });
  };

  const changeType = (nextType: LineFormValues['type']) => {
    form.setValue('type', nextType, { shouldDirty: true });
    if (nextType === 'DIRECT') {
      const current = form.getValues();
      form.setValue('exitNodeId', current.entryNodeId, { shouldDirty: true });
      form.setValue('exitPort', current.entryPort, { shouldDirty: true });
    }
  };

  const generateKeys = () => {
    realityKeypair.mutate(undefined, {
      onSuccess: (keys) => {
        form.setValue('realityPrivateKey', keys.privateKey, { shouldDirty: true });
        form.setValue('realityPublicKey', keys.publicKey, { shouldDirty: true });
        form.setValue('tlsMode', 'reality', { shouldDirty: true });
      }
    });
  };

  const submit = (values: LineFormValues) => {
    if (values.tlsMode === 'reality' && !values.realityPrivateKey.trim() && !line && values.realityPublicKey.trim()) {
      form.setError('realityPrivateKey', { message: '新建 Reality 线路必须同时提供私钥，或点击生成密钥对' });
      setTab('inbound');
      return;
    }
    onSubmit(toLinePayload(values));
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent size="wide">
        <DialogHeader>
          <DialogTitle>{line ? '编辑线路' : '新建线路'}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(submit)} className="space-y-4">
            <FormField control={form.control} name="name" render={({ field }) => (
              <FormItem><FormLabel>线路名称</FormLabel><FormControl><Input placeholder="例如：香港高倍率线路" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <Tabs value={tab} onValueChange={setTab} className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="inbound">入站配置</TabsTrigger>
                <TabsTrigger value="advanced">线路高级设置</TabsTrigger>
              </TabsList>
              <TabsContent value="inbound" className="mt-4"><LineInboundFields form={form} nodes={nodes} certificates={certificates} onProtocolChange={changeProtocol} onGenerateKeys={generateKeys} keyPending={realityKeypair.isPending} /></TabsContent>
              <TabsContent value="advanced" className="mt-4"><LineAdvancedFields form={form} nodes={nodes} onTypeChange={changeType} /></TabsContent>
            </Tabs>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
              <Button type="submit" disabled={pending}>{pending ? '保存中…' : '保存线路'}</Button>
            </DialogFooter>
          </form>
        </Form>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
