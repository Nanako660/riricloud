import { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Calendar,
  CheckCircle2,
  CreditCard,
  Eye,
  EyeOff,
  Headphones,
  KeyRound,
  Mail,
  MailCheck,
  Pencil,
  Receipt,
  ShieldCheck,
  User,
  Wallet
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
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
const passwordSchema = z
  .object({
    oldPassword: z.string().min(8, '密码至少 8 位'),
    newPassword: z.string().min(8, '密码至少 8 位').max(64),
    confirmPassword: z.string()
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    path: ['confirmPassword'],
    message: '两次输入的密码不一致'
  });
const nicknameSchema = z.object({
  nickname: z.string().trim().min(2, '昵称至少 2 个字符').max(20, '昵称最多 20 个字符')
});
const emailSchema = z.object({
  newEmail: z.string().email('请输入有效的新邮箱'),
  verificationCode: z.string().regex(/^\d{6}$/, '请输入 6 位验证码'),
  currentPassword: z.string().min(8, '密码至少 8 位')
});
const verifyEmailSchema = z.object({
  code: z.string().regex(/^\d{6}$/, '请输入 6 位验证码')
});

type RedeemValues = z.infer<typeof redeemSchema>;
type PasswordValues = z.infer<typeof passwordSchema>;
type NicknameValues = z.infer<typeof nicknameSchema>;
type EmailValues = z.infer<typeof emailSchema>;
type VerifyEmailValues = z.infer<typeof verifyEmailSchema>;

const transactionLabels: Record<string, string> = {
  SYSTEM_GIFT: '注册赠金',
  REDEEM: '卡密充值',
  PLAN_BUY: '订购套餐',
  PLAN_RENEW: '续费套餐',
  PLAN_UPGRADE: '升配套餐',
  ADMIN_ADJUST: '管理员调账'
};

export default function ProfilePage() {
  const [page, setPage] = useState(1);
  const [resetOpen, setResetOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [verifyEmailOpen, setVerifyEmailOpen] = useState(false);
  const [nicknameOpen, setNicknameOpen] = useState(false);
  const [showUuid, setShowUuid] = useState(false);
  const [emailCooldown, setEmailCooldown] = useState(0);
  const [verifyCooldown, setVerifyCooldown] = useState(0);

  const user = useProfileUser();
  const wallet = useWallet();
  const transactions = useWalletTransactions(page);
  const publicSettings = usePublicSettings();
  const { redeem, changePassword, resetUuid, updateProfile, sendEmailCode, changeEmail, sendCurrentEmailCode, verifyCurrentEmail } = useProfileMutations();

  const redeemForm = useForm<RedeemValues>({
    resolver: zodResolver(redeemSchema),
    defaultValues: { code: '' }
  });
  const passwordForm = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { oldPassword: '', newPassword: '', confirmPassword: '' }
  });
  const nicknameForm = useForm<NicknameValues>({
    resolver: zodResolver(nicknameSchema),
    defaultValues: { nickname: '' }
  });
  const emailForm = useForm<EmailValues>({
    resolver: zodResolver(emailSchema),
    defaultValues: { newEmail: '', verificationCode: '', currentPassword: '' }
  });
  const verifyEmailForm = useForm<VerifyEmailValues>({
    resolver: zodResolver(verifyEmailSchema),
    defaultValues: { code: '' }
  });

  const totalPages = Math.ceil((transactions.data?.total ?? 0) / 10);

  useEffect(() => {
    if (user.data?.nickname) {
      nicknameForm.reset({ nickname: user.data.nickname });
    }
  }, [user.data?.nickname, nicknameForm]);

  useEffect(() => {
    if (!emailCooldown) return;
    const timer = window.setInterval(() => setEmailCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [emailCooldown]);

  useEffect(() => {
    if (!verifyCooldown) return;
    const timer = window.setInterval(() => setVerifyCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [verifyCooldown]);

  if (user.isPending || wallet.isPending) {
    return (
      <PageContainer>
        <PageHeader title="个人中心" />
        <div className="space-y-4">
          <div className="h-32 rounded-xl border bg-muted/20 animate-pulse" />
          <div className="h-64 rounded-xl border bg-muted/20 animate-pulse" />
        </div>
      </PageContainer>
    );
  }

  if (user.isError || wallet.isError || !user.data || !wallet.data) {
    return (
      <PageContainer>
        <PageHeader title="个人中心" />
        <EmptyState title="无法加载个人信息" description="请稍后刷新重试" />
      </PageContainer>
    );
  }

  const onRedeem = (values: RedeemValues) =>
    redeem.mutate(values.code, { onSuccess: () => redeemForm.reset() });

  const onPassword = (values: PasswordValues) =>
    changePassword.mutate(
      { oldPassword: values.oldPassword, newPassword: values.newPassword },
      { onSuccess: () => passwordForm.reset() }
    );

  const onNickname = (values: NicknameValues) =>
    updateProfile.mutate({ nickname: values.nickname }, { onSuccess: () => setNicknameOpen(false) });

  const requestEmailCode = async () => {
    if (emailCooldown || sendEmailCode.isPending || !(await emailForm.trigger('newEmail'))) return;
    sendEmailCode.mutate(emailForm.getValues('newEmail'), { onSuccess: () => setEmailCooldown(60) });
  };

  const onChangeEmail = (values: EmailValues) =>
    changeEmail.mutate(values, {
      onSuccess: () => {
        emailForm.reset();
        setEmailOpen(false);
      }
    });

  const requestVerifyCode = () => {
    if (verifyCooldown || sendCurrentEmailCode.isPending || !user.data?.email) return;
    sendCurrentEmailCode.mutate(user.data.email, { onSuccess: () => setVerifyCooldown(60) });
  };

  const onVerifyEmail = (values: VerifyEmailValues) =>
    verifyCurrentEmail.mutate(values.code, {
      onSuccess: () => {
        setVerifyEmailOpen(false);
        verifyEmailForm.reset();
      }
    });

  const displayName = user.data.nickname || user.data.email;
  const userInitial = displayName[0]?.toUpperCase() || 'U';
  const isEmailUnverifiedBlocked = publicSettings.data?.enforceEmailVerification && !user.data.emailVerifiedAt && user.data.role !== 'ADMIN';

  return (
    <PageContainer>
      <PageHeader title="个人中心" description="管理用户身份资料、登录凭证、账户资产与收支明细。" />

      {isEmailUnverifiedBlocked && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
            <div className="flex-1 space-y-1">
              <div className="font-semibold text-sm">系统已开启强制邮箱验证</div>
              <p className="text-xs leading-relaxed text-amber-800 dark:text-amber-300">
                当前账号邮箱尚未通过验证。在完成邮箱验证前，系统将暂停你的订阅更新与节点代理连接。
              </p>
              <div className="pt-1.5">
                <Button size="sm" variant="default" className="h-8 gap-1.5 text-xs" onClick={() => setVerifyEmailOpen(true)}>
                  <MailCheck className="size-3.5" />
                  立即验证当前邮箱
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 顶部名片式用户身份横幅 (Profile Header) */}
      <Card className="min-w-0 overflow-hidden border-border/70 bg-gradient-to-br from-card via-card to-muted/20 shadow-sm">
        <CardContent className="p-5 sm:p-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start sm:items-center gap-4 sm:gap-5 min-w-0">
              {/* 大尺寸个性化 Avatar 头像 */}
              <div className="relative flex size-16 sm:size-20 shrink-0 items-center justify-center rounded-2xl border border-border/80 bg-muted/60 text-foreground font-bold text-2xl sm:text-3xl shadow-xs select-none dark:border-primary/25 dark:bg-gradient-to-br dark:from-primary/20 dark:via-primary/10 dark:to-primary/5 dark:text-primary">
                {userInitial}
              </div>

              {/* 用户信息与元数据 */}
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground truncate max-w-[220px] sm:max-w-[320px]">
                    {user.data.nickname || '未设置昵称'}
                  </h2>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted"
                    onClick={() => {
                      nicknameForm.reset({ nickname: user.data.nickname || '' });
                      setNicknameOpen(true);
                    }}
                    title="修改昵称"
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Badge variant={user.data.role === 'ADMIN' ? 'default' : 'secondary'} className="gap-1 font-normal">
                    {user.data.role === 'ADMIN' ? (
                      <>
                        <ShieldCheck className="size-3 text-emerald-500" />
                        <span>系统管理员</span>
                      </>
                    ) : (
                      <>
                        <User className="size-3" />
                        <span>普通用户</span>
                      </>
                    )}
                  </Badge>
                </div>

                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
                  {/* 登录邮箱 + 验证状态 + 更换操作 */}
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Mail className="size-3.5 shrink-0 text-muted-foreground/70" />
                    <span className="truncate max-w-[200px] sm:max-w-[280px] font-medium text-foreground">
                      {user.data.email}
                    </span>
                    {user.data.emailVerifiedAt ? (
                      <Badge variant="outline" className="gap-1 px-1.5 py-0 text-[10px] text-emerald-600 border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-800">
                        <CheckCircle2 className="size-2.5" />
                        已验证
                      </Badge>
                    ) : (
                      <div className="flex items-center gap-1">
                        <Badge variant="outline" className="gap-1 px-1.5 py-0 text-[10px] text-amber-600 border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800">
                          <AlertTriangle className="size-2.5" />
                          未验证
                        </Badge>
                        <button
                          type="button"
                          className="text-xs text-amber-600 dark:text-amber-400 underline underline-offset-2 hover:opacity-80 transition-opacity font-medium"
                          onClick={() => setVerifyEmailOpen(true)}
                        >
                          立即验证
                        </button>
                      </div>
                    )}
                    <button
                      type="button"
                      className="ml-1 text-xs text-primary underline underline-offset-2 hover:opacity-80 transition-opacity font-medium"
                      onClick={() => setEmailOpen(true)}
                    >
                      更换
                    </button>
                  </div>

                  {/* 数字 UID */}
                  {user.data.uid ? (
                    <div className="flex items-center gap-1.5">
                      <span className="text-muted-foreground/70">UID:</span>
                      <span className="font-mono font-semibold text-foreground">{user.data.uid}</span>
                      <CopyButton value={String(user.data.uid)} className="h-6 px-1.5 text-[11px] gap-1" />
                    </div>
                  ) : null}

                  {/* 注册时间 */}
                  {user.data.createdAt ? (
                    <div className="flex items-center gap-1 text-muted-foreground/70">
                      <Calendar className="size-3.5 shrink-0" />
                      <span>加入于 {formatDateTime(user.data.createdAt).split(' ')[0]}</span>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs 分页架构（账号与安全 / 资产与财务） */}
      <Tabs defaultValue="security" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2 max-w-xs sm:max-w-sm bg-muted/60 p-1">
          <TabsTrigger value="security" className="gap-2">
            <ShieldCheck className="size-4" />
            <span>账号与安全</span>
          </TabsTrigger>
          <TabsTrigger value="wallet" className="gap-2">
            <Wallet className="size-4" />
            <span>资产与财务</span>
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: 账号与安全 */}
        <TabsContent value="security" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            {/* 修改登录密码卡片 */}
            <Card className="min-w-0">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <KeyRound className="size-4 text-primary" />
                  修改登录密码
                </CardTitle>
                <CardDescription>修改后当前会话保持有效，下一次登录使用新密码。</CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...passwordForm}>
                  <form onSubmit={passwordForm.handleSubmit(onPassword)} className="space-y-4">
                    {(['oldPassword', 'newPassword', 'confirmPassword'] as const).map((name) => (
                      <FormField
                        key={name}
                        control={passwordForm.control}
                        name={name}
                        render={({ field }) => (
                          <FormItem className="min-w-0">
                            <FormLabel>
                              {name === 'oldPassword' ? '当前密码' : name === 'newPassword' ? '新密码' : '确认新密码'}
                            </FormLabel>
                            <FormControl>
                              <Input
                                className="min-w-0 max-w-full"
                                type="password"
                                autoComplete={name === 'oldPassword' ? 'current-password' : 'new-password'}
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    ))}
                    <Button type="submit" disabled={changePassword.isPending}>
                      {changePassword.isPending ? '保存中…' : '保存新密码'}
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </Card>

            {/* 代理连接凭据 (UUID) 与安全管理 */}
            <Card className="min-w-0 flex flex-col justify-between">
              <div>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <ShieldCheck className="size-4 text-primary" />
                    代理连接凭据
                  </CardTitle>
                  <CardDescription>用于客户端识别用户身份、获取订阅以及连接代理节点的密钥凭据。</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>用户 UUID</span>
                      <button
                        type="button"
                        onClick={() => setShowUuid((prev) => !prev)}
                        className="flex items-center gap-1 text-primary hover:underline font-medium"
                      >
                        {showUuid ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                        <span>{showUuid ? '隐藏明文' : '显示明文'}</span>
                      </button>
                    </div>
                    <div className="flex min-w-0 items-center gap-2">
                      <code className="min-w-0 flex-1 truncate rounded-md border bg-muted/50 px-3 py-2 font-mono text-xs text-foreground select-all">
                        {showUuid ? user.data.uuid : '••••••••-••••-••••-••••-••••••••••••'}
                      </code>
                      <CopyButton value={user.data.uuid} className="shrink-0" />
                    </div>
                  </div>

                  {/* 危险操作警示区 */}
                  <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 space-y-3">
                    <div className="flex items-start gap-2.5">
                      <AlertTriangle className="size-4 text-destructive shrink-0 mt-0.5" />
                      <div className="space-y-1 text-xs">
                        <p className="font-semibold text-destructive">重置代理凭据风险提示</p>
                        <p className="text-muted-foreground leading-relaxed">
                          重置后旧代理凭据将立即在全网节点失效，所有正在使用旧凭据的客户端都需要重新在客户端导入新订阅链接。
                        </p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={() => setResetOpen(true)}
                      disabled={resetUuid.isPending}
                    >
                      重置代理凭据
                    </Button>
                  </div>
                </CardContent>
              </div>
            </Card>
          </div>
        </TabsContent>

        {/* Tab 2: 资产与财务 */}
        <TabsContent value="wallet" className="space-y-4">
          {/* 上半部：资产总览与卡密充值并排 */}
          <div className="grid gap-4 lg:grid-cols-2">
            {/* 账户资产概览 */}
            <Card className="min-w-0">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Wallet className="size-4 text-primary" />
                  账户资产
                </CardTitle>
                <CardDescription>余额以人民币为单位，用于套餐订购与自动续费扣费。</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-xl border border-border/80 bg-muted/30 p-4 shadow-xs sm:p-5 dark:border-primary/20 dark:bg-gradient-to-br dark:from-primary/10 dark:via-primary/5 dark:to-transparent">
                  <p className="text-xs font-medium text-muted-foreground">当前可用余额</p>
                  <p className="mt-1 text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
                    {formatCurrency(wallet.data.balance)}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div className="rounded-lg border bg-muted/20 p-3">
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <ArrowDownLeft className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span>累计充值</span>
                    </p>
                    <p className="mt-1 text-lg font-semibold text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(wallet.data.totalIncome)}
                    </p>
                  </div>
                  <div className="rounded-lg border bg-muted/20 p-3">
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <ArrowUpRight className="size-3.5 text-destructive" />
                      <span>累计消费</span>
                    </p>
                    <p className="mt-1 text-lg font-semibold text-destructive">
                      {formatCurrency(wallet.data.totalExpense)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 卡密充值 */}
            <Card className="min-w-0 flex flex-col justify-between">
              <div>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <CreditCard className="size-4 text-primary" />
                    卡密充值
                  </CardTitle>
                  <CardDescription>输入充值卡密，兑换成功后余额会即刻增加到账户可用余额中。</CardDescription>
                </CardHeader>
                <CardContent>
                  <Form {...redeemForm}>
                    <form onSubmit={redeemForm.handleSubmit(onRedeem)} className="space-y-4">
                      <FormField
                        control={redeemForm.control}
                        name="code"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>充值卡密</FormLabel>
                            <FormControl>
                              <Input placeholder="输入充值卡密" autoComplete="off" {...field} />
                            </FormControl>
                            <FormDescription>卡密区分大小写，兑换成功后无法撤回。</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <Button type="submit" disabled={redeem.isPending}>
                        {redeem.isPending ? '兑换中…' : '立即兑换'}
                      </Button>
                    </form>
                  </Form>
                </CardContent>
              </div>
            </Card>
          </div>

          {/* 下半部：全宽收支明细表格 */}
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Receipt className="size-4 text-primary" />
                收支明细
              </CardTitle>
              <CardDescription>记录每一次充值、套餐订购、自动续费与管理员调账流水。</CardDescription>
            </CardHeader>
            <CardContent className="min-w-0 space-y-4">
              <div className="overflow-x-auto rounded-md border">
                <Table className="min-w-[680px]">
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead className="whitespace-nowrap">时间</TableHead>
                      <TableHead className="whitespace-nowrap">类型</TableHead>
                      <TableHead className="min-w-[160px] whitespace-nowrap">说明</TableHead>
                      <TableHead className="min-w-[110px] whitespace-nowrap text-right">变动金额</TableHead>
                      <TableHead className="min-w-[110px] whitespace-nowrap text-right">变动后余额</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.data?.data.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {formatDateTime(item.createdAt)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <Badge className="whitespace-nowrap font-normal" variant={item.amount >= 0 ? 'secondary' : 'outline'}>
                            {transactionLabels[item.type] ?? item.type}
                          </Badge>
                        </TableCell>
                        <TableCell className="min-w-[160px] max-w-[320px] break-words text-sm">
                          {item.description || '—'}
                        </TableCell>
                        <TableCell
                          className={`min-w-[110px] whitespace-nowrap text-right font-semibold tabular-nums ${
                            item.amount >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'
                          }`}
                        >
                          {item.amount >= 0 ? '+' : '-'}
                          {formatCurrency(Math.abs(item.amount))}
                        </TableCell>
                        <TableCell className="min-w-[110px] whitespace-nowrap text-right font-mono text-sm tabular-nums">
                          {formatCurrency(item.balanceAfter)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {!transactions.data?.data.length && (
                <div className="py-8">
                  <EmptyState title="暂无收支记录" description="进行卡密充值或订购套餐后，账本流水将在此处展现。" />
                </div>
              )}
              <Pagination className="border-t pt-3">
                <PaginationInfo page={page} totalPages={totalPages} />
                <PaginationPrevious
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={page <= 1}
                />
                <PaginationNext
                  onClick={() => setPage((current) => Math.min(Math.max(totalPages, 1), current + 1))}
                  disabled={page >= Math.max(totalPages, 1)}
                />
              </Pagination>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* 客服与技术支持卡片（若配置） */}
      {hasSupportContacts(publicSettings.data) ? (
        <Card className="min-w-0 border-border/60 bg-muted/20">
          <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between space-y-0 pb-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Headphones className="size-4 text-primary" />
                客服与技术支持
              </CardTitle>
              <CardDescription>遇到使用问题或需咨询，请通过官方支持渠道联系我们。</CardDescription>
            </div>
            <SupportDialog settings={publicSettings.data} />
          </CardHeader>
          <CardContent className="pt-0">
            <SupportContactsInline settings={publicSettings.data} className="justify-start" />
          </CardContent>
        </Card>
      ) : null}

      {/* 修改昵称弹窗 */}
      <Dialog open={nicknameOpen} onOpenChange={setNicknameOpen}>
        <DialogContent size="compact">
          <DialogHeader>
            <DialogTitle>修改用户昵称</DialogTitle>
            <DialogDescription>设置个性化昵称，用于主控面板各处身份展示。</DialogDescription>
          </DialogHeader>
          <Form {...nicknameForm}>
            <form onSubmit={nicknameForm.handleSubmit(onNickname)} className="space-y-4">
              <FormField
                control={nicknameForm.control}
                name="nickname"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>用户昵称</FormLabel>
                    <FormControl>
                      <Input placeholder="输入 2-20 位昵称" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setNicknameOpen(false)}>
                  取消
                </Button>
                <Button type="submit" disabled={updateProfile.isPending}>
                  {updateProfile.isPending ? '保存中…' : '保存'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* 更换登录邮箱弹窗 */}
      <Dialog open={emailOpen} onOpenChange={setEmailOpen}>
        <DialogContent size="compact">
          <DialogHeader>
            <DialogTitle>更换登录邮箱</DialogTitle>
            <DialogDescription>验证码会发送到新邮箱，换绑后使用新邮箱登录。</DialogDescription>
          </DialogHeader>
          <Form {...emailForm}>
            <form onSubmit={emailForm.handleSubmit(onChangeEmail)} className="space-y-4">
              <FormField
                control={emailForm.control}
                name="newEmail"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>新邮箱</FormLabel>
                    <FormControl>
                      <Input type="email" autoComplete="email" placeholder="new@example.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={emailForm.control}
                name="verificationCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>邮箱验证码</FormLabel>
                    <div className="flex gap-2">
                      <FormControl>
                        <Input inputMode="numeric" autoComplete="one-time-code" placeholder="6 位验证码" {...field} />
                      </FormControl>
                      <Button
                        type="button"
                        variant="outline"
                        className="shrink-0"
                        onClick={() => void requestEmailCode()}
                        disabled={emailCooldown > 0 || sendEmailCode.isPending}
                      >
                        <ShieldCheck className="size-4" />
                        {emailCooldown ? `${emailCooldown}s` : '获取验证码'}
                      </Button>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={emailForm.control}
                name="currentPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>当前密码</FormLabel>
                    <FormControl>
                      <Input type="password" autoComplete="current-password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEmailOpen(false)}>
                  取消
                </Button>
                <Button type="submit" disabled={changeEmail.isPending}>
                  {changeEmail.isPending ? '提交中…' : '确认换绑'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* 验证当前邮箱弹窗 */}
      <Dialog open={verifyEmailOpen} onOpenChange={setVerifyEmailOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>验证当前邮箱</DialogTitle>
            <DialogDescription>
              验证码将发送至当前绑定邮箱：<span className="font-mono text-foreground font-medium">{user.data.email}</span>
            </DialogDescription>
          </DialogHeader>
          <Form {...verifyEmailForm}>
            <form className="space-y-4" onSubmit={verifyEmailForm.handleSubmit(onVerifyEmail)}>
              <FormField
                control={verifyEmailForm.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>邮箱验证码</FormLabel>
                    <div className="flex gap-2">
                      <FormControl>
                        <Input inputMode="numeric" autoComplete="one-time-code" placeholder="6 位验证码" {...field} />
                      </FormControl>
                      <Button
                        type="button"
                        variant="outline"
                        className="shrink-0"
                        onClick={requestVerifyCode}
                        disabled={verifyCooldown > 0 || sendCurrentEmailCode.isPending}
                      >
                        <Mail className="size-4" />
                        {verifyCooldown ? `${verifyCooldown}s` : '获取验证码'}
                      </Button>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setVerifyEmailOpen(false)}>
                  取消
                </Button>
                <Button type="submit" disabled={verifyCurrentEmail.isPending}>
                  {verifyCurrentEmail.isPending ? '验证中…' : '确认验证'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* 重置代理凭据确认弹窗 */}
      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>重置代理凭据？</AlertDialogTitle>
            <AlertDialogDescription>
              旧代理凭据会立即失效，所有正在使用旧凭据的客户端都需要重新导入订阅。此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => resetUuid.mutate(undefined, { onSuccess: () => setResetOpen(false) })}
            >
              确认重置
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}
