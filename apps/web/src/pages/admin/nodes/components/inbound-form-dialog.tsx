import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { KeyRound } from 'lucide-react';
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
import { PROTOCOL_LABELS, PROTOCOL_TYPES, type NodeInbound, type ProtocolType } from '../use-nodes';

// TLS 证书路径为 Agent 机本地路径（主控不托管证书文件）
const tlsSchema = z.object({
  serverName: z.string().min(1, '请输入 TLS SNI'),
  certificatePath: z.string().min(1, '请输入证书路径'),
  keyPath: z.string().min(1, '请输入私钥路径'),
  alpn: z.string().min(1, '请输入 ALPN'),
  insecure: z.boolean()
});

const baseSchema = {
  tag: z.string().max(64, 'tag 不超过 64 字符').optional(),
  listen: z.string().max(64),
  port: z.coerce.number().int().min(1, '端口 1~65535').max(65535, '端口 1~65535'),
  isPublic: z.boolean(),
  sortOrder: z.coerce.number().int().min(0).optional()
};

const vlessSchema = z.object({
  ...baseSchema,
  type: z.literal('VLESS_REALITY'),
  serverNames: z.string().min(1, '请输入 SNI（逗号分隔）'),
  dest: z.string().regex(/^[^:\s]+:\d+$/, '形如 www.apple.com:443'),
  privateKey: z.string().min(1, '私钥不能为空（可点生成）'),
  publicKey: z.string().min(1, '公钥不能为空（可点生成）'),
  shortIds: z.string().min(1, '请输入 shortId（逗号分隔）'),
  flow: z.string().min(1)
});

const hy2Schema = z.object({
  ...baseSchema,
  type: z.literal('HYSTERIA2'),
  upMbps: z.coerce.number().int().min(0),
  downMbps: z.coerce.number().int().min(0),
  tls: tlsSchema
});

const tuicSchema = z.object({
  ...baseSchema,
  type: z.literal('TUIC'),
  congestionControl: z.string().min(1),
  tls: tlsSchema
});

const ssSchema = z.object({
  ...baseSchema,
  type: z.literal('SHADOWSOCKS'),
  method: z.string().min(1, '请输入加密方法'),
  password: z.string().min(1, '密码不能为空')
});

const formSchema = z.discriminatedUnion('type', [vlessSchema, hy2Schema, tuicSchema, ssSchema]);

type InboundForm = z.infer<typeof formSchema>;

const defaultForm = (type: ProtocolType): InboundForm => {
  const base = { listen: '::', port: 443, isPublic: true, sortOrder: 0 };
  switch (type) {
    case 'VLESS_REALITY':
      return {
        ...base,
        type,
        tag: undefined,
        serverNames: 'www.apple.com',
        dest: 'www.apple.com:443',
        privateKey: '',
        publicKey: '',
        shortIds: '0123456789abcdef',
        flow: 'xtls-rprx-vision'
      };
    case 'HYSTERIA2':
      return {
        ...base,
        type,
        tag: undefined,
        upMbps: 0,
        downMbps: 0,
        tls: { serverName: '', certificatePath: '', keyPath: '', alpn: 'h3', insecure: false }
      };
    case 'TUIC':
      return {
        ...base,
        type,
        tag: undefined,
        congestionControl: 'bbr',
        tls: { serverName: '', certificatePath: '', keyPath: '', alpn: 'h3', insecure: false }
      };
    case 'SHADOWSOCKS':
      return { ...base, type, tag: undefined, method: '2022-blake3-aes-128-gcm', password: '' };
  }
};

// 编辑回填：字符串数组转逗号分隔输入
const fromInbound = (inbound: NodeInbound): InboundForm => {
  const base = {
    tag: inbound.tag,
    listen: inbound.listen,
    port: inbound.port,
    isPublic: inbound.isPublic,
    sortOrder: inbound.sortOrder
  };
  const p = inbound.params;
  switch (inbound.type) {
    case 'VLESS_REALITY':
      return {
        ...base,
        type: 'VLESS_REALITY',
        serverNames: (p.serverNames ?? []).join(','),
        dest: p.dest ?? '',
        privateKey: p.privateKey ?? '',
        publicKey: p.publicKey ?? '',
        shortIds: (p.shortIds ?? []).join(','),
        flow: p.flow ?? 'xtls-rprx-vision'
      };
    case 'HYSTERIA2':
      return {
        ...base,
        type: 'HYSTERIA2',
        upMbps: p.upMbps ?? 0,
        downMbps: p.downMbps ?? 0,
        tls: {
          serverName: p.tls?.serverName ?? '',
          certificatePath: p.tls?.certificatePath ?? '',
          keyPath: p.tls?.keyPath ?? '',
          alpn: (p.tls?.alpn ?? ['h3']).join(','),
          insecure: p.tls?.insecure ?? false
        }
      };
    case 'TUIC':
      return {
        ...base,
        type: 'TUIC',
        congestionControl: p.congestionControl ?? 'bbr',
        tls: {
          serverName: p.tls?.serverName ?? '',
          certificatePath: p.tls?.certificatePath ?? '',
          keyPath: p.tls?.keyPath ?? '',
          alpn: (p.tls?.alpn ?? ['h3']).join(','),
          insecure: p.tls?.insecure ?? false
        }
      };
    case 'SHADOWSOCKS':
      return {
        ...base,
        type: 'SHADOWSOCKS',
        method: p.method ?? '2022-blake3-aes-128-gcm',
        password: p.password ?? ''
      };
  }
};

const splitList = (s: string) =>
  s
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v.length > 0);

interface InboundFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 编辑目标（null=创建）；创建时可用 initialType 预选协议 */
  inbound: NodeInbound | null;
  initialType?: ProtocolType;
  onCreate: (payload: {
    type: ProtocolType;
    tag?: string;
    listen: string;
    port: number;
    params: Record<string, unknown>;
    sortOrder: number;
    isPublic: boolean;
  }) => void;
  onUpdate: (
    inboundId: string,
    payload: {
      tag?: string;
      listen: string;
      port: number;
      params: Record<string, unknown>;
      sortOrder: number;
      isPublic: boolean;
    }
  ) => void;
  /** Reality 密钥对生成（服务端生成，不落库） */
  onGenerateKeypair: () => Promise<{ privateKey: string; publicKey: string }>;
  pending?: boolean;
}

export function InboundFormDialog({
  open,
  onOpenChange,
  inbound,
  initialType = 'VLESS_REALITY',
  onCreate,
  onUpdate,
  onGenerateKeypair,
  pending
}: InboundFormDialogProps) {
  const [type, setType] = useState<ProtocolType>(initialType);
  const isEdit = !!inbound;

  const form = useForm<InboundForm>({
    resolver: zodResolver(formSchema),
    defaultValues: defaultForm(initialType)
  });

  useEffect(() => {
    if (!open) return;
    if (inbound) {
      setType(inbound.type);
      form.reset(fromInbound(inbound));
    } else {
      setType(initialType);
      form.reset(defaultForm(initialType));
    }
  }, [open, inbound, initialType, form]);

  const onTypeChange = (next: ProtocolType) => {
    setType(next);
    // 切换协议：保留通用字段，参数区重置为该协议默认值
    const values = form.getValues();
    form.reset({
      ...defaultForm(next),
      tag: values.tag,
      listen: values.listen,
      port: values.port,
      isPublic: values.isPublic,
      sortOrder: values.sortOrder
    });
  };

  const onGenerate = async () => {
    try {
      const pair = await onGenerateKeypair();
      form.setValue('privateKey', pair.privateKey, { shouldValidate: true });
      form.setValue('publicKey', pair.publicKey, { shouldValidate: true });
    } catch {
      // 生成失败由调用方 toast 提示
    }
  };

  const onSubmit = (v: InboundForm) => {
    const common = {
      tag: v.tag?.trim() ? v.tag.trim() : undefined,
      listen: v.listen.trim() || '::',
      port: v.port,
      sortOrder: v.sortOrder ?? 0,
      isPublic: v.isPublic
    };
    if (isEdit && inbound) {
      const params = buildParams(v);
      onUpdate(inbound.id, { ...common, tag: v.tag?.trim() ? v.tag.trim() : inbound.tag, params });
      return;
    }
    onCreate({ ...common, type: v.type, params: buildParams(v) });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? `编辑入站 ${inbound?.tag}` : '添加入站'}</DialogTitle>
          <DialogDescription>
            协议参数结构与默认值说明见 docs/DATA_MODELS.md §3.1；保存后在线节点自动下发配置
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
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

            <FormField
              control={form.control}
              name="tag"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tag（可选）</FormLabel>
                  <FormControl>
                    <Input placeholder="缺省按协议前缀生成（如 vless-in）" {...field} />
                  </FormControl>
                  <FormDescription>sing-box 入站标识，节点内唯一</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {type === 'VLESS_REALITY' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="serverNames"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>SNI（逗号分隔）</FormLabel>
                        <FormControl>
                          <Input placeholder="www.apple.com" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="dest"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>握手目标 dest</FormLabel>
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
                    name="privateKey"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Reality 私钥</FormLabel>
                        <FormControl>
                          <Input placeholder="32 字节 base64url" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="publicKey"
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
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => void onGenerate()}
                >
                  <KeyRound className="h-4 w-4" />
                  生成密钥对
                </Button>
                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="shortIds"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>shortIds（逗号分隔）</FormLabel>
                        <FormControl>
                          <Input placeholder="0123456789abcdef" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="flow"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Flow</FormLabel>
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

            {(type === 'HYSTERIA2' || type === 'TUIC') && (
              <>
                {type === 'HYSTERIA2' && (
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name="upMbps"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>上行 Mbps（0=不限）</FormLabel>
                          <FormControl>
                            <Input type="number" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="downMbps"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>下行 Mbps（0=不限）</FormLabel>
                          <FormControl>
                            <Input type="number" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}
                {type === 'TUIC' && (
                  <FormField
                    control={form.control}
                    name="congestionControl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>拥塞控制</FormLabel>
                        <FormControl>
                          <Input placeholder="bbr" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="tls.serverName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>TLS SNI</FormLabel>
                        <FormControl>
                          <Input placeholder="hy.example.com" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="tls.alpn"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>ALPN（逗号分隔）</FormLabel>
                        <FormControl>
                          <Input placeholder="h3" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="tls.certificatePath"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>证书路径（Agent 机本地）</FormLabel>
                        <FormControl>
                          <Input placeholder="/etc/riricloud/cert.pem" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="tls.keyPath"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>私钥路径（Agent 机本地）</FormLabel>
                        <FormControl>
                          <Input placeholder="/etc/riricloud/key.pem" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="tls.insecure"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                      <div>
                        <FormLabel>允许客户端跳过证书校验</FormLabel>
                        <FormDescription>自签证书时开启（订阅输出 skip-cert-verify）</FormDescription>
                      </div>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </>
            )}

            {type === 'SHADOWSOCKS' && (
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="method"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>加密方法</FormLabel>
                      <FormControl>
                        <Input placeholder="2022-blake3-aes-128-gcm" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>共享密码</FormLabel>
                      <FormControl>
                        <Input placeholder="留空自动生成" {...field} />
                      </FormControl>
                      <FormDescription>SS 为共享密码模式，所有用户相同</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            <FormField
              control={form.control}
              name="isPublic"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                  <div>
                    <FormLabel>对订阅公开</FormLabel>
                    <FormDescription>关闭后该入站不出现在用户订阅中</FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />

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

// 表单值 → API params（字符串输入还原为数组；SS 空密码由服务端自动生成）
function buildParams(v: InboundForm): Record<string, unknown> {
  switch (v.type) {
    case 'VLESS_REALITY':
      return {
        serverNames: splitList(v.serverNames),
        dest: v.dest.trim(),
        privateKey: v.privateKey.trim(),
        publicKey: v.publicKey.trim(),
        shortIds: splitList(v.shortIds),
        flow: v.flow.trim()
      };
    case 'HYSTERIA2':
      return {
        upMbps: v.upMbps,
        downMbps: v.downMbps,
        tls: {
          serverName: v.tls.serverName.trim(),
          certificatePath: v.tls.certificatePath.trim(),
          keyPath: v.tls.keyPath.trim(),
          alpn: splitList(v.tls.alpn),
          insecure: v.tls.insecure
        }
      };
    case 'TUIC':
      return {
        congestionControl: v.congestionControl.trim(),
        tls: {
          serverName: v.tls.serverName.trim(),
          certificatePath: v.tls.certificatePath.trim(),
          keyPath: v.tls.keyPath.trim(),
          alpn: splitList(v.tls.alpn),
          insecure: v.tls.insecure
        }
      };
    case 'SHADOWSOCKS':
      return {
        method: v.method.trim(),
        ...(v.password.trim() ? { password: v.password.trim() } : {})
      };
  }
}
