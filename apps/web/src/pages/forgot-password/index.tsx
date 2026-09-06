import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';
import { Cloud, KeyRound, Loader2, Mail } from 'lucide-react';
import { api, extractErrorMessage } from '@/lib/api';
import { PASSWORD_STRENGTH_MESSAGE, PASSWORD_STRENGTH_PATTERN } from '@/lib/password-policy';
import { usePublicSettings } from '@/lib/public-settings';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { SupportContactsInline } from '@/components/shared/support-dialog';
import { CaptchaDialog, type CaptchaPayload } from '@/components/shared/captcha-challenge';

const forgotPasswordSchema = z
  .object({
    email: z.string().email('请输入有效的邮箱地址'),
    verificationCode: z.string().min(6, '请输入 6 位验证码').max(6, '请输入 6 位验证码'),
    newPassword: z.string().min(8, '密码至少 8 位').max(64).regex(PASSWORD_STRENGTH_PATTERN, PASSWORD_STRENGTH_MESSAGE),
    confirmPassword: z.string()
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: '两次输入的密码不一致',
    path: ['confirmPassword']
  });

type ForgotPasswordForm = z.infer<typeof forgotPasswordSchema>;

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const infoQuery = usePublicSettings();
  const [captchaOpen, setCaptchaOpen] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const logoUrl = infoQuery.data?.logoUrl;
  const captchaMode = infoQuery.data?.captchaMode ?? 'OFF';
  const siteKey = infoQuery.data?.turnstileSiteKey ?? '';
  const siteName = infoQuery.data?.siteName ?? 'RiriCloud';
  const passwordMinLength = infoQuery.data?.passwordMinLength ?? 8;

  useEffect(() => {
    if (!cooldown) return;
    const timer = window.setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  const form = useForm<ForgotPasswordForm>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '', verificationCode: '', newPassword: '', confirmPassword: '' }
  });

  const sendCodeMutation = useMutation({
    mutationFn: async (payload: CaptchaPayload) => {
      const email = form.getValues('email');
      return (await api.post('/verification/send-code', { email, action: 'RESET_PASSWORD', ...payload })).data;
    },
    onSuccess: () => {
      setCooldown(60);
      setCaptchaOpen(false);
      toast.success('验证码已发送，请查收邮件');
    },
    onError: (error) => toast.error(extractErrorMessage(error, '验证码发送失败'))
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async (values: ForgotPasswordForm) => {
      return (await api.post('/auth/reset-password', {
        email: values.email,
        code: values.verificationCode,
        newPassword: values.newPassword
      })).data;
    },
    onSuccess: () => {
      toast.success('密码重置成功，请使用新密码登录');
      navigate('/login', { replace: true });
    },
    onError: (error) => toast.error(extractErrorMessage(error, '密码重置失败'))
  });

  const requestCode = async () => {
    if (cooldown || sendCodeMutation.isPending) return;
    if (!(await form.trigger('email'))) return;
    if (captchaMode === 'OFF') {
      sendCodeMutation.mutate({});
    } else {
      setCaptchaOpen(true);
    }
  };

  const onSubmit = (values: ForgotPasswordForm) => {
    if (values.newPassword.length < passwordMinLength) {
      form.setError('newPassword', { message: `密码至少 ${passwordMinLength} 位` });
      return;
    }
    resetPasswordMutation.mutate(values);
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/40 p-3 sm:p-4">
      <Card className="w-full max-w-sm animate-in fade-in-0 zoom-in-[0.985] duration-300 ease-out">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex items-center gap-2">
            {logoUrl ? <img src={logoUrl} alt="" className="h-6 w-6 rounded object-contain" /> : <Cloud className="h-6 w-6" />}
            <span className="text-lg font-semibold">{siteName}</span>
          </div>
          <CardTitle>找回密码</CardTitle>
          <CardDescription>输入绑定的邮箱与收到的验证码，设置新登录密码</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>注册邮箱</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="请输入绑定的邮箱" autoComplete="username" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="verificationCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>邮箱验证码</FormLabel>
                    <div className="flex gap-2">
                      <FormControl>
                        <Input inputMode="numeric" placeholder="6 位验证码" autoComplete="one-time-code" {...field} />
                      </FormControl>
                      <Button
                        type="button"
                        variant="outline"
                        className="shrink-0"
                        onClick={() => void requestCode()}
                        disabled={cooldown > 0 || sendCodeMutation.isPending}
                      >
                        <Mail className="size-4" />
                        {cooldown ? `${cooldown}s` : '获取验证码'}
                      </Button>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="newPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>新密码</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder={`请设置 ${passwordMinLength}-64 位，含大小写、数字和特殊字符`} autoComplete="new-password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>确认新密码</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="请再次输入新密码" autoComplete="new-password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" className="w-full" disabled={resetPasswordMutation.isPending}>
                {resetPasswordMutation.isPending ? <Loader2 className="animate-spin" /> : <KeyRound className="size-4" />}
                重置密码
              </Button>

              <p className="text-muted-foreground text-center text-sm">
                记起密码了？{' '}
                <Link className="text-primary underline-offset-4 hover:underline" to="/login">
                  返回登录
                </Link>
              </p>
            </form>
          </Form>
        </CardContent>
      </Card>
      <div className="mt-6 flex flex-col items-center gap-2 text-center text-xs text-muted-foreground">
        <SupportContactsInline settings={infoQuery.data} />
        {infoQuery.data?.footerCopyright ? <p>{infoQuery.data.footerCopyright}</p> : <p>© {new Date().getFullYear()} {siteName}</p>}
      </div>
      <CaptchaDialog
        open={captchaOpen}
        mode={captchaMode}
        siteKey={siteKey}
        action="reset-password"
        onOpenChange={setCaptchaOpen}
        onVerified={(payload) => sendCodeMutation.mutate(payload)}
      />
    </div>
  );
}
