import type { UseFormReturn } from 'react-hook-form';
import { FormField, FormItem, FormLabel, FormControl, FormDescription } from '@/components/ui/form';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import type { AdminNode } from '../../nodes/use-nodes';
import type { AdminLine } from '../use-lines';
import { FieldGrid, SelectField, SwitchField, TextField } from './line-form-controls';
import { TARGET_LINE_PROTOCOLS, type LineFormValues } from './line-form-schema';

export function LineAdvancedFields({ form, nodes, lines, currentLineId, onTypeChange }: {
  form: UseFormReturn<LineFormValues>;
  nodes: AdminNode[];
  lines: AdminLine[];
  currentLineId?: string;
  onTypeChange: (type: LineFormValues['type']) => void;
}) {
  const type = form.watch('type');
  const relayMode = form.watch('relayMode');
  const entryNodeId = form.watch('entryNodeId');
  const targetLineId = form.watch('targetLineId');
  const endpointOverrideEnabled = form.watch('endpointOverrideEnabled');
  const nodeOptions = nodes.map((node) => ({ value: node.id, label: `${node.name} · ${node.serverHost}` }));
  const targetLines = lines.filter((line) => (
    line.id !== currentLineId &&
    line.type === 'DIRECT' &&
    line.entryNodeId !== entryNodeId &&
    TARGET_LINE_PROTOCOLS.includes(line.protocolType as (typeof TARGET_LINE_PROTOCOLS)[number]) &&
    (line.status === 'ACTIVE' || line.id === targetLineId)
  ));
  const targetLine = lines.find((line) => line.id === targetLineId);
  const targetLineOptions = targetLines.map((line) => ({
    value: line.id,
    label: `${line.name} · ${line.entryNode.name} · ${line.protocolType} · ${line.entryPort}${line.status === 'ACTIVE' ? '' : ' · 已禁用'}`
  }));
  const changeRelayMode = (value: string) => {
    form.setValue('relayMode', value as LineFormValues['relayMode'], { shouldDirty: true });
    if (value !== 'TARGET_LINE') form.setValue('targetLineId', '', { shouldDirty: true });
  };
  const changeTargetLine = (value: string) => {
    form.setValue('targetLineId', value, { shouldDirty: true });
    form.setValue('landingNodeId', '', { shouldDirty: true });
    form.setValue('landingPort', undefined, { shouldDirty: true });
  };
  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h3 className="text-sm font-medium">线路拓扑</h3>
        <Separator />
        <FieldGrid>
          <SelectField form={form} name="type" label="线路模式" options={[{ value: 'DIRECT', label: '直连' }, { value: 'RELAY', label: '中继' }]} onValueChange={(value) => onTypeChange(value as LineFormValues['type'])} />
          {type === 'RELAY' && relayMode !== 'TARGET_LINE' && <SelectField form={form} name="landingNodeId" label="落地节点" options={nodeOptions} />}
          {type === 'RELAY' && relayMode !== 'TARGET_LINE' && <TextField form={form} name="landingPort" label="落地监听端口" type="number" placeholder="留空自动分配" />}
        </FieldGrid>
        {type === 'RELAY' && <SelectField form={form} name="relayMode" label="中继机制" options={[{ value: 'BLIND_FORWARD', label: '盲转发：保持端到端协议' }, { value: 'PROTOCOL_PROXY', label: '协议代理：入口终止后重建连接' }, { value: 'TARGET_LINE', label: '协议转换：桥接已有线路' }]} onValueChange={changeRelayMode} />}
        {type === 'RELAY' && relayMode === 'TARGET_LINE' && <div className="space-y-3">
          <SelectField
            form={form}
            name="targetLineId"
            label="目标落地线路"
            options={targetLineOptions.length ? targetLineOptions : [{ value: '__no-target-line__', label: '暂无可用目标线路' }]}
            disabled={!entryNodeId || targetLineOptions.length === 0}
            description="仅可选择其他节点上的启用直连线路；落地节点和端口由目标线路自动绑定。"
            onValueChange={changeTargetLine}
          />
          {targetLine && <div className="rounded-md border bg-muted/30 p-3 text-sm">
            <p className="font-medium">已绑定落地</p>
            <p className="mt-1 text-muted-foreground">{targetLine.entryNode.name} · {targetLine.entryNode.serverHost}:{targetLine.entryPort}</p>
            <p className="text-muted-foreground">目标协议：{targetLine.protocolType} · {targetLine.status === 'ACTIVE' ? '线路已启用' : '线路已禁用'}</p>
          </div>}
        </div>}
      </section>

      <Separator />
      <section className="space-y-3">
        <h3 className="text-sm font-medium">对外端点覆盖</h3>
        <Separator />
        <SwitchField form={form} name="endpointOverrideEnabled" label="启用对外端点覆盖" description="关闭时复用入口节点地址、入口端口和协议参数中的 SNI/Host。" />
        {endpointOverrideEnabled && <FieldGrid>
          <TextField form={form} name="serverHost" label="对外地址覆盖" placeholder="留空使用入口节点" />
          <TextField form={form} name="serverPort" label="对外端口覆盖" type="number" placeholder="留空使用入口端口" />
          <TextField form={form} name="serverName" label="SNI 覆盖" placeholder="留空使用协议参数" />
          <TextField form={form} name="host" label="Host 覆盖" placeholder="留空使用传输参数" />
        </FieldGrid>}
      </section>

      <Separator />
      <section className="space-y-3">
        <h3 className="text-sm font-medium">线路属性</h3>
        <Separator />
        <FieldGrid>
          <TextField form={form} name="trafficRate" label="流量倍率" type="number" inputProps={{ min: 0.01, step: 0.01 }} />
          <TextField form={form} name="tags" label="线路标签" placeholder="hk, premium, relay" />
          <TextField form={form} name="level" label="线路等级" type="number" inputProps={{ min: 0 }} />
          <TextField form={form} name="sortOrder" label="排序" type="number" inputProps={{ min: 0 }} />
        </FieldGrid>
        <FieldGrid>
          <SwitchField form={form} name="isPublic" label="对订阅公开" description="关闭后不会进入套餐匹配。" />
          <StatusSwitch form={form} />
        </FieldGrid>
      </section>
    </div>
  );
}

function StatusSwitch({ form }: { form: UseFormReturn<LineFormValues> }) {
  return <FormField control={form.control} name="status" render={({ field }) => (
    <FormItem className="flex items-center justify-between gap-4">
      <div><FormLabel>线路已启用</FormLabel><FormDescription>禁用后保留配置但不参与订阅。</FormDescription></div>
      <FormControl><Switch checked={field.value === 'ACTIVE'} onCheckedChange={(checked) => field.onChange(checked ? 'ACTIVE' : 'DISABLED')} /></FormControl>
    </FormItem>
  )} />;
}
