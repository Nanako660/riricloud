import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { z } from 'zod';
import { api, extractErrorMessage } from '@/lib/api';
import { PageContainer, PageHeader } from '@/components/shared/page-container';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';

interface SystemSettings {
  siteName: string;
  registrationEnabled: boolean;
  defaultTrafficLimitBytes: number;
}

const settingsSchema = z.object({
  siteName: z.string().min(1, '站点名不能为空').max(32, '不超过 32 字符'),
  registrationEnabled: z.boolean(),
  defaultQuotaGB: z.coerce.number().min(1, '至少 1 GB').max(1048576, '过大')
});

type SettingsForm = z.infer<typeof settingsSchema>;

export default function AdminSettingsPage() {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: async () => (await api.get<SystemSettings>('/admin/settings')).data
  });

  const form = useForm<SettingsForm>({
    resolver: zodResolver(settingsSchema),
    defaultValues: { siteName: '', registrationEnabled: false, defaultQuotaGB: 100 }
  });

  // 加载完成后回填
  useEffect(() => {
    if (settingsQuery.data) {
      form.reset({
        siteName: settingsQuery.data.siteName,
        registrationEnabled: settingsQuery.data.registrationEnabled,
        defaultQuotaGB: Math.round(settingsQuery.data.defaultTrafficLimitBytes / 1024 ** 3)
      });
    }
  }, [settingsQuery.data, form]);

  const saveMutation = useMutation({
    mutationFn: async (v: SettingsForm) =>
      (
        await api.put('/admin/settings', {
          siteName: v.siteName,
          registrationEnabled: v.registrationEnabled,
          defaultTrafficLimitBytes: Math.round(v.defaultQuotaGB * 1024 ** 3)
        })
      ).data,
    onSuccess: () => {
      toast.success('设置已保存');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] });
      void queryClient.invalidateQueries({ queryKey: ['system', 'public-info'] });
    },
    onError: (e) => toast.error(extractErrorMessage(e, '保存失败'))
  });

  if (settingsQuery.isPending) {
    return (
      <PageContainer>
        <PageHeader title="系统设置" />
        <Skeleton className="h-72 w-full" />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader title="系统设置" description="站点信息、注册与默认配额" />
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle className="text-base">基础设置</CardTitle>
          <CardDescription>修改即时生效；站点名会展示在登录页与侧边栏</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form className="space-y-6" onSubmit={form.handleSubmit((v) => saveMutation.mutate(v))}>
              <FormField
                control={form.control}
                name="siteName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>站点名称</FormLabel>
                    <FormControl>
                      <Input placeholder="RiriCloud" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="registrationEnabled"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel>开放注册</FormLabel>
                      <FormDescription>关闭后 /auth/register 拒绝新用户注册</FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="defaultQuotaGB"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>新用户默认配额（GB）</FormLabel>
                    <FormControl>
                      <Input type="number" min={1} {...field} />
                    </FormControl>
                    <FormDescription>用于注册用户与管理员创建用户时的缺省配额</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? '保存中…' : '保存设置'}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
