import type { UseFormReturn } from 'react-hook-form';
import { FieldGrid, HeaderEditor, SelectField, TextField } from './line-form-controls';
import type { LineFormValues } from './line-form-schema';

const transportOptions = [
  { value: 'tcp', label: 'TCP（原生流）' },
  { value: 'ws', label: 'WebSocket' },
  { value: 'grpc', label: 'gRPC' },
  { value: 'http', label: 'HTTP' },
  { value: 'httpupgrade', label: 'HTTPUpgrade' }
];

export function LineTransportFields({ form }: { form: UseFormReturn<LineFormValues> }) {
  const transport = form.watch('transportType');
  if (!['VLESS', 'VMESS', 'TROJAN'].includes(form.watch('protocolType'))) return null;

  return (
    <div className="space-y-3">
      <SelectField form={form} name="transportType" label="传输协议" options={transportOptions} />
      {transport === 'ws' && <>
        <FieldGrid>
          <TextField form={form} name="wsPath" label="WebSocket Path" placeholder="/ws" />
          <TextField form={form} name="wsHost" label="WebSocket Host" placeholder="cdn.example.com" />
          <TextField form={form} name="wsMaxEarlyData" label="Max Early Data" type="number" placeholder="留空不启用" />
          <TextField form={form} name="wsEarlyDataHeaderName" label="Early Data Header Name" placeholder="Sec-WebSocket-Protocol" />
        </FieldGrid>
        <HeaderEditor form={form} name="wsHeaders" label="WebSocket 请求头" />
      </>}
      {transport === 'grpc' && <TextField form={form} name="grpcServiceName" label="gRPC Service Name" placeholder="grpc" />}
      {(transport === 'http' || transport === 'httpupgrade') && <>
        <FieldGrid>
          <TextField form={form} name="httpPath" label={`${transport === 'http' ? 'HTTP' : 'HTTPUpgrade'} Path`} placeholder="/http" />
          <TextField form={form} name="httpHost" label={`${transport === 'http' ? 'HTTP' : 'HTTPUpgrade'} Host`} placeholder="cdn.example.com" />
        </FieldGrid>
        <HeaderEditor form={form} name="httpHeaders" label={`${transport === 'http' ? 'HTTP' : 'HTTPUpgrade'} 请求头`} />
      </>}
    </div>
  );
}
