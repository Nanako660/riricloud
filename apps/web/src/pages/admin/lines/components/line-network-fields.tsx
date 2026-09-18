import type { UseFormReturn } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { FieldGrid, NumberField, SelectField, SwitchField, TextField } from './line-form-controls';
import type { LineFormValues } from './line-form-schema';

export function LineNetworkFields({ form }: { form: UseFormReturn<LineFormValues> }) {
  const { t } = useTranslation(['admin']);
  const protocol = form.watch('protocolType');
  const proxyProtocol = form.watch('proxyProtocol');
  const ssUdpOverTcp = form.watch('ssUdpOverTcp');
  const isShadowsocksWithUdpOverTcp = protocol === 'SHADOWSOCKS' && ssUdpOverTcp;
  const supportsMultiplex = ['VLESS', 'VMESS', 'TROJAN', 'SHADOWSOCKS'].includes(protocol);
  const multiplexEnabled = form.watch('multiplexEnabled');
  const brutalEnabled = form.watch('multiplexBrutalEnabled');

  return (
    <div className="space-y-4">
      <FieldGrid>
        <NumberField
          form={form}
          name="speedLimitMbps"
          label={t('admin:lineForm.speedLimitMbps')}
          placeholder={t('admin:lineForm.speedLimitPlaceholder')}
          description={t('admin:lineForm.speedLimitDesc')}
          min={0}
          max={100000}
        />
        <SwitchField
          form={form}
          name="proxyProtocol"
          label={t('admin:lineForm.proxyProtocol')}
          description={t('admin:lineForm.proxyProtocolDesc')}
        />
      </FieldGrid>

      {Boolean(proxyProtocol) && (
        <SwitchField
          form={form}
          name="proxyProtocolAcceptNoHeader"
          label={t('admin:lineForm.proxyProtocolAcceptNoHeader')}
          description={t('admin:lineForm.proxyProtocolAcceptNoHeaderDesc')}
        />
      )}

      <FieldGrid>
        <SwitchField
          form={form}
          name="tcpFastOpen"
          label={t('admin:lineForm.tcpFastOpen')}
          description={t('admin:lineForm.tcpFastOpenDesc')}
        />
        <SwitchField
          form={form}
          name="tcpMultiPath"
          label={t('admin:lineForm.tcpMultiPath')}
          description={t('admin:lineForm.tcpMultiPathDesc')}
        />
      </FieldGrid>

      <FieldGrid>
        <SwitchField
          form={form}
          name="udpFragment"
          label={t('admin:lineForm.udpFragment')}
          description={t('admin:lineForm.udpFragmentDesc')}
        />
        <TextField
          form={form}
          name="udpTimeout"
          label={t('admin:lineForm.udpTimeout')}
          placeholder={t('admin:lineForm.udpTimeoutPlaceholder')}
          description={t('admin:lineForm.udpTimeoutDesc')}
        />
      </FieldGrid>

      {supportsMultiplex && (
        <div className="rounded-md border p-4 space-y-3 bg-muted/20">
          <SwitchField
            form={form}
            name="multiplexEnabled"
            label={t('admin:lineForm.multiplexEnabled')}
            description={
              isShadowsocksWithUdpOverTcp
                ? t('admin:lineForm.multiplexDisabledByUot')
                : t('admin:lineForm.multiplexDesc')
            }
            disabled={isShadowsocksWithUdpOverTcp}
          />

          {multiplexEnabled && !isShadowsocksWithUdpOverTcp && (
            <div className="space-y-3 pt-2">
              <FieldGrid>
                <SelectField
                  form={form}
                  name="multiplexProtocol"
                  label={t('admin:lineForm.multiplexProtocol')}
                  options={[
                    { value: 'smux', label: 'smux (Clash Meta / Sing-box)' },
                    { value: 'yamux', label: 'yamux' },
                    { value: 'h2mux', label: 'h2mux' }
                  ]}
                />
                <NumberField
                  form={form}
                  name="multiplexMaxConnections"
                  label={t('admin:lineForm.multiplexMaxConnections')}
                  placeholder={form.watch('multiplexMaxStreams') ? t('admin:lineForm.multiplexMaxConnectionsDisabled') : t('admin:lineForm.multiplexMaxConnectionsPlaceholder')}
                  description={t('admin:lineForm.multiplexMaxConnectionsDesc')}
                  disabled={Boolean(form.watch('multiplexMaxStreams'))}
                  min={1}
                  max={64}
                />
              </FieldGrid>

              <FieldGrid>
                <NumberField
                  form={form}
                  name="multiplexMinStreams"
                  label={t('admin:lineForm.multiplexMinStreams')}
                  placeholder={t('admin:lineForm.multiplexMinStreamsPlaceholder')}
                  min={1}
                  max={256}
                />
                <NumberField
                  form={form}
                  name="multiplexMaxStreams"
                  label={t('admin:lineForm.multiplexMaxStreams')}
                  placeholder={form.watch('multiplexMaxConnections') ? t('admin:lineForm.multiplexMaxStreamsDisabled') : t('admin:lineForm.multiplexMaxStreamsPlaceholder')}
                  description={t('admin:lineForm.multiplexMaxStreamsDesc')}
                  disabled={Boolean(form.watch('multiplexMaxConnections'))}
                  min={0}
                  max={1024}
                />
              </FieldGrid>

              <SwitchField
                form={form}
                name="multiplexPadding"
                label={t('admin:lineForm.multiplexPadding')}
                description={t('admin:lineForm.multiplexPaddingDesc')}
              />

              <SwitchField
                form={form}
                name="multiplexBrutalEnabled"
                label={t('admin:lineForm.multiplexBrutalEnabled')}
                description={t('admin:lineForm.multiplexBrutalDesc')}
              />

              {brutalEnabled && (
                <FieldGrid>
                  <NumberField
                    form={form}
                    name="multiplexBrutalUpMbps"
                    label={t('admin:lineForm.multiplexBrutalUpMbps')}
                    description={t('admin:lineForm.multiplexBrutalUpDesc')}
                    placeholder={t('admin:lineForm.multiplexBrutalUpPlaceholder')}
                    min={1}
                    max={100000}
                  />
                  <NumberField
                    form={form}
                    name="multiplexBrutalDownMbps"
                    label={t('admin:lineForm.multiplexBrutalDownMbps')}
                    description={t('admin:lineForm.multiplexBrutalDownDesc')}
                    placeholder={t('admin:lineForm.multiplexBrutalDownPlaceholder')}
                    min={1}
                    max={100000}
                  />
                </FieldGrid>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
