import type { UseFormReturn } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { FieldGrid, HeaderEditor, SelectField, TextField } from './line-form-controls';
import type { LineFormValues } from './line-form-schema';

export function LineTransportFields({ form }: { form: UseFormReturn<LineFormValues> }) {
  const { t } = useTranslation(['admin']);
  const transport = form.watch('transportType');
  if (!['VLESS', 'VMESS', 'TROJAN'].includes(form.watch('protocolType'))) return null;

  const transportOptions = [
    { value: 'tcp', label: t('admin:lineForm.transports.tcp') },
    { value: 'ws', label: t('admin:lineForm.transports.ws') },
    { value: 'grpc', label: t('admin:lineForm.transports.grpc') },
    { value: 'http', label: t('admin:lineForm.transports.http') },
    { value: 'httpupgrade', label: t('admin:lineForm.transports.httpupgrade') }
  ];

  const httpProtocolName = transport === 'http' ? 'HTTP' : 'HTTPUpgrade';

  return (
    <div className="space-y-3">
      <SelectField form={form} name="transportType" label={t('admin:lineForm.transportType')} options={transportOptions} />
      {transport === 'ws' && <>
        <FieldGrid>
          <TextField form={form} name="wsPath" label={t('admin:lineForm.wsPath')} placeholder={t('admin:lineForm.wsPathPlaceholder')} />
          <TextField form={form} name="wsHost" label={t('admin:lineForm.wsHost')} placeholder={t('admin:lineForm.wsHostPlaceholder')} />
          <TextField form={form} name="wsMaxEarlyData" label={t('admin:lineForm.wsMaxEarlyData')} type="number" placeholder={t('admin:lineForm.wsMaxEarlyDataPlaceholder')} />
          <TextField form={form} name="wsEarlyDataHeaderName" label={t('admin:lineForm.wsEarlyDataHeaderName')} placeholder={t('admin:lineForm.wsEarlyDataHeaderNamePlaceholder')} />
        </FieldGrid>
        <HeaderEditor form={form} name="wsHeaders" label={t('admin:lineForm.wsHeadersLabel')} />
      </>}
      {transport === 'grpc' && <TextField form={form} name="grpcServiceName" label={t('admin:lineForm.grpcServiceName')} placeholder={t('admin:lineForm.grpcServiceNamePlaceholder')} />}
      {(transport === 'http' || transport === 'httpupgrade') && <>
        <FieldGrid>
          <TextField form={form} name="httpPath" label={t('admin:lineForm.httpPath', { protocol: httpProtocolName })} placeholder={t('admin:lineForm.httpPathPlaceholder')} />
          <TextField form={form} name="httpHost" label={t('admin:lineForm.httpHost', { protocol: httpProtocolName })} placeholder={t('admin:lineForm.httpHostPlaceholder')} />
        </FieldGrid>
        <HeaderEditor form={form} name="httpHeaders" label={t('admin:lineForm.httpHeadersLabel', { protocol: httpProtocolName })} />
      </>}
    </div>
  );
}
