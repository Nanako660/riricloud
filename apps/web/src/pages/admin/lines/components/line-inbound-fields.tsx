import type { UseFormReturn } from 'react-hook-form';
import { Separator } from '@/components/ui/separator';
import { FieldGrid, SelectField, TextField } from './line-form-controls';
import { LineProtocolFields } from './line-protocol-fields';
import { hasProtocolSpecificFields } from './line-protocol-capabilities';
import { LineSecurityFields } from './line-security-fields';
import { LineTransportFields } from './line-transport-fields';
import { PROTOCOL_LABELS, PROTOCOL_TYPES, type LineFormValues } from './line-form-schema';
import type { ApiCertificate, ProtocolType } from '@/lib/api';
import type { AdminNode } from '../../nodes/use-nodes';

export function LineInboundFields({ form, nodes, certificates, onProtocolChange, onGenerateKeys, keyPending }: {
  form: UseFormReturn<LineFormValues>;
  nodes: AdminNode[];
  onProtocolChange: (protocol: ProtocolType) => void;
  onGenerateKeys: () => void;
  keyPending: boolean;
  certificates: ApiCertificate[];
}) {
  const protocol = form.watch('protocolType');
  const supportsTransport = ['VLESS', 'VMESS', 'TROJAN'].includes(protocol);
  const supportsTls = ['VLESS', 'VMESS', 'TROJAN', 'HYSTERIA2', 'TUIC', 'NAIVE'].includes(protocol);
  const supportsProtocolFields = hasProtocolSpecificFields(protocol);
  const nodeOptions = nodes.map((node) => ({ value: node.id, label: `${node.name} · ${node.serverHost}` }));

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h3 className="text-sm font-medium">基础与网络</h3>
        <Separator />
        <FieldGrid>
          <ProtocolSelect form={form} onProtocolChange={onProtocolChange} />
          <SelectField form={form} name="entryNodeId" label="入口节点" options={nodeOptions} />
          <TextField form={form} name="tag" label="Tag（可选）" placeholder="留空自动生成" />
          <TextField form={form} name="listen" label="监听地址" placeholder="0.0.0.0" />
          <TextField form={form} name="entryPort" label="入口监听端口" type="number" placeholder="留空自动分配" />
        </FieldGrid>
        <p className="text-xs text-muted-foreground">切换协议会重置该协议的传输、安全和专属参数；线路公共属性会保留。</p>
      </section>

      {supportsTransport && <>
        <Separator />
        <section className="space-y-3">
          <h3 className="text-sm font-medium">传输层 Transport</h3>
          <Separator />
          <LineTransportFields form={form} />
        </section>
      </>}

      {supportsTls && <>
        <Separator />
        <section className="space-y-3">
          <h3 className="text-sm font-medium">安全层 TLS / Reality / ACME</h3>
          <Separator />
          <LineSecurityFields form={form} onGenerateKeys={onGenerateKeys} keyPending={keyPending} certificates={certificates} />
        </section>
      </>}

      {supportsProtocolFields && <>
        <Separator />
        <section className="space-y-3">
          <h3 className="text-sm font-medium">协议专属参数</h3>
          <Separator />
          <LineProtocolFields form={form} />
        </section>
      </>}
    </div>
  );
}

function ProtocolSelect({ form, onProtocolChange }: { form: UseFormReturn<LineFormValues>; onProtocolChange: (protocol: ProtocolType) => void }) {
  return (
    <SelectField
      form={form}
      name="protocolType"
      label="协议"
      options={PROTOCOL_TYPES.map((value) => ({ value, label: PROTOCOL_LABELS[value] }))}
      onValueChange={(value) => onProtocolChange(value as ProtocolType)}
    />
  );
}
