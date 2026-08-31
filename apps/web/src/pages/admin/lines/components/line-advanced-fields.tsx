import type { UseFormReturn } from 'react-hook-form';
import { FormField, FormItem, FormLabel, FormControl, FormDescription } from '@/components/ui/form';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import type { AdminNode } from '../../nodes/use-nodes';
import { FieldGrid, SelectField, SwitchField, TextField } from './line-form-controls';
import type { LineFormValues } from './line-form-schema';

export function LineAdvancedFields({ form, nodes, onTypeChange }: {
  form: UseFormReturn<LineFormValues>;
  nodes: AdminNode[];
  onTypeChange: (type: LineFormValues['type']) => void;
}) {
  const type = form.watch('type');
  const endpointOverrideEnabled = form.watch('endpointOverrideEnabled');
  const nodeOptions = nodes.map((node) => ({ value: node.id, label: `${node.name} · ${node.serverHost}` }));
  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h3 className="text-sm font-medium">线路拓扑</h3>
        <Separator />
        <FieldGrid>
          <SelectField form={form} name="type" label="线路模式" options={[{ value: 'DIRECT', label: '直连' }, { value: 'RELAY', label: '中继' }]} onValueChange={(value) => onTypeChange(value as LineFormValues['type'])} />
          {type === 'RELAY' && <SelectField form={form} name="exitNodeId" label="出口节点" options={nodeOptions} />}
          {type === 'RELAY' && <TextField form={form} name="exitPort" label="出口监听端口" type="number" placeholder="留空自动分配" />}
        </FieldGrid>
        {type === 'RELAY' && <SelectField form={form} name="relayMode" label="中继机制" options={[{ value: 'BLIND_FORWARD', label: '盲转发：保持端到端协议' }, { value: 'PROTOCOL_PROXY', label: '协议代理：入口终止后重建连接' }]} />}
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
