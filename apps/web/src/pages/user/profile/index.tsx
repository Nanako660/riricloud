import { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Headphones, Mail, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { CopyButton } from '@/components/shared/copy-button';
import { EmptyState } from '@/components/shared/empty-state';
import { PageContainer, PageHeader } from '@/components/shared/page-container';
import { Pagination, PaginationInfo, PaginationNext, PaginationPrevious } from '@/components/ui/pagination';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import { usePublicSettings } from '@/lib/public-settings';
import { hasSupportContacts } from '@/lib/support';
import { SupportDialog, SupportContactsInline } from '@/components/shared/support-dialog';
import { useProfileMutations, useProfileUser, useWallet, useWalletTransactions } from './use-profile';

const redeemSchema = z.object({ code: z.string().trim().min(6, '请输入有效卡密').max(128) });
const passwordSchema = z.object({ oldPassword: z.string().min(8, '密码至少 8 位'), newPassword: z.string().min(8, '密码至少 8 位').max(64), confirmPassword: z.string() }).refine((value) => value.newPassword === value.confirmPassword, { path: ['confirmPassword'], message: '两次输入的密码不一致' });
const nicknameSchema = z.object({ nickname: z.string().trim().min(2, '昵称至少 2 个字符').max(20, '昵称最多 20 个字符') });
const emailSchema = z.object({ newEmail: z.string().email('请输入有效的新邮箱'), verificationCode: z.string().regex(/^\d{6}$/, '请输入 6 位验证码'), currentPassword: z.string().min(8, '密码至少 8 位') });
type RedeemValues = z.infer<typeof redeemSchema>;
type PasswordValues = z.infer<typeof passwordSchema>;
type NicknameValues = z.infer<typeof nicknameSchema>;
type EmailValues = z.infer<typeof emailSchema>;

const transactionLabels: Record<string, string> = { SYSTEM_GIFT: '注册赠金', REDEEM: '卡密充值', PLAN_BUY: '订购套餐', PLAN_RENEW: '续费套餐', PLAN_UPGRADE: '升配套餐', ADMIN_ADJUST: '管理员调账' };

export default function ProfilePage() {
  const [page, setPage] = useState(1);
  const [resetOpen, setResetOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailCooldown, setEmailCooldown] = useState(0);
  const user = useProfileUser();
  const wallet = useWallet();
  const transactions = useWalletTransactions(page);
  const publicSettings = usePublicSettings();
  const { redeem, changePassword, resetUuid, updateProfile, sendEmailCode, changeEmail } = useProfileMutations();
  const redeemForm = useForm<RedeemValues>({ resolver: zodResolver(redeemSchema), defaultValues: { code: '' } });
  const passwordForm = useForm<PasswordValues>({ resolver: zodResolver(passwordSchema), defaultValues: { oldPassword: '', newPassword: '', confirmPassword: '' } });
  const nicknameForm = useForm<NicknameValues>({ resolver: zodResolver(nicknameSchema), defaultValues: { nickname: '' } });
  const emailForm = useForm<EmailValues>({ resolver: zodResolver(emailSchema), defaultValues: { newEmail: '', verificationCode: '', currentPassword: '' } });
  const totalPages = Math.ceil((transactions.data?.total ?? 0) / 10);

  useEffect(() => {
    if (user.data?.nickname) nicknameForm.reset({ nickname: user.data.nickname });
  }, [user.data?.nickname, nicknameForm]);
  useEffect(() => {
    if (!emailCooldown) return;
    const timer = window.setInterval(() => setEmailCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [emailCooldown]);

  if (user.isPending || wallet.isPending) return <PageContainer><PageHeader title="个人中心" /><p className="text-sm text-muted-foreground animate-pulse">加载中…</p></PageContainer>;
  if (user.isError || wallet.isError || !user.data || !wallet.data) return <PageContainer><PageHeader title="个人中心" /><EmptyState title="无法加载个人信息" description="请稍后刷新重试" /></PageContainer>;

  const onRedeem = (values: RedeemValues) => redeem.mutate(values.code, { onSuccess: () => redeemForm.reset() });
  const onPassword = (values: PasswordValues) => changePassword.mutate({ oldPassword: values.oldPassword, newPassword: values.newPassword }, { onSuccess: () => passwordForm.reset() });
  const onNickname = (values: NicknameValues) => updateProfile.mutate({ nickname: values.nickname });
  const requestEmailCode = async () => {
    if (emailCooldown || sendEmailCode.isPending || !(await emailForm.trigger('newEmail'))) return;
    sendEmailCode.mutate(emailForm.getValues('newEmail'), { onSuccess: () => setEmailCooldown(60) });
  };
  const onChangeEmail = (values: EmailValues) => changeEmail.mutate(values, { onSuccess: () => { emailForm.reset(); setEmailOpen(false); } });

  return (
    <PageContainer>
      <PageHeader title="个人中心" description="管理账户余额、登录安全与代理连接凭据。" />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Card className="min-w-0"><CardHeader><CardTitle>账户资产</CardTitle><CardDescription>余额以人民币分为最小单位记录。</CardDescription></CardHeader><CardContent className="space-y-5"><div className="rounded-lg border bg-muted/20 p-4"><p className="text-xs text-muted-foreground">可用余额</p><p className="mt-1 text-3xl font-bold tracking-tight">{formatCurrency(wallet.data.balance)}</p></div><div className="grid grid-cols-2 gap-3 text-sm"><div><p className="text-muted-foreground">累计充值</p><p className="font-semibold text-emerald-600">{formatCurrency(wallet.data.totalIncome)}</p></div><div><p className="text-muted-foreground">累计消费</p><p className="font-semibold text-destructive">{formatCurrency(wallet.data.totalExpense)}</p></div></div><Form {...redeemForm}><form onSubmit={redeemForm.handleSubmit(onRedeem)} className="space-y-3"><FormField control={redeemForm.control} name="code" render={({ field }) => <FormItem><FormLabel>卡密充值</FormLabel><FormControl><Input placeholder="输入充值卡密" autoComplete="off" {...field} /></FormControl><FormDescription>兑换成功后余额会立即到账。</FormDescription><FormMessage /></FormItem>} /><Button type="submit" disabled={redeem.isPending}>{redeem.isPending ? '兑换中…' : '立即兑换'}</Button></form></Form></CardContent></Card>
        <Card className="min-w-0"><CardHeader><CardTitle>收支明细</CardTitle><CardDescription>记录每一次充值、消费和管理员调账。</CardDescription></CardHeader><CardContent className="min-w-0 space-y-3"><div className="overflow-x-auto"><Table className="min-w-[680px]"><TableHeader><TableRow><TableHead className="whitespace-nowrap">时间</TableHead><TableHead className="whitespace-nowrap">类型</TableHead><TableHead className="min-w-[140px] whitespace-nowrap">说明</TableHead><TableHead className="min-w-[104px] whitespace-nowrap text-right">金额</TableHead><TableHead className="min-w-[104px] whitespace-nowrap text-right">余额</TableHead></TableRow></TableHeader><TableBody>{transactions.data?.data.map((item) => <TableRow key={item.id}><TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatDateTime(item.createdAt)}</TableCell><TableCell className="whitespace-nowrap"><Badge className="whitespace-nowrap" variant={item.amount >= 0 ? 'secondary' : 'outline'}>{transactionLabels[item.type] ?? item.type}</Badge></TableCell><TableCell className="min-w-[140px] max-w-[240px] break-words">{item.description || '—'}</TableCell><TableCell className={`min-w-[104px] whitespace-nowrap text-right font-medium tabular-nums ${item.amount >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>{item.amount >= 0 ? '+' : '-'}{formatCurrency(Math.abs(item.amount))}</TableCell><TableCell className="min-w-[104px] whitespace-nowrap text-right tabular-nums">{formatCurrency(item.balanceAfter)}</TableCell></TableRow>)}</TableBody></Table></div>{!transactions.data?.data.length && <p className="py-8 text-center text-sm text-muted-foreground">暂无收支记录</p>}<Pagination className="border-t pt-3"><PaginationInfo page={page} totalPages={totalPages} /><PaginationPrevious onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1} /><PaginationNext onClick={() => setPage((current) => Math.min(Math.max(totalPages, 1), current + 1))} disabled={page >= Math.max(totalPages, 1)} /></Pagination></CardContent></Card>
      </div>
      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <Card className="min-w-0"><CardHeader><CardTitle>账号信息</CardTitle><CardDescription>昵称和邮箱用于面板身份展示与登录。</CardDescription></CardHeader><CardContent className="min-w-0 space-y-5 text-sm"><div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/20 p-3"><div><p className="text-xs text-muted-foreground">数字 UID</p><p className="mt-1 font-mono text-xl font-semibold tracking-wider">{user.data.uid ?? '未分配'}</p></div>{user.data.uid ? <CopyButton value={String(user.data.uid)} /> : null}</div><Form {...nicknameForm}><form onSubmit={nicknameForm.handleSubmit(onNickname)} className="space-y-3"><FormField control={nicknameForm.control} name="nickname" render={({ field }) => <FormItem><FormLabel>昵称</FormLabel><div className="flex gap-2"><FormControl><Input {...field} /></FormControl><Button type="submit" disabled={updateProfile.isPending}>{updateProfile.isPending ? '保存中…' : '保存'}</Button></div><FormMessage /></FormItem>} /></form></Form><div><p className="text-muted-foreground">登录邮箱</p><p className="break-all font-medium">{user.data.email}</p><Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => setEmailOpen(true)}><Mail />更换邮箱</Button></div><div className="min-w-0 space-y-2"><p className="text-muted-foreground">用户代理凭据</p><div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center"><code className="min-w-0 w-full flex-1 truncate rounded-md border bg-muted/50 px-3 py-2 text-xs">{user.data.uuid}</code><CopyButton value={user.data.uuid} className="shrink-0 self-start sm:self-auto" /></div><Button type="button" variant="outline" size="sm" onClick={() => setResetOpen(true)} disabled={resetUuid.isPending}>重置代理凭据</Button><p className="text-xs text-muted-foreground">重置后所有客户端需要重新导入订阅。</p></div><div><p className="text-muted-foreground">账号角色</p><Badge variant={user.data.role === 'ADMIN' ? 'default' : 'secondary'}>{user.data.role === 'ADMIN' ? '管理员' : '普通用户'}</Badge></div></CardContent></Card>
        <Card className="min-w-0"><CardHeader><CardTitle>修改登录密码</CardTitle><CardDescription>修改后当前会话保持有效，下一次登录使用新密码。</CardDescription></CardHeader><CardContent className="min-w-0"><Form {...passwordForm}><form onSubmit={passwordForm.handleSubmit(onPassword)} className="min-w-0 space-y-4">{(['oldPassword', 'newPassword', 'confirmPassword'] as const).map((name) => <FormField key={name} control={passwordForm.control} name={name} render={({ field }) => <FormItem className="min-w-0"><FormLabel>{name === 'oldPassword' ? '当前密码' : name === 'newPassword' ? '新密码' : '确认新密码'}</FormLabel><FormControl><Input className="min-w-0 max-w-full" type="password" autoComplete="new-password" {...field} /></FormControl><FormMessage /></FormItem>} />)}<Button type="submit" disabled={changePassword.isPending}>{changePassword.isPending ? '保存中…' : '保存新密码'}</Button></form></Form></CardContent></Card>
        {hasSupportContacts(publicSettings.data) ? <Card className="min-w-0 lg:col-span-2"><CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between space-y-0"><div><CardTitle className="flex items-center gap-2 text-base"><Headphones className="size-4 text-primary" />客服与技术支持</CardTitle><CardDescription>遇到使用问题或需咨询，请通过官方支持渠道联系我们。</CardDescription></div><SupportDialog settings={publicSettings.data} /></CardHeader><CardContent className="pt-1"><SupportContactsInline settings={publicSettings.data} className="justify-start" /></CardContent></Card> : null}
      </div>
      <Dialog open={emailOpen} onOpenChange={setEmailOpen}><DialogContent size="compact"><DialogHeader><DialogTitle>更换登录邮箱</DialogTitle><DialogDescription>验证码会发送到新邮箱，换绑后使用新邮箱登录。</DialogDescription></DialogHeader><Form {...emailForm}><form onSubmit={emailForm.handleSubmit(onChangeEmail)} className="space-y-4"><FormField control={emailForm.control} name="newEmail" render={({ field }) => <FormItem><FormLabel>新邮箱</FormLabel><FormControl><Input type="email" autoComplete="email" placeholder="new@example.com" {...field} /></FormControl><FormMessage /></FormItem>} /><FormField control={emailForm.control} name="verificationCode" render={({ field }) => <FormItem><FormLabel>邮箱验证码</FormLabel><div className="flex gap-2"><FormControl><Input inputMode="numeric" autoComplete="one-time-code" placeholder="6 位验证码" {...field} /></FormControl><Button type="button" variant="outline" className="shrink-0" onClick={() => void requestEmailCode()} disabled={emailCooldown > 0 || sendEmailCode.isPending}><ShieldCheck />{emailCooldown ? `${emailCooldown}s` : '获取验证码'}</Button></div><FormMessage /></FormItem>} /><FormField control={emailForm.control} name="currentPassword" render={({ field }) => <FormItem><FormLabel>当前密码</FormLabel><FormControl><Input type="password" autoComplete="current-password" {...field} /></FormControl><FormMessage /></FormItem>} /><DialogFooter><Button type="button" variant="outline" onClick={() => setEmailOpen(false)}>取消</Button><Button type="submit" disabled={changeEmail.isPending}>{changeEmail.isPending ? '提交中…' : '确认换绑'}</Button></DialogFooter></form></Form></DialogContent></Dialog>
      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>重置代理凭据？</AlertDialogTitle><AlertDialogDescription>旧代理凭据会立即失效，所有正在使用旧凭据的客户端都需要重新导入订阅。此操作不可撤销。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => resetUuid.mutate(undefined, { onSuccess: () => setResetOpen(false) })}>确认重置</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </PageContainer>
  );
}
