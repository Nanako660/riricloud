import type { UseFormReturn } from 'react-hook-form';
import { FieldGrid, SelectField, SwitchField, TextField } from './line-form-controls';
import type { LineFormValues } from './line-form-schema';

export function LineProtocolFields({ form }: { form: UseFormReturn<LineFormValues> }) {
  const protocol = form.watch('protocolType');
  return <div className="space-y-3">
    {protocol === 'VLESS' && <TextField form={form} name="vlessFlow" label="Flow（流控）" placeholder="xtls-rprx-vision" />}
    {protocol === 'VMESS' && <TextField form={form} name="vmessAlterId" label="AlterId" type="number" placeholder="0" />}
    {protocol === 'HYSTERIA2' && <>
      <FieldGrid>
        <TextField form={form} name="hy2UpMbps" label="上行速率（Mbps，0=不限）" type="number" />
        <TextField form={form} name="hy2DownMbps" label="下行速率（Mbps，0=不限）" type="number" />
        <TextField form={form} name="hy2ObfsPassword" label="Salamander 混淆密码" type="password" placeholder="可选" />
      </FieldGrid>
      <SwitchField form={form} name="hy2IgnoreClientBandwidth" label="忽略客户端带宽" description="强制使用服务端限速。" />
    </>}
    {protocol === 'TUIC' && <FieldGrid>
      <SelectField form={form} name="tuicCongestionControl" label="拥塞控制" options={[{ value: 'bbr', label: 'BBR' }, { value: 'cubic', label: 'CUBIC' }, { value: 'new_reno', label: 'New Reno' }]} />
      <TextField form={form} name="tuicHeartbeat" label="Heartbeat" placeholder="可选" />
      <SwitchField form={form} name="tuicZeroRtt" label="0-RTT 快速握手" />
    </FieldGrid>}
    {protocol === 'SHADOWSOCKS' && <>
      <FieldGrid>
        <TextField form={form} name="ssMethod" label="加密算法" placeholder="2022-blake3-aes-128-gcm" />
        <SelectField form={form} name="ssMode" label="认证模式" options={[{ value: 'shared', label: '共享密码模式' }, { value: 'multi-user', label: '多用户模式' }]} />
      </FieldGrid>
      <TextField form={form} name="ssPassword" label="入站密钥 / 密码" type="password" placeholder="留空自动生成" />
    </>}
    {protocol === 'NAIVE' && <SelectField form={form} name="naiveNetwork" label="网络" options={[{ value: 'tcp', label: 'TCP' }, { value: 'udp', label: 'UDP' }]} />}
    {protocol === 'SHADOWTLS' && <>
      <FieldGrid>
        <SelectField form={form} name="stVersion" label="ShadowTLS 版本" options={[{ value: '2', label: 'v2' }, { value: '3', label: 'v3' }]} />
        <TextField form={form} name="stHandshakeDest" label="握手目标 Dest" placeholder="gateway.icloud.com:443" />
        <TextField form={form} name="stPassword" label="ShadowTLS 密码" type="password" placeholder="可选" />
      </FieldGrid>
      <SwitchField form={form} name="stStrictMode" label="Strict Mode" />
    </>}
    {['MIXED', 'SOCKS', 'HTTP'].includes(protocol) && <FieldGrid>
      <SwitchField form={form} name="localAllowLan" label="允许局域网连接" />
      <SwitchField form={form} name="localUsersEnabled" label="启用用户认证" />
    </FieldGrid>}
    {protocol === 'DIRECT' && <FieldGrid>
      <TextField form={form} name="directOverrideAddress" label="覆盖目标地址" placeholder="127.0.0.1" />
      <TextField form={form} name="directOverridePort" label="覆盖目标端口" type="number" placeholder="80" />
    </FieldGrid>}
  </div>;
}
