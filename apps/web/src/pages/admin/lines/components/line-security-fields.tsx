import { ExternalLink, KeyRound } from 'lucide-react';
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import type { UseFormReturn } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import type { ApiCertificate } from '@/lib/api';
import { FieldGrid, SelectField, SwitchField, TextField } from './line-form-controls';
import { MANUAL_CERTIFICATE_ID, type LineFormValues } from './line-form-schema';

const tlsOptions = [
  { value: 'none', label: '关闭 TLS' },
  { value: 'tls', label: '标准 TLS' },
  { value: 'reality', label: 'Reality' },
  { value: 'acme', label: 'ACME 自动证书' }
];

export function LineSecurityFields({ form, onGenerateKeys, keyPending, certificates }: {
  form: UseFormReturn<LineFormValues>;
  onGenerateKeys: () => void;
  keyPending: boolean;
  certificates: ApiCertificate[];
}) {
  const mode = form.watch('tlsMode');
  const protocolType = form.watch('protocolType');
  const certificateId = form.watch('certificateId');
  const selectedCertificate = certificates.find((certificate) => certificate.id === certificateId);

  useEffect(() => {
    if (mode !== 'tls' && certificateId !== MANUAL_CERTIFICATE_ID) {
      form.setValue('certificateId', MANUAL_CERTIFICATE_ID, { shouldDirty: true });
    }
  }, [certificateId, form, mode]);

  useEffect(() => {
    if (mode !== 'tls' || !selectedCertificate || form.getValues('tlsServerName').trim()) return;
    const suggestedName = selectedCertificate.sans[0];
    if (suggestedName) form.setValue('tlsServerName', suggestedName, { shouldDirty: true });
  }, [form, mode, selectedCertificate]);

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
      {mode === 'tls' && <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <SelectField
              form={form}
              name="certificateId"
              label="标准 TLS 证书"
              options={[
                { value: MANUAL_CERTIFICATE_ID, label: '节点本地路径（手动）' },
                ...certificates.map((certificate) => ({ value: certificate.id, label: `${certificate.name} · ${certificate.sans[0] ?? certificate.subject}` }))
              ]}
            />
          </div>
          <Button type="button" variant="outline" size="sm" asChild className="shrink-0"><Link to="/admin/certificates"><ExternalLink />管理证书</Link></Button>
        </div>
        {selectedCertificate ? <p className="text-xs text-muted-foreground">已选择「{selectedCertificate.name}」，保存后 Master 会以内嵌 PEM 形式同步到关联节点。</p> : <FieldGrid>
          <TextField form={form} name="tlsCertPath" label="证书路径" placeholder="/etc/ssl/cert.pem" />
          <TextField form={form} name="tlsKeyPath" label="私钥路径" placeholder="/etc/ssl/key.pem" />
        </FieldGrid>}
      </div>}
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
