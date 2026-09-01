import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';
import { Cloud, Loader2 } from 'lucide-react';
import { api, extractErrorMessage } from '@/lib/api';
import { usePublicSettings } from '@/lib/public-settings';
import { useAuthStore } from '@/stores/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';

const registerSchema = z
  .object({
    email: z.string().email('请输入有效的邮箱地址'),
    password: z.string().min(8, '密码至少 8 位').max(64),
    confirmPassword: z.string()
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: '两次输入的密码不一致',
    path: ['confirmPassword']
  });

type RegisterForm = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const setAuth = useAuthStore((s) => s.setAuth);
  const navigate = useNavigate();

  // 注册开关：关闭时提示并引导回登录页
  const infoQuery = usePublicSettings();
  const logoUrl = infoQuery.data?.logoUrl;

  useEffect(() => {
    if (infoQuery.data && !infoQuery.data.registrationEnabled) {
      toast.error('当前站点未开放注册');
      navigate('/login', { replace: true });
    }
  }, [infoQuery.data, navigate]);

  const form = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: '', password: '', confirmPassword: '' }
  });

  const registerMutation = useMutation({
    mutationFn: async (values: { email: string; password: string }) => {
      const { data } = await api.post<{ accessToken: string }>('/auth/register', values);
      const me = await api.get<{ id: string; email: string; role: 'ADMIN' | 'USER' }>('/auth/me', {
        headers: { Authorization: `Bearer ${data.accessToken}` }
      });
      return { token: data.accessToken, user: me.data };
    },
    onSuccess: ({ token, user }) => {
      setAuth(token, user);
      toast.success('注册成功，欢迎使用');
      navigate('/', { replace: true });
    },
    onError: (e) => toast.error(extractErrorMessage(e, '注册失败'))
  });

  const siteName = infoQuery.data?.siteName ?? 'RiriCloud';

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm animate-in fade-in-0 zoom-in-[0.985] duration-300 ease-out">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex items-center gap-2">
            {logoUrl ? <img src={logoUrl} alt="" className="h-6 w-6 rounded object-contain" /> : <Cloud className="h-6 w-6" />}
            <span className="text-lg font-semibold">{siteName}</span>
          </div>
          <CardTitle>注册</CardTitle>
          <CardDescription>{infoQuery.data?.siteDescription || '创建账号即可开始使用'}</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form className="space-y-4" onSubmit={form.handleSubmit((v) => registerMutation.mutate({ email: v.email, password: v.password }))}>
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>邮箱</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="user@example.com" autoComplete="username" {...field} />
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
                    <FormLabel>密码</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="至少 8 位" autoComplete="new-password" {...field} />
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
                    <FormLabel>确认密码</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="再次输入密码" autoComplete="new-password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full" disabled={registerMutation.isPending}>
                {registerMutation.isPending ? <Loader2 className="animate-spin" /> : null}
                注册
              </Button>
              <p className="text-muted-foreground text-center text-sm">
                已有账号？
                <Link className="text-primary underline-offset-4 hover:underline" to="/login">
                  返回登录
                </Link>
              </p>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
