import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { z } from 'zod';
import { Cloud, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';

interface PublicInfo {
  siteName: string;
  registrationEnabled: boolean;
}

const loginSchema = z.object({
  email: z.string().email('请输入有效的邮箱地址'),
  password: z.string().min(8, '密码至少 8 位')
});

type LoginForm = z.infer<typeof loginSchema>;

interface MeResponse {
  id: string;
  email: string;
  role: 'ADMIN' | 'USER';
}

export default function LoginPage() {
  const setAuth = useAuthStore((s) => s.setAuth);
  const navigate = useNavigate();
  const infoQuery = useQuery({
    queryKey: ['system', 'public-info'],
    queryFn: async () => (await api.get<PublicInfo>('/system/public-info')).data
  });
  const siteName = infoQuery.data?.siteName ?? 'RiriCloud';

  const form = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' }
  });

  const loginMutation = useMutation({
    mutationFn: async (values: LoginForm) => {
      const { data } = await api.post<{ accessToken: string }>('/auth/login', values);
      const me = await api.get<MeResponse>('/auth/me', {
        headers: { Authorization: `Bearer ${data.accessToken}` }
      });
      return { token: data.accessToken, user: me.data };
    },
    onSuccess: ({ token, user }) => {
      setAuth(token, user);
      toast.success('登录成功');
      navigate('/', { replace: true });
    },
    onError: (error: AxiosError<{ message?: string }>) => {
      toast.error(error.response?.data?.message ?? '登录失败，请检查邮箱与密码');
    }
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex items-center gap-2">
            <Cloud className="h-6 w-6" />
            <span className="text-lg font-semibold">{siteName}</span>
          </div>
          <CardTitle>登录</CardTitle>
          <CardDescription>输入账号信息进入控制面板</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form className="space-y-4" onSubmit={form.handleSubmit((v) => loginMutation.mutate(v))}>
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>邮箱</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="admin@riricloud.local" autoComplete="username" {...field} />
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
                      <Input type="password" placeholder="••••••••" autoComplete="current-password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full" disabled={loginMutation.isPending}>
                {loginMutation.isPending ? <Loader2 className="animate-spin" /> : null}
                登录
              </Button>
              {infoQuery.data?.registrationEnabled ? (
                <p className="text-muted-foreground text-center text-sm">
                  还没有账号？
                  <a className="text-primary underline-offset-4 hover:underline" href="/register">
                    注册
                  </a>
                </p>
              ) : null}
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
