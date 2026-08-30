import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const schema = z.object({ target: z.enum(['singbox', 'agent']), version: z.string().min(1, '请输入版本号'), url: z.string().url('请输入完整下载地址'), sha256: z.string().regex(/^[a-f0-9]{64}$/i, 'SHA-256 必须是 64 位十六进制') });
type Values = z.infer<typeof schema>;

export function UpgradeNodeDialog({ open, onOpenChange, pending, onSubmit }: { open: boolean; onOpenChange: (open: boolean) => void; pending: boolean; onSubmit: (values: Values) => void }) {
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { target: 'singbox', version: '', url: '', sha256: '' } });
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>远程升级节点组件</DialogTitle><DialogDescription>Agent 会先下载并校验 SHA-256，再执行原子替换和重启。</DialogDescription></DialogHeader><form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}><div className="space-y-2"><Label>升级目标</Label><Controller control={form.control} name="target" render={({ field }) => <Select value={field.value} onValueChange={field.onChange}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="singbox">Sing-box 内核</SelectItem><SelectItem value="agent">RiriCloud Agent</SelectItem></SelectContent></Select>} /></div><div className="space-y-2"><Label htmlFor="upgrade-version">版本号</Label><Input id="upgrade-version" placeholder="1.11.0" {...form.register('version')} />{form.formState.errors.version && <p className="text-xs text-destructive">{form.formState.errors.version.message}</p>}</div><div className="space-y-2"><Label htmlFor="upgrade-url">下载 URL</Label><Input id="upgrade-url" type="url" placeholder="https://downloads.example.com/binary" {...form.register('url')} />{form.formState.errors.url && <p className="text-xs text-destructive">{form.formState.errors.url.message}</p>}</div><div className="space-y-2"><Label htmlFor="upgrade-sha">SHA-256</Label><Input id="upgrade-sha" className="font-mono text-xs" placeholder="64 位十六进制摘要" {...form.register('sha256')} />{form.formState.errors.sha256 && <p className="text-xs text-destructive">{form.formState.errors.sha256.message}</p>}</div><DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>取消</Button><Button type="submit" disabled={pending}>{pending ? '下发中…' : '下发升级任务'}</Button></DialogFooter></form></DialogContent></Dialog>;
}
