import { KeyRound } from 'lucide-react';
import type { UseFormReturn } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { FieldGrid, SelectField, SwitchField, TextField } from './line-form-controls';
import type { LineFormValues } from './line-form-schema';

const tlsOptions = [
  { value: 'none', label: '关闭 TLS' },
  { value: 'tls', label: '标准 TLS' },
  { value: 'reality', label: 'Reality' },
  { value: 'acme', label: 'ACME 自动证书' }
];

export function LineSecurityFields({ form, onGenerateKeys, keyPending }: {
  form: UseFormReturn<LineFormValues>;
  onGenerateKeys: () => void;
  keyPending: boolean;
}) {
  const mode = form.watch('tlsMode');
  const protocolType = form.watch('protocolType');
  if (!['VLESS', 'VMESS', 'TROJAN', 'HYSTERIA2', 'TUIC', 'NAIVE'].includes(protocolType)) return null;

  return (
    <div className="space-y-3">
      <SelectField form={form} name="tlsMode" label="安全模式" options={tlsOptions} />
      {mode !== 'none' && <>
        <FieldGrid>
          <TextField form={form} name="tlsServerName" label="TLS SNI" placeholder="example.com" />
          <TextField form={form} name="tlsAlpn" label="ALPN（逗号分隔）" placeholder="h3,h2,http/1.1" />
        </FieldGrid>
        <SwitchField form={form} name="tlsInsecure" label="跳过证书校验" description="仅用于自签名或证书不匹配场景。" />
      </>}
      {mode === 'tls' && <FieldGrid>
        <TextField form={form} name="tlsCertPath" label="证书路径" placeholder="/etc/ssl/cert.pem" />
        <TextField form={form} name="tlsKeyPath" label="私钥路径" placeholder="/etc/ssl/key.pem" />
      </FieldGrid>}
      {mode === 'reality' && <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div><p className="text-sm font-medium">Reality 参数</p><p className="text-xs text-muted-foreground">私钥不会从服务端回显，留空表示保留现有密钥。</p></div>
          {protocolType === 'VLESS' && <Button type="button" variant="outline" size="sm" onClick={onGenerateKeys} disabled={keyPending}><KeyRound />生成密钥对</Button>}
        </div>
        <FieldGrid>
          <TextField form={form} name="realityDest" label="Handshake Dest" placeholder="www.apple.com:443" />
          <TextField form={form} name="realityServerNames" label="Server Names（逗号分隔）" placeholder="www.apple.com" />
          <TextField form={form} name="realityShortIds" label="Short IDs（逗号分隔）" placeholder="0123456789abcdef" />
          <TextField form={form} name="realityPublicKey" label="Public Key" placeholder="生成或填写公钥" />
        </FieldGrid>
        <TextField form={form} name="realityPrivateKey" label="Private Key" type="password" placeholder="留空保留当前私钥" />
      </div>}
      {mode === 'acme' && <FieldGrid>
        <TextField form={form} name="acmeDomain" label="ACME 域名" placeholder="node.example.com" />
        <TextField form={form} name="acmeEmail" label="ACME 邮箱" placeholder="admin@example.com" />
        <TextField form={form} name="acmeProvider" label="ACME Provider（可选）" placeholder="letsencrypt" />
      </FieldGrid>}
    </div>
  );
}
