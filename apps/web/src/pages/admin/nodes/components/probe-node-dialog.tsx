import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const schema = z.object({
  type: z.enum(['tcp', 'dns', 'icmp']),
  target: z.string().min(1, '请输入目标地址'),
  port: z.coerce.number().int().min(1).max(65535).optional(),
  timeoutMs: z.coerce.number().int().min(100).max(10000)
});

type Values = z.infer<typeof schema>;

export function ProbeNodeDialog({
  open,
  onOpenChange,
  pending,
  onSubmit
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  onSubmit: (values: { probes: Values[] }) => void;
}) {
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { type: 'tcp', target: '', port: 443, timeoutMs: 3000 }
  });

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>网络探针</DialogTitle>
        <DialogDescription>从该 Agent 所在节点发起一次 TCP、DNS 或 ICMP 检测。</DialogDescription>
      </DialogHeader>
      <Form {...form}>
        <form className="space-y-4" onSubmit={form.handleSubmit((values) => onSubmit({ probes: [values] }))}>
          <FormField control={form.control} name="type" render={({ field }) => <FormItem><FormLabel>探针类型</FormLabel><Select value={field.value} onValueChange={field.onChange}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent><SelectItem value="tcp">TCP 连接</SelectItem><SelectItem value="dns">DNS 解析</SelectItem><SelectItem value="icmp">ICMP Ping</SelectItem></SelectContent></Select><FormMessage /></FormItem>} />
          <FormField control={form.control} name="target" render={({ field }) => <FormItem><FormLabel>目标地址</FormLabel><FormControl><Input placeholder="example.com" {...field} /></FormControl><FormMessage /></FormItem>} />
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField control={form.control} name="port" render={({ field }) => <FormItem><FormLabel>端口</FormLabel><FormControl><Input type="number" min={1} max={65535} {...field} /></FormControl><FormMessage /></FormItem>} />
            <FormField control={form.control} name="timeoutMs" render={({ field }) => <FormItem><FormLabel>超时（毫秒）</FormLabel><FormControl><Input type="number" min={100} max={10000} {...field} /></FormControl><FormMessage /></FormItem>} />
          </div>
          <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>取消</Button><Button type="submit" disabled={pending}>{pending ? '下发中…' : '开始探测'}</Button></DialogFooter>
        </form>
      </Form>
    </DialogContent>
  </Dialog>;
}
