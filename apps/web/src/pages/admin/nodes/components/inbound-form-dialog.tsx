import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { KeyRound, Shield, Network, Server, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  PROTOCOL_LABELS,
  PROTOCOL_TYPES,
  type InboundParams,
  type NodeInbound,
  type ProtocolType,
  type TlsMode,
  type TransportType
} from '../use-nodes';

const formSchema = z.object({
  type: z.enum(PROTOCOL_TYPES),
  tag: z.string().max(64, 'tag 不超过 64 字符').optional(),
  listen: z.string().max(64),
  port: z.coerce.number().int().min(1, '端口 1~65535').max(65535, '端口 1~65535'),
  isPublic: z.boolean(),
  sortOrder: z.coerce.number().int().min(0).optional(),

  // 传输层 Transport
  transportType: z.enum(['tcp', 'ws', 'grpc', 'http', 'httpupgrade']),
  wsPath: z.string().optional(),
  wsHost: z.string().optional(),
  grpcServiceName: z.string().optional(),
  httpUpgradePath: z.string().optional(),
  httpUpgradeHost: z.string().optional(),

  // 安全层 TLS / Reality / ACME
  tlsMode: z.enum(['none', 'tls', 'reality', 'acme']),
  tlsServerName: z.string().optional(),
  tlsCertPath: z.string().optional(),
  tlsKeyPath: z.string().optional(),
  tlsAlpn: z.string().optional(),
  tlsInsecure: z.boolean().optional(),

  // Reality
  realityDest: z.string().optional(),
  realityPrivateKey: z.string().optional(),
  realityPublicKey: z.string().optional(),
  realityShortIds: z.string().optional(),
  realityServerNames: z.string().optional(),

  // ACME
  acmeDomain: z.string().optional(),
  acmeEmail: z.string().optional(),

  // 协议专属
  vlessFlow: z.string().optional(),
  vmessAlterId: z.coerce.number().int().min(0).optional(),
  hy2UpMbps: z.coerce.number().int().min(0).optional(),
  hy2DownMbps: z.coerce.number().int().min(0).optional(),
  hy2IgnoreClientBandwidth: z.boolean().optional(),
  hy2ObfsPassword: z.string().optional(),
  tuicCongestionControl: z.string().optional(),
  tuicZeroRtt: z.boolean().optional(),
  ssMethod: z.string().optional(),
  ssPassword: z.string().optional(),
  ssMode: z.enum(['shared', 'multi-user']).optional(),
  stVersion: z.coerce.number().int().optional(),
  stHandshakeDest: z.string().optional(),
  stPassword: z.string().optional(),
  stStrictMode: z.boolean().optional(),
  localAllowLan: z.boolean().optional(),
  localUsersEnabled: z.boolean().optional(),
  directOverrideAddress: z.string().optional(),
  directOverridePort: z.coerce.number().int().optional()
});

type InboundFormValues = z.infer<typeof formSchema>;

const splitList = (s?: string) =>
  s
    ? s
        .split(',')
        .map((v) => v.trim())
        .filter((v) => v.length > 0)
    : [];

const getDefaultForm = (type: ProtocolType): InboundFormValues => {
  const isQuic = type === 'HYSTERIA2' || type === 'TUIC';
  const defaultPort = isQuic ? 8443 : type === 'SHADOWSOCKS' ? 8388 : 443;
  const defaultTlsMode: TlsMode =
    type === 'VLESS'
      ? 'reality'
      : ['HYSTERIA2', 'TUIC', 'TROJAN', 'NAIVE'].includes(type)
        ? 'tls'
        : 'none';

  return {
    type,
    tag: '',
    listen: '::',
    port: defaultPort,
    isPublic: !['DIRECT', 'MIXED', 'SOCKS', 'HTTP'].includes(type),
    sortOrder: 0,

    transportType: 'tcp',
    wsPath: '/ws',
    wsHost: '',
    grpcServiceName: 'grpc',
    httpUpgradePath: '/httpupgrade',
    httpUpgradeHost: '',

    tlsMode: defaultTlsMode,
    tlsServerName: '',
    tlsCertPath: '',
    tlsKeyPath: '',
    tlsAlpn: isQuic ? 'h3' : 'h2,http/1.1',
    tlsInsecure: false,

    realityDest: 'www.apple.com:443',
    realityPrivateKey: '',
    realityPublicKey: '',
    realityShortIds: '0123456789abcdef',
    realityServerNames: 'www.apple.com',

    acmeDomain: '',
    acmeEmail: '',

    vlessFlow: 'xtls-rprx-vision',
    vmessAlterId: 0,
    hy2UpMbps: 0,
    hy2DownMbps: 0,
    hy2IgnoreClientBandwidth: false,
    hy2ObfsPassword: '',
    tuicCongestionControl: 'bbr',
    tuicZeroRtt: true,
    ssMethod: '2022-blake3-aes-128-gcm',
    ssPassword: '',
    ssMode: 'shared',
    stVersion: 3,
    stHandshakeDest: 'gateway.icloud.com:443',
    stPassword: '',
    stStrictMode: true,
    localAllowLan: false,
    localUsersEnabled: false,
    directOverrideAddress: '',
    directOverridePort: undefined
  };
};

const fromInbound = (inbound: NodeInbound): InboundFormValues => {
  const p = inbound.params || {};
  const t = p.transport || { type: 'tcp' as TransportType };
  const tls = p.tls || { enabled: false, mode: 'none' as TlsMode };
  const reality = tls.reality;
  const acme = tls.acme;

  return {
    type: inbound.type,
    tag: inbound.tag,
    listen: inbound.listen,
    port: inbound.port,
    isPublic: inbound.isPublic,
    sortOrder: inbound.sortOrder,

    transportType: t.type || 'tcp',
    wsPath: t.path || '/ws',
    wsHost: t.host || '',
    grpcServiceName: t.serviceName || 'grpc',
    httpUpgradePath: t.path || '/httpupgrade',
    httpUpgradeHost: t.host || '',

    tlsMode: tls.mode || 'none',
    tlsServerName: tls.serverName || '',
    tlsCertPath: tls.certificatePath || '',
    tlsKeyPath: tls.keyPath || '',
    tlsAlpn: (tls.alpn || []).join(','),
    tlsInsecure: tls.insecure || false,

    realityDest: reality?.dest || 'www.apple.com:443',
    realityPrivateKey: reality?.privateKey || '',
    realityPublicKey: reality?.publicKey || '',
    realityShortIds: (reality?.shortIds || []).join(','),
    realityServerNames: (reality?.serverNames || []).join(','),

    acmeDomain: acme?.domain || '',
    acmeEmail: acme?.email || '',

    vlessFlow: p.flow || '',
    vmessAlterId: p.alterId || 0,
    hy2UpMbps: p.upMbps || 0,
    hy2DownMbps: p.downMbps || 0,
    hy2IgnoreClientBandwidth: p.ignoreClientBandwidth || false,
    hy2ObfsPassword: p.obfs?.password || '',
    tuicCongestionControl: p.congestionControl || 'bbr',
    tuicZeroRtt: p.zeroRttHandshake ?? true,
    ssMethod: p.method || '2022-blake3-aes-128-gcm',
    ssPassword: p.password || '',
    ssMode: p.mode || 'shared',
    stVersion: p.version || 3,
    stHandshakeDest: p.handshakeDest || 'gateway.icloud.com:443',
    stPassword: p.password || '',
    stStrictMode: p.strictMode ?? true,
    localAllowLan: p.allowLan || false,
    localUsersEnabled: p.usersEnabled || false,
    directOverrideAddress: p.overrideAddress || '',
    directOverridePort: p.overridePort
  };
};

function buildParamsFromValues(v: InboundFormValues): InboundParams {
  const params: InboundParams = {};

  // 传输层
  if (['VLESS', 'VMESS', 'TROJAN'].includes(v.type)) {
    params.transport = {
      type: v.transportType,
      ...(v.transportType === 'ws'
        ? { path: v.wsPath?.trim() || '/', host: v.wsHost?.trim() || undefined }
        : {}),
      ...(v.transportType === 'grpc' ? { serviceName: v.grpcServiceName?.trim() } : {}),
      ...(v.transportType === 'httpupgrade'
        ? { path: v.httpUpgradePath?.trim() || '/', host: v.httpUpgradeHost?.trim() || undefined }
        : {})
    };
  }

  // 安全层
  if (['VLESS', 'VMESS', 'TROJAN', 'HYSTERIA2', 'TUIC', 'NAIVE'].includes(v.type)) {
    if (v.tlsMode === 'reality') {
      params.tls = {
        enabled: true,
        mode: 'reality',
        serverName: v.tlsServerName?.trim() || splitList(v.realityServerNames)[0] || 'www.apple.com',
        insecure: v.tlsInsecure,
        reality: {
          dest: v.realityDest?.trim() || 'www.apple.com:443',
          serverNames: splitList(v.realityServerNames),
          privateKey: v.realityPrivateKey?.trim() || undefined,
          publicKey: v.realityPublicKey?.trim() || '',
          shortIds: splitList(v.realityShortIds)
        }
      };
    } else if (v.tlsMode === 'acme') {
      params.tls = {
        enabled: true,
        mode: 'acme',
        serverName: v.acmeDomain?.trim() || undefined,
        alpn: splitList(v.tlsAlpn),
        insecure: v.tlsInsecure,
        acme: {
          domain: v.acmeDomain?.trim() || '',
          email: v.acmeEmail?.trim() || ''
        }
      };
    } else if (v.tlsMode === 'tls') {
      params.tls = {
        enabled: true,
        mode: 'tls',
        serverName: v.tlsServerName?.trim() || undefined,
        certificatePath: v.tlsCertPath?.trim() || '',
        keyPath: v.tlsKeyPath?.trim() || '',
        alpn: splitList(v.tlsAlpn),
        insecure: v.tlsInsecure
      };
    } else {
      params.tls = { enabled: false, mode: 'none' };
    }
  }

  // 协议专属
  switch (v.type) {
    case 'VLESS':
      if (v.vlessFlow?.trim()) params.flow = v.vlessFlow.trim();
      break;
    case 'VMESS':
      params.alterId = v.vmessAlterId || 0;
      break;
    case 'HYSTERIA2':
      params.upMbps = v.hy2UpMbps || 0;
      params.downMbps = v.hy2DownMbps || 0;
      params.ignoreClientBandwidth = v.hy2IgnoreClientBandwidth;
      if (v.hy2ObfsPassword?.trim()) {
        params.obfs = { type: 'salamander', password: v.hy2ObfsPassword.trim() };
      }
      break;
    case 'TUIC':
      params.congestionControl = v.tuicCongestionControl?.trim() || 'bbr';
      params.zeroRttHandshake = v.tuicZeroRtt;
      break;
    case 'SHADOWSOCKS':
      params.method = v.ssMethod?.trim() || '2022-blake3-aes-128-gcm';
      if (v.ssPassword?.trim()) params.password = v.ssPassword.trim();
      params.mode = v.ssMode || 'shared';
      break;
    case 'SHADOWTLS':
      params.version = v.stVersion || 3;
      params.handshakeDest = v.stHandshakeDest?.trim() || 'gateway.icloud.com:443';
      if (v.stPassword?.trim()) params.password = v.stPassword.trim();
      params.strictMode = v.stStrictMode;
      break;
    case 'MIXED':
    case 'SOCKS':
    case 'HTTP':
      params.allowLan = v.localAllowLan;
      params.usersEnabled = v.localUsersEnabled;
      break;
    case 'DIRECT':
      if (v.directOverrideAddress?.trim()) params.overrideAddress = v.directOverrideAddress.trim();
      if (v.directOverridePort) params.overridePort = v.directOverridePort;
      break;
  }

  return params;
}

interface InboundFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inbound: NodeInbound | null;
  initialType?: ProtocolType;
  onCreate: (payload: {
    type: ProtocolType;
    tag?: string;
    listen: string;
    port: number;
    params?: InboundParams;
    sortOrder?: number;
    isPublic?: boolean;
  }) => void;
  onUpdate: (
    inboundId: string,
    payload: {
      tag?: string;
      listen?: string;
      port?: number;
      params?: InboundParams;
      sortOrder?: number;
      isPublic?: boolean;
    }
  ) => void;
  onGenerateKeypair: () => Promise<{ privateKey: string; publicKey: string }>;
  pending?: boolean;
}

export function InboundFormDialog({
  open,
  onOpenChange,
  inbound,
  initialType = 'VLESS',
  onCreate,
  onUpdate,
  onGenerateKeypair,
  pending
}: InboundFormDialogProps) {
  const [type, setType] = useState<ProtocolType>(initialType);
  const isEdit = !!inbound;

  const form = useForm<InboundFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: getDefaultForm(initialType)
  });

  useEffect(() => {
    if (!open) return;
    if (inbound) {
      setType(inbound.type);
      form.reset(fromInbound(inbound));
    } else {
      setType(initialType);
      form.reset(getDefaultForm(initialType));
    }
  }, [open, inbound, initialType, form]);

  const onTypeChange = (next: ProtocolType) => {
    setType(next);
    const values = form.getValues();
    const defaults = getDefaultForm(next);
    form.reset({
      ...defaults,
      tag: values.tag,
      listen: values.listen,
      port: defaults.port,
      isPublic: defaults.isPublic,
      sortOrder: values.sortOrder
    });
  };

  const onGenerate = async () => {
    try {
      const pair = await onGenerateKeypair();
      form.setValue('realityPrivateKey', pair.privateKey, { shouldValidate: true });
      form.setValue('realityPublicKey', pair.publicKey, { shouldValidate: true });
    } catch {
      // toast shown by caller
    }
  };

  const onSubmit = (v: InboundFormValues) => {
    const common = {
      tag: v.tag?.trim() ? v.tag.trim() : undefined,
      listen: v.listen.trim() || '::',
      port: v.port,
      sortOrder: v.sortOrder ?? 0,
      isPublic: v.isPublic
    };
    const params = buildParamsFromValues(v);

    if (isEdit && inbound) {
      onUpdate(inbound.id, {
        ...common,
        tag: v.tag?.trim() ? v.tag.trim() : inbound.tag,
        params
      });
      return;
    }
    onCreate({ ...common, type: v.type, params });
  };

  const currentTlsMode = form.watch('tlsMode');
  const currentTransport = form.watch('transportType');

  const showTransportSection = ['VLESS', 'VMESS', 'TROJAN'].includes(type);
  const showTlsSection = ['VLESS', 'VMESS', 'TROJAN', 'HYSTERIA2', 'TUIC', 'NAIVE'].includes(type);
  const showReality = currentTlsMode === 'reality';
  const showAcme = currentTlsMode === 'acme';
  const showStandardTls = currentTlsMode === 'tls';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? `编辑入站 ${inbound?.tag}` : '添加入站协议'}</DialogTitle>
          <DialogDescription>
            支持 Sing-box 全协议入站、传输层与安全层解耦配置；保存后在线 Agent 将自动重载生效
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
            {/* 基础网络卡片 */}
            <Card className="border-border/60">
              <CardHeader className="py-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Server className="h-4 w-4 text-primary" />
                  基础与网络
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                <div className="grid grid-cols-3 gap-3">
                  <FormField
                    control={form.control}
                    name="type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>协议</FormLabel>
                        <Select
                          value={field.value}
                          onValueChange={(v) => onTypeChange(v as ProtocolType)}
                          disabled={isEdit}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {PROTOCOL_TYPES.map((t) => (
                              <SelectItem key={t} value={t}>
                                {PROTOCOL_LABELS[t]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="port"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>端口</FormLabel>
                        <FormControl>
                          <Input type="number" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="listen"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>监听地址</FormLabel>
                        <FormControl>
                          <Input placeholder="::" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="tag"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tag（可选）</FormLabel>
                        <FormControl>
                          <Input placeholder="留空按协议自动生成（如 vless-in）" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="sortOrder"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>排序权重</FormLabel>
                        <FormControl>
                          <Input type="number" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="isPublic"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-2.5">
                      <div>
                        <FormLabel className="text-sm">对订阅公开</FormLabel>
                        <FormDescription className="text-xs">
                          开启后该入站将自动生成并包含在用户订阅输出中
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            {/* 传输层 Transport 卡片 */}
            {showTransportSection && (
              <Card className="border-border/60">
                <CardHeader className="py-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Network className="h-4 w-4 text-primary" />
                    传输层配置 (Transport)
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 pt-0">
                  <FormField
                    control={form.control}
                    name="transportType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>传输协议</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="tcp">TCP (原生流)</SelectItem>
                            <SelectItem value="ws">WebSocket</SelectItem>
                            <SelectItem value="grpc">gRPC</SelectItem>
                            <SelectItem value="httpupgrade">HTTPUpgrade</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {currentTransport === 'ws' && (
                    <div className="grid grid-cols-2 gap-3">
                      <FormField
                        control={form.control}
                        name="wsPath"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>WebSocket 路径</FormLabel>
                            <FormControl>
                              <Input placeholder="/ws" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="wsHost"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Host Header (可选)</FormLabel>
                            <FormControl>
                              <Input placeholder="example.com" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  )}

                  {currentTransport === 'grpc' && (
                    <FormField
                      control={form.control}
                      name="grpcServiceName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>gRPC Service Name</FormLabel>
                          <FormControl>
                            <Input placeholder="grpc-service" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  {currentTransport === 'httpupgrade' && (
                    <div className="grid grid-cols-2 gap-3">
                      <FormField
                        control={form.control}
                        name="httpUpgradePath"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>HTTPUpgrade 路径</FormLabel>
                            <FormControl>
                              <Input placeholder="/httpupgrade" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="httpUpgradeHost"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Host (可选)</FormLabel>
                            <FormControl>
                              <Input placeholder="example.com" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* 安全与加密层 Security/TLS 卡片 */}
            {showTlsSection && (
              <Card className="border-border/60">
                <CardHeader className="py-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Shield className="h-4 w-4 text-primary" />
                    安全与加密 (Security / TLS)
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 pt-0">
                  <FormField
                    control={form.control}
                    name="tlsMode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>安全加密模式</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {type === 'VLESS' && (
                              <SelectItem value="reality">Reality (伪装握手 / 推荐防封)</SelectItem>
                            )}
                            <SelectItem value="tls">标准 TLS (VPS 本地证书路径)</SelectItem>
                            <SelectItem value="acme">ACME 自动申请 (内置证书申请)</SelectItem>
                            {['VLESS', 'VMESS'].includes(type) && (
                              <SelectItem value="none">无加密 (明文直连)</SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {showReality && (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <FormField
                          control={form.control}
                          name="realityServerNames"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>SNI 域名（逗号分隔）</FormLabel>
                              <FormControl>
                                <Input placeholder="www.apple.com" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="realityDest"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>握手目标 Dest (host:port)</FormLabel>
                              <FormControl>
                                <Input placeholder="www.apple.com:443" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <FormField
                          control={form.control}
                          name="realityPrivateKey"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Reality 私钥</FormLabel>
                              <FormControl>
                                <Input placeholder="32 字节 base64url（留空自动生成）" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="realityPublicKey"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Reality 公钥</FormLabel>
                              <FormControl>
                                <Input placeholder="32 字节 base64url" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <div className="flex justify-start">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="gap-1.5"
                          onClick={() => void onGenerate()}
                        >
                          <KeyRound className="h-4 w-4" />
                          生成 Reality 密钥对
                        </Button>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <FormField
                          control={form.control}
                          name="realityShortIds"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Short IDs (逗号分隔)</FormLabel>
                              <FormControl>
                                <Input placeholder="0123456789abcdef" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="vlessFlow"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Flow (流控)</FormLabel>
                              <FormControl>
                                <Input placeholder="xtls-rprx-vision" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </>
                  )}

                  {showStandardTls && (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <FormField
                          control={form.control}
                          name="tlsServerName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>TLS SNI</FormLabel>
                              <FormControl>
                                <Input placeholder="example.com" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="tlsAlpn"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>ALPN (逗号分隔)</FormLabel>
                              <FormControl>
                                <Input placeholder="h3,h2,http/1.1" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <FormField
                          control={form.control}
                          name="tlsCertPath"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>证书路径（Agent 机本地路径）</FormLabel>
                              <FormControl>
                                <Input placeholder="/etc/ssl/cert.pem" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="tlsKeyPath"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>私钥路径（Agent 机本地路径）</FormLabel>
                              <FormControl>
                                <Input placeholder="/etc/ssl/key.pem" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </>
                  )}

                  {showAcme && (
                    <div className="grid grid-cols-2 gap-3">
                      <FormField
                        control={form.control}
                        name="acmeDomain"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>申请域名 (Domain)</FormLabel>
                            <FormControl>
                              <Input placeholder="node.example.com" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="acmeEmail"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>联系邮箱 (Email)</FormLabel>
                            <FormControl>
                              <Input placeholder="admin@example.com" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  )}

                  {currentTlsMode !== 'none' && (
                    <FormField
                      control={form.control}
                      name="tlsInsecure"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-2.5">
                          <div>
                            <FormLabel className="text-sm">客户端跳过证书校验</FormLabel>
                            <FormDescription className="text-xs">
                              自签名或证书不匹配时开启（订阅输出 skip-cert-verify）
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch checked={field.value} onCheckedChange={field.onChange} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  )}
                </CardContent>
              </Card>
            )}

            {/* 协议专属高级参数卡片 */}
            <Card className="border-border/60">
              <CardHeader className="py-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Settings2 className="h-4 w-4 text-primary" />
                  协议专属参数
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                {type === 'HYSTERIA2' && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <FormField
                        control={form.control}
                        name="hy2UpMbps"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>上行速率 (Mbps，0=不限)</FormLabel>
                            <FormControl>
                              <Input type="number" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="hy2DownMbps"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>下行速率 (Mbps，0=不限)</FormLabel>
                            <FormControl>
                              <Input type="number" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <FormField
                        control={form.control}
                        name="hy2ObfsPassword"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Salamander 混淆密码 (可选)</FormLabel>
                            <FormControl>
                              <Input placeholder="留空不启用混淆" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="hy2IgnoreClientBandwidth"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-center justify-between rounded-lg border p-2.5 mt-6">
                            <div>
                              <FormLabel className="text-xs">强制按服务端限速</FormLabel>
                            </div>
                            <FormControl>
                              <Switch checked={field.value} onCheckedChange={field.onChange} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>
                  </>
                )}

                {type === 'TUIC' && (
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name="tuicCongestionControl"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>拥塞控制算法</FormLabel>
                          <Select value={field.value} onValueChange={field.onChange}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="bbr">BBR</SelectItem>
                              <SelectItem value="cubic">CUBIC</SelectItem>
                              <SelectItem value="new_reno">New Reno</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="tuicZeroRtt"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-2.5 mt-6">
                          <div>
                            <FormLabel className="text-xs">0-RTT 快速握手</FormLabel>
                          </div>
                          <FormControl>
                            <Switch checked={field.value} onCheckedChange={field.onChange} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                )}

                {type === 'SHADOWSOCKS' && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <FormField
                        control={form.control}
                        name="ssMethod"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>加密算法</FormLabel>
                            <Select value={field.value} onValueChange={field.onChange}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="2022-blake3-aes-128-gcm">
                                  2022-blake3-aes-128-gcm (推荐)
                                </SelectItem>
                                <SelectItem value="2022-blake3-aes-256-gcm">
                                  2022-blake3-aes-256-gcm
                                </SelectItem>
                                <SelectItem value="2022-blake3-chacha20-poly1305">
                                  2022-blake3-chacha20-poly1305
                                </SelectItem>
                                <SelectItem value="aes-128-gcm">aes-128-gcm</SelectItem>
                                <SelectItem value="aes-256-gcm">aes-256-gcm</SelectItem>
                                <SelectItem value="chacha20-ietf-poly1305">
                                  chacha20-ietf-poly1305
                                </SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="ssMode"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>认证模式</FormLabel>
                            <Select value={field.value} onValueChange={field.onChange}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="shared">共享密码模式 (单密码)</SelectItem>
                                <SelectItem value="multi-user">
                                  多用户模式 (SS 2022 用户名密码)
                                </SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <FormField
                      control={form.control}
                      name="ssPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>入站密钥 / 密码</FormLabel>
                          <FormControl>
                            <Input placeholder="留空自动按算法生成合规 base64 密钥" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </>
                )}

                {type === 'VMESS' && (
                  <FormField
                    control={form.control}
                    name="vmessAlterId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>AlterId (推荐 0)</FormLabel>
                        <FormControl>
                          <Input type="number" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {type === 'SHADOWTLS' && (
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name="stHandshakeDest"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>握手目标 Dest</FormLabel>
                          <FormControl>
                            <Input placeholder="gateway.icloud.com:443" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="stPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>ShadowTLS 密码</FormLabel>
                          <FormControl>
                            <Input placeholder="可选连接密码" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}

                {['MIXED', 'SOCKS', 'HTTP'].includes(type) && (
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name="localAllowLan"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-2.5">
                          <FormLabel className="text-xs">允许局域网连接</FormLabel>
                          <FormControl>
                            <Switch checked={field.value} onCheckedChange={field.onChange} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="localUsersEnabled"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-2.5">
                          <FormLabel className="text-xs">启用系统用户认证</FormLabel>
                          <FormControl>
                            <Switch checked={field.value} onCheckedChange={field.onChange} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                )}

                {type === 'DIRECT' && (
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name="directOverrideAddress"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>覆盖目标地址 (可选)</FormLabel>
                          <FormControl>
                            <Input placeholder="127.0.0.1" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="directOverridePort"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>覆盖目标端口 (可选)</FormLabel>
                          <FormControl>
                            <Input type="number" placeholder="80" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                取消
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? '保存中…' : '保存'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

