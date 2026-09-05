import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';
import { Cloud, Loader2, Mail, Timer } from 'lucide-react';
import { api, extractErrorMessage } from '@/lib/api';
import { usePublicSettings } from '@/lib/public-settings';
import { useAuthStore } from '@/stores/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { SupportContactsInline } from '@/components/shared/support-dialog';
import { CaptchaDialog, CaptchaInline, type CaptchaPayload } from '@/components/shared/captcha-challenge';

const registerSchema = z
  .object({
    email: z.string().email('请输入有效的邮箱地址'),
    nickname: z.string().max(20, '昵称最多 20 个字符').optional(),
    password: z.string().min(8, '密码至少 8 位').max(64),
    confirmPassword: z.string(),
    verificationCode: z.string().optional()
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: '两次输入的密码不一致',
    path: ['confirmPassword']
  });

type RegisterForm = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const setAuth = useAuthStore((s) => s.setAuth);
  const navigate = useNavigate();
  const infoQuery = usePublicSettings();
  const [captchaOpen, setCaptchaOpen] = useState(false);
  const [registerCaptcha, setRegisterCaptcha] = useState<CaptchaPayload | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const logoUrl = infoQuery.data?.logoUrl;
  const emailVerificationEnabled = infoQuery.data?.emailVerificationEnabled ?? false;
  const captchaMode = infoQuery.data?.captchaMode ?? 'OFF';
  const siteKey = infoQuery.data?.turnstileSiteKey ?? '';

  useEffect(() => {
    if (infoQuery.data && !infoQuery.data.registrationEnabled) {
      toast.error('当前站点未开放注册');
      navigate('/login', { replace: true });
    }
  }, [infoQuery.data, navigate]);

  useEffect(() => {
    if (!cooldown) return;
    const timer = window.setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  const form = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: '', nickname: '', password: '', confirmPassword: '', verificationCode: '' }
  });

  const sendCodeMutation = useMutation({
    mutationFn: async (payload: CaptchaPayload) => {
      const email = form.getValues('email');
      return (await api.post('/verification/send-code', { email, action: 'REGISTER', ...payload })).data;
    },
    onSuccess: () => {
      setCooldown(60);
      setCaptchaOpen(false);
      toast.success('验证码已发送，请查收邮件');
    },
    onError: (error) => toast.error(extractErrorMessage(error, '验证码发送失败'))
  });

  const registerMutation = useMutation({
    mutationFn: async (values: RegisterForm) => {
      const payload: Record<string, unknown> = {
        email: values.email,
        nickname: values.nickname?.trim() || undefined,
        password: values.password,
        ...(emailVerificationEnabled ? { verificationCode: values.verificationCode } : registerCaptcha ?? {})
      };
      const { data } = await api.post<{ accessToken: string }>('/auth/register', payload);
      const me = await api.get<{ id: string; email: string; role: 'ADMIN' | 'USER'; uid?: number | null; nickname?: string | null }>('/auth/me', {
        headers: { Authorization: `Bearer ${data.accessToken}` }
      });
      return { token: data.accessToken, user: me.data };
    },
    onSuccess: ({ token, user }) => {
      setAuth(token, user);
      toast.success('注册成功，欢迎使用');
      navigate('/', { replace: true });
    },
    onError: (error) => toast.error(extractErrorMessage(error, '注册失败'))
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

  const onSubmit = (values: RegisterForm) => {
    if (!emailVerificationEnabled && captchaMode !== 'OFF' && !registerCaptcha) {
      toast.error('请先完成人机验证');
      return;
    }
    if (emailVerificationEnabled && !values.verificationCode?.trim()) {
      form.setError('verificationCode', { message: '请输入邮箱验证码' });
      return;
    }
    registerMutation.mutate(values);
  };

  const siteName = infoQuery.data?.siteName ?? 'RiriCloud';
  const siteDescription = infoQuery.data?.siteDescription?.trim();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/40 p-3 sm:p-4">
      <Card className="w-full max-w-sm animate-in fade-in-0 zoom-in-[0.985] duration-300 ease-out">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex items-center gap-2">
            {logoUrl ? <img src={logoUrl} alt="" className="h-6 w-6 rounded object-contain" /> : <Cloud className="h-6 w-6" />}
            <span className="text-lg font-semibold">{siteName}</span>
          </div>
          <CardTitle>注册</CardTitle>
          {siteDescription ? <CardDescription>{siteDescription}</CardDescription> : null}
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
              <FormField control={form.control} name="email" render={({ field }) => <FormItem><FormLabel>邮箱</FormLabel><FormControl><Input type="email" placeholder="请输入常用邮箱" autoComplete="username" {...field} /></FormControl><FormMessage /></FormItem>} />
              <FormField control={form.control} name="nickname" render={({ field }) => <FormItem><FormLabel>昵称（选填）</FormLabel><FormControl><Input placeholder="留空则使用默认昵称" autoComplete="nickname" {...field} /></FormControl><FormMessage /></FormItem>} />
              <FormField control={form.control} name="password" render={({ field }) => <FormItem><FormLabel>密码</FormLabel><FormControl><Input type="password" placeholder="请设置 8-64 位密码" autoComplete="new-password" {...field} /></FormControl><FormMessage /></FormItem>} />
              <FormField control={form.control} name="confirmPassword" render={({ field }) => <FormItem><FormLabel>确认密码</FormLabel><FormControl><Input type="password" placeholder="请再次输入密码" autoComplete="new-password" {...field} /></FormControl><FormMessage /></FormItem>} />
              {emailVerificationEnabled ? (
                <FormField control={form.control} name="verificationCode" render={({ field }) => <FormItem><FormLabel>邮箱验证码</FormLabel><div className="flex gap-2"><FormControl><Input inputMode="numeric" placeholder="6 位验证码" autoComplete="one-time-code" {...field} /></FormControl><Button type="button" variant="outline" className="shrink-0" onClick={() => void requestCode()} disabled={cooldown > 0 || sendCodeMutation.isPending}><Mail />{cooldown ? `${cooldown}s` : '获取验证码'}</Button></div><FormMessage /></FormItem>} />
              ) : captchaMode !== 'OFF' ? (
                <CaptchaInline mode={captchaMode} siteKey={siteKey} onChange={setRegisterCaptcha} />
              ) : null}
              <Button type="submit" className="w-full" disabled={registerMutation.isPending || infoQuery.isPending}>
                {registerMutation.isPending ? <Loader2 className="animate-spin" /> : captchaMode !== 'OFF' && !emailVerificationEnabled ? <Timer /> : null}
                注册
              </Button>
              <p className="text-muted-foreground text-center text-sm">已有账号？ <Link className="text-primary underline-offset-4 hover:underline" to="/login">返回登录</Link></p>
            </form>
          </Form>
        </CardContent>
      </Card>
      <div className="mt-6 flex flex-col items-center gap-2 text-center text-xs text-muted-foreground">
        <SupportContactsInline settings={infoQuery.data} />
        {infoQuery.data?.footerCopyright ? <p>{infoQuery.data.footerCopyright}</p> : <p>© {new Date().getFullYear()} {siteName}</p>}
      </div>
      <CaptchaDialog open={captchaOpen} mode={captchaMode} siteKey={siteKey} onOpenChange={setCaptchaOpen} onVerified={(payload) => sendCodeMutation.mutate(payload)} />
    </div>
  );
}
