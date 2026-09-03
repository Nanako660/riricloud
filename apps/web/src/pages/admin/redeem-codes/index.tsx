import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Plus, Ticket, Trash2 } from 'lucide-react';
import { PageContainer, PageHeader } from '@/components/shared/page-container';
import { EmptyState } from '@/components/shared/empty-state';
import { CopyButton } from '@/components/shared/copy-button';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { ResponsiveDialog, ResponsiveDialogContent } from '@/components/shared/responsive-dialog';
import { formatCurrency } from '@/lib/utils';
import { useRedeemCodeMutations, useRedeemCodes, type AdminRedeemCode, type RedeemCodeStatus } from './use-redeem-codes';

const schema = z.object({
  count: z.coerce.number().int().min(1, '至少生成 1 张').max(1000, '最多生成 1000 张'),
  amountYuan: z.coerce.number().positive('面额必须大于 0').multipleOf(0.01, '最多保留两位小数'),
  prefix: z.string().max(16).regex(/^[A-Za-z0-9-]*$/, '仅允许字母、数字和短横线').optional(),
  expiresAt: z.string().optional(),
  note: z.string().max(200).optional()
});
type FormValues = z.infer<typeof schema>;
const labels: Record<RedeemCodeStatus, string> = { UNUSED: '未使用', REDEEMED: '已兑换', REVOKED: '已作废', EXPIRED: '已过期' };

export default function RedeemCodesPage() {
  const [status, setStatus] = useState<RedeemCodeStatus | 'ALL'>('ALL');
  const [open, setOpen] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<AdminRedeemCode | null>(null);
  const [generatedCodes, setGeneratedCodes] = useState<string[]>([]);
  const query = useRedeemCodes(status);
  const { batch, revoke } = useRedeemCodeMutations();
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { count: 10, amountYuan: 10, prefix: '', expiresAt: '', note: '' } });

  const submit = (values: FormValues) => batch.mutate({ count: values.count, amount: Math.round(values.amountYuan * 100), prefix: values.prefix || undefined, expiresAt: values.expiresAt ? new Date(values.expiresAt).toISOString() : null, note: values.note || undefined }, { onSuccess: (data) => { setGeneratedCodes(data.codes); setOpen(false); form.reset(); } });
  const codesText = generatedCodes.join('\n');

  return (
    <PageContainer>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><PageHeader title="卡密管理" description="生成充值卡密、查看兑换状态并作废未使用卡密。" /><Button className="w-full sm:w-auto" onClick={() => setOpen(true)}><Plus />批量生成</Button></div>
      <Card><CardContent className="space-y-4 pt-6"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Ticket className="size-4" />充值卡密金额以人民币元展示，服务端按分保存。</div><Select value={status} onValueChange={(value) => setStatus(value as typeof status)}><SelectTrigger className="w-full sm:w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">全部状态</SelectItem>{Object.entries(labels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>卡密</TableHead><TableHead>面额</TableHead><TableHead>状态</TableHead><TableHead>有效期</TableHead><TableHead>备注</TableHead><TableHead>创建时间</TableHead><TableHead className="text-right">操作</TableHead></TableRow></TableHeader><TableBody>{query.data?.data.map((item) => <TableRow key={item.id}><TableCell><code className="whitespace-nowrap text-xs">{item.code}</code></TableCell><TableCell className="tabular-nums">{formatCurrency(item.amount)}</TableCell><TableCell><Badge variant={item.status === 'REDEEMED' ? 'secondary' : item.status === 'UNUSED' ? 'default' : 'destructive'}>{labels[item.status]}</Badge></TableCell><TableCell className="whitespace-nowrap text-xs">{item.expiresAt ? new Date(item.expiresAt).toLocaleString('zh-CN') : '永久'}</TableCell><TableCell>{item.note || '—'}</TableCell><TableCell className="whitespace-nowrap text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleDateString('zh-CN')}</TableCell><TableCell className="text-right">{item.status === 'UNUSED' && <Button variant="ghost" size="icon" aria-label="作废卡密" onClick={() => setRevokeTarget(item)}><Trash2 className="size-4 text-destructive" /></Button>}</TableCell></TableRow>)}</TableBody></Table></div>{!query.data?.data.length && <EmptyState title="暂无卡密" description="生成充值卡密后会显示在这里。" />}</CardContent></Card>
      <ResponsiveDialog open={open} onOpenChange={setOpen}><ResponsiveDialogContent><DialogHeader><DialogTitle>批量生成充值卡密</DialogTitle><DialogDescription>卡密只会在生成后显示一次，请及时复制保存。</DialogDescription></DialogHeader><Form {...form}><form onSubmit={form.handleSubmit(submit)} className="grid gap-4 sm:grid-cols-2"><FormField control={form.control} name="count" render={({ field }) => <FormItem><FormLabel>生成数量</FormLabel><FormControl><Input type="number" min={1} max={1000} {...field} /></FormControl><FormMessage /></FormItem>} /><FormField control={form.control} name="amountYuan" render={({ field }) => <FormItem><FormLabel>单张面额（元）</FormLabel><FormControl><Input type="number" min={0.01} step="0.01" {...field} /></FormControl><FormMessage /></FormItem>} /><FormField control={form.control} name="prefix" render={({ field }) => <FormItem><FormLabel>前缀</FormLabel><FormControl><Input placeholder="例如 RIRI" {...field} /></FormControl><FormMessage /></FormItem>} /><FormField control={form.control} name="expiresAt" render={({ field }) => <FormItem><FormLabel>有效期</FormLabel><FormControl><Input type="datetime-local" {...field} /></FormControl><FormDescription>留空表示永久有效。</FormDescription><FormMessage /></FormItem>} /><FormField control={form.control} name="note" render={({ field }) => <FormItem className="sm:col-span-2"><FormLabel>备注</FormLabel><FormControl><Input placeholder="活动充值卡" {...field} /></FormControl><FormMessage /></FormItem>} /><DialogFooter className="sm:col-span-2"><Button type="button" variant="outline" onClick={() => setOpen(false)}>取消</Button><Button type="submit" disabled={batch.isPending}>{batch.isPending ? '生成中…' : '生成卡密'}</Button></DialogFooter></form></Form></ResponsiveDialogContent></ResponsiveDialog>
      <ResponsiveDialog open={generatedCodes.length > 0} onOpenChange={(value) => !value && setGeneratedCodes([])}><ResponsiveDialogContent><DialogHeader><DialogTitle>生成成功</DialogTitle><DialogDescription>请复制下面的卡密并妥善分发。</DialogDescription></DialogHeader><div className="max-h-[50vh] overflow-y-auto rounded-md border bg-muted/30 p-3"><pre className="whitespace-pre-wrap break-all font-mono text-xs leading-6">{codesText}</pre></div><DialogFooter><CopyButton value={codesText} className="w-full sm:w-auto" /><Button variant="outline" onClick={() => setGeneratedCodes([])}>关闭</Button></DialogFooter></ResponsiveDialogContent></ResponsiveDialog>
      <AlertDialog open={!!revokeTarget} onOpenChange={(value) => !value && setRevokeTarget(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>作废这张卡密？</AlertDialogTitle><AlertDialogDescription>{revokeTarget?.code} 作废后无法兑换，且不可恢复。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => { if (revokeTarget) revoke.mutate(revokeTarget.id, { onSuccess: () => setRevokeTarget(null) }); }}>确认作废</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </PageContainer>
  );
}
