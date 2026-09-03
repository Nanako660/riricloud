import { useEffect, type InputHTMLAttributes } from 'react';
import { useForm, useFormContext, type FieldPath } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import CodeMirror from '@uiw/react-codemirror';
import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { useTheme } from 'next-themes';
import { z } from 'zod';
import { Code2, Gauge, Globe2, Link2, Palette, RotateCcw, Save, ShieldCheck, UsersRound, type LucideIcon } from 'lucide-react';
import type { Extension } from '@codemirror/state';
import { toast } from 'sonner';
import { api, extractErrorMessage } from '@/lib/api';
import { usePublicSettings } from '@/lib/public-settings';
import { useAdminPlans } from '@/pages/admin/plans/use-plans';
import { useAdminTemplates } from '@/pages/admin/templates/use-templates';
import { ProbePresetEditor } from './components/probe-preset-editor';
import { probePresetTargetsSchema, toProbePresetFormValue, toProbePresetTarget, type ProbePresetTarget } from './components/probe-preset-schema';
import { PageContainer, PageHeader } from '@/components/shared/page-container';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog';

interface SystemSettings {
  siteName: string;
  siteDescription: string;
  publicBaseUrl: string;
  logoUrl: string;
  faviconUrl: string;
  siteAnnouncement: string;
  footerCopyright: string;
  supportTelegramUrl: string;
  supportDiscordUrl: string;
  supportEmail: string;
  supportCustomUrl: string;
  registrationEnabled: boolean;
  defaultPlanId: string | null;
  defaultTrafficLimitBytes: number;
  defaultBalance: number;
  defaultValidityDays: number;
  emailDomainMode: 'none' | 'whitelist' | 'blacklist';
  emailDomainList: string[];
  passwordMinLength: number;
  subscriptionBaseUrl: string;
  subscriptionShortLinksEnabled: boolean;
  subscriptionUpdateIntervalHours: number;
  defaultTemplateId: string | null;
  publicLinesEnabled: boolean;
  includeUsageHeaders: boolean;
  heartbeatTimeoutSecs: number;
  configSyncDebounceMs: number;
  defaultPollIntervalSecs: number;
  binaryDownloadBaseUrl: string;
  probePresetTargets: ProbePresetTarget[];
  jwtSessionDays: number;
  customCss: string;
  customHeadHtml: string;
}

const settingsSchema = z.object({
  siteName: z.string().trim().min(1, '站点名不能为空').max(32),
  siteDescription: z.string().max(120),
  publicBaseUrl: z.string().refine(isBlankOrUrl, '请输入有效的全站访问 URL'),
  logoUrl: z.string().refine(isBlankOrUrl, '请输入有效的 Logo URL'),
  faviconUrl: z.string().refine(isBlankOrUrl, '请输入有效的 Favicon URL'),
  siteAnnouncement: z.string().max(10000),
  footerCopyright: z.string().max(200),
  supportTelegramUrl: z.string().refine(isBlankOrUrl, '请输入有效的 Telegram URL'),
  supportDiscordUrl: z.string().refine(isBlankOrUrl, '请输入有效的 Discord URL'),
  supportEmail: z.string().refine((value) => !value || z.string().email().safeParse(value).success, '请输入有效的客服邮箱'),
  supportCustomUrl: z.string().refine(isBlankOrUrl, '请输入有效的支持 URL'),
  registrationEnabled: z.boolean(),
  defaultPlanId: z.string(),
  defaultQuotaGB: z.coerce.number().int().min(1, '至少 1 GB').max(1048576, '不能超过 1 PB'),
  defaultBalanceYuan: z.coerce.number().min(0, '余额不能为负数').multipleOf(0.01, '最多保留两位小数'),
  defaultValidityDays: z.coerce.number().int().min(0).max(3650),
  emailDomainMode: z.enum(['none', 'whitelist', 'blacklist']),
  emailDomainListText: z.string().max(16000),
  passwordMinLength: z.coerce.number().int().min(8).max(64),
  subscriptionBaseUrl: z.string().refine(isBlankOrUrl, '请输入有效的订阅基准 URL'),
  subscriptionShortLinksEnabled: z.boolean(),
  subscriptionUpdateIntervalHours: z.coerce.number().int().min(1).max(168),
  defaultTemplateId: z.string(),
  publicLinesEnabled: z.boolean(),
  includeUsageHeaders: z.boolean(),
  heartbeatTimeoutSecs: z.coerce.number().int().min(5).max(3600),
  configSyncDebounceMs: z.coerce.number().int().min(0).max(10000),
  defaultPollIntervalSecs: z.coerce.number().int().min(5).max(300),
  binaryDownloadBaseUrl: z.string().refine(isBlankOrUrl, '请输入有效的二进制分发 URL'),
  probePresetTargets: probePresetTargetsSchema,
  jwtSessionDays: z.coerce.number().int().min(1).max(30),
  customCss: z.string().max(50000),
  customHeadHtml: z.string().max(20000)
});

export type SettingsForm = z.infer<typeof settingsSchema>;

export default function AdminSettingsPage() {
  const queryClient = useQueryClient();
  const publicSettings = usePublicSettings();
  const plans = useAdminPlans();
  const templates = useAdminTemplates();
  const settingsQuery = useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: async () => (await api.get<SystemSettings>('/admin/settings')).data
  });
  const form = useForm<SettingsForm>({
    resolver: zodResolver(settingsSchema),
    defaultValues: toForm({
      siteName: '', siteDescription: '', publicBaseUrl: '', logoUrl: '', faviconUrl: '', siteAnnouncement: '', footerCopyright: '',
      supportTelegramUrl: '', supportDiscordUrl: '', supportEmail: '', supportCustomUrl: '', registrationEnabled: false,
      defaultPlanId: null, defaultTrafficLimitBytes: 100 * 1024 ** 3, defaultValidityDays: 0, emailDomainMode: 'none',
      defaultBalance: 0,
      emailDomainList: [], passwordMinLength: 8, subscriptionBaseUrl: '', subscriptionShortLinksEnabled: false, subscriptionUpdateIntervalHours: 24,
      defaultTemplateId: null, publicLinesEnabled: true, includeUsageHeaders: true, heartbeatTimeoutSecs: 15,
      configSyncDebounceMs: 250, defaultPollIntervalSecs: 15, binaryDownloadBaseUrl: '', probePresetTargets: [],
      jwtSessionDays: 1, customCss: '', customHeadHtml: ''
    })
  });

  useEffect(() => {
    if (settingsQuery.data) form.reset(toForm(settingsQuery.data));
  }, [settingsQuery.data, form]);

  const saveMutation = useMutation({
    mutationFn: async (values: SettingsForm) => (await api.put<SystemSettings>('/admin/settings', toPayload(values))).data,
    onSuccess: (settings) => {
      form.reset(toForm(settings));
      toast.success('设置已保存');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] });
      void queryClient.invalidateQueries({ queryKey: ['system', 'public-info'] });
    },
    onError: (error) => toast.error(extractErrorMessage(error, '保存失败'))
  });
  const resetMutation = useMutation({
    mutationFn: async () => (await api.post<SystemSettings>('/admin/settings/reset', {})).data,
    onSuccess: (settings) => {
      form.reset(toForm(settings));
      toast.success('已恢复全部默认值');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] });
      void queryClient.invalidateQueries({ queryKey: ['system', 'public-info'] });
    },
    onError: (error) => toast.error(extractErrorMessage(error, '重置失败'))
  });

  if (settingsQuery.isPending) {
    return <PageContainer><PageHeader title="系统设置" /><Skeleton className="h-[520px] w-full" /></PageContainer>;
  }

  return (
    <PageContainer>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <PageHeader title="系统设置" description="统一管理站点品牌、注册策略、订阅分发与 Agent 运维参数。" />
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <AlertDialog>
            <AlertDialogTrigger asChild><Button type="button" variant="outline" className="w-full sm:w-auto" disabled={resetMutation.isPending}><RotateCcw />重置默认值</Button></AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader><AlertDialogTitle>恢复全部默认设置？</AlertDialogTitle><AlertDialogDescription>所有自定义站点、注册、订阅和运维参数都会恢复为内置安全默认值，保存后立即生效。</AlertDialogDescription></AlertDialogHeader>
              <AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => resetMutation.mutate()}>确认恢复</AlertDialogAction></AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button type="button" className="w-full sm:w-auto" disabled={saveMutation.isPending} onClick={() => form.handleSubmit((values) => saveMutation.mutate(values))()}><Save />{saveMutation.isPending ? '保存中…' : '保存设置'}</Button>
        </div>
      </div>

      <Form {...form}>
        <form className="min-w-0" onSubmit={form.handleSubmit((values) => saveMutation.mutate(values))}>
          <Tabs defaultValue="branding" className="space-y-4">
            <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto p-1">
              <TabsTrigger className="shrink-0" value="branding"><Palette className="h-4 w-4 shrink-0" />基础与品牌</TabsTrigger>
              <TabsTrigger className="shrink-0" value="users"><UsersRound className="h-4 w-4 shrink-0" />注册与用户</TabsTrigger>
              <TabsTrigger className="shrink-0" value="subscription"><Globe2 className="h-4 w-4 shrink-0" />订阅与分发</TabsTrigger>
              <TabsTrigger className="shrink-0" value="agent"><Gauge className="h-4 w-4 shrink-0" />Agent 运维</TabsTrigger>
              <TabsTrigger className="shrink-0" value="advanced"><ShieldCheck className="h-4 w-4 shrink-0" />安全与高级</TabsTrigger>
            </TabsList>

            <TabsContent value="branding"><Card><CardHeader><SectionTitle icon={Palette} title="基础与品牌" description="这些信息会同步到登录页、侧边栏、页脚和用户订阅控制台。" /></CardHeader><CardContent className="grid gap-5 md:grid-cols-2">
               <SettingsInput name="siteName" label="站点名称" placeholder="RiriCloud" />
               <SettingsInput name="siteDescription" label="副标题描述" placeholder="多节点代理管理面板" />
               <div className="space-y-2 md:col-span-2"><SettingsInput name="publicBaseUrl" label="全站访问 URL" placeholder="https://panel.example.com" description="用于生成 Agent 安装命令、升级地址和二进制下载地址；留空时自动匹配当前访问域名。" /><SetOriginButton name="publicBaseUrl" /></div>
              <SettingsInput name="logoUrl" label="Logo URL" placeholder="https://cdn.example.com/logo.svg" description="留空时使用默认云朵图标。" />
              <SettingsInput name="faviconUrl" label="Favicon URL" placeholder="https://cdn.example.com/favicon.ico" />
              <SettingsTextarea name="siteAnnouncement" label="全局公告横幅" className="md:col-span-2" rows={5} description="支持标题、粗体、列表、行内代码和安全的 HTTPS 链接 Markdown。" />
              <SettingsInput name="footerCopyright" label="页脚版权" placeholder="© 2026 RiriCloud" />
              <SettingsInput name="supportEmail" label="客服邮箱" placeholder="support@example.com" />
              <SettingsInput name="supportTelegramUrl" label="Telegram 客服 / 群组" placeholder="https://t.me/riricloud" />
              <SettingsInput name="supportDiscordUrl" label="Discord 客服 / 群组" placeholder="https://discord.gg/example" />
              <SettingsInput name="supportCustomUrl" label="自定义支持链接" placeholder="https://example.com/support" />
            </CardContent></Card></TabsContent>

            <TabsContent value="users"><Card><CardHeader><SectionTitle icon={UsersRound} title="注册与用户策略" description="控制新用户注册条件和首次登录时的默认权益。" /></CardHeader><CardContent className="grid gap-5 md:grid-cols-2">
              <SettingsSwitch name="registrationEnabled" label="开放注册" description="关闭后公开注册接口和注册页入口都会拒绝新用户。" className="md:col-span-2" />
              <SettingsSelect name="defaultPlanId" label="新用户默认套餐" options={[{ value: 'none', label: '不自动绑定套餐' }, ...(plans.data ?? []).map((plan) => ({ value: plan.id, label: plan.name }))]} description="绑定后注册会立即生成有效订阅和订阅链接。" />
              <SettingsInput name="defaultQuotaGB" label="默认流量配额（GB）" type="number" min={1} />
              <SettingsInput name="defaultBalanceYuan" label="新用户注册初始余额（元）" type="number" min={0} description="注册赠金会记录为 SYSTEM_GIFT 流水。" />
              <SettingsInput name="defaultValidityDays" label="默认有效天数" type="number" min={0} description="0 表示永久有效；配置套餐时以套餐周期为准。" />
              <SettingsInput name="passwordMinLength" label="密码最小长度" type="number" min={8} max={64} />
              <SettingsSelect name="emailDomainMode" label="邮箱域名过滤模式" options={[{ value: 'none', label: '不限制' }, { value: 'whitelist', label: '白名单，仅允许列表域名' }, { value: 'blacklist', label: '黑名单，拒绝列表域名' }]} />
              <SettingsTextarea name="emailDomainListText" label="邮箱域名列表" rows={5} className="md:col-span-2" description="每行一个域名，例如 example.com；不需要填写 @。" />
            </CardContent></Card></TabsContent>

            <TabsContent value="subscription"><Card><CardHeader><SectionTitle icon={Globe2} title="订阅与客户端分发" description="配置客户端获取订阅的地址、更新节奏与默认模板。" /></CardHeader><CardContent className="grid gap-5 md:grid-cols-2">
               <div className="space-y-2 md:col-span-2"><SettingsInput name="subscriptionBaseUrl" label="订阅基准 URL" placeholder="https://panel.example.com" description="用于用户端拼装订阅链接；可包含 Nginx 对外使用的路径，留空时使用当前面板地址。" /><SetOriginButton name="subscriptionBaseUrl" /></div>
              <SettingsSwitch name="subscriptionShortLinksEnabled" label="使用 Nginx 伪静态短链接" description="开启后展示 https://domain.com/<UUID>；请先在 Nginx 中配置对应 rewrite 规则。" />
              <SettingsInput name="subscriptionUpdateIntervalHours" label="客户端更新周期（小时）" type="number" min={1} max={168} />
              <SettingsSelect name="defaultTemplateId" label="全局默认订阅模板" options={[{ value: 'none', label: '不指定，回退到标记为默认的模板' }, ...(templates.data ?? []).map((template) => ({ value: template.id, label: `${template.name}${template.isDefault ? '（当前默认）' : ''}` }))]} />
              <SettingsSwitch name="publicLinesEnabled" label="公开线路列表" description="关闭后用户订阅和线路页不再返回公开线路。" />
              <SettingsSwitch name="includeUsageHeaders" label="注入用量响应头" description="向订阅响应附加 Subscription-Userinfo。" />
            </CardContent></Card></TabsContent>

            <TabsContent value="agent"><Card><CardHeader><SectionTitle icon={Gauge} title="Agent 运维与网络探针" description="调整节点健康判定、配置推送和 HTTP 轮询行为。" /></CardHeader><CardContent className="grid gap-5 md:grid-cols-2">
              <SettingsInput name="heartbeatTimeoutSecs" label="心跳离线判定超时（秒）" type="number" min={5} max={3600} />
              <SettingsInput name="configSyncDebounceMs" label="配置同步防抖（毫秒）" type="number" min={0} max={10000} />
              <SettingsInput name="defaultPollIntervalSecs" label="默认 HTTP 轮询周期（秒）" type="number" min={5} max={300} />
              <SettingsInput name="binaryDownloadBaseUrl" label="二进制分发基准 URL" placeholder="https://downloads.example.com/riricloud" description="留空时优先使用 RIRICLOUD_PUBLIC_URL。" />
              <ProbePresetEditor />
            </CardContent></Card></TabsContent>

            <TabsContent value="advanced"><Card><CardHeader><SectionTitle icon={ShieldCheck} title="安全与高级个性化" description="控制会话有效期，并为已登录面板注入自定义样式与头部代码。" /></CardHeader><CardContent className="space-y-6">
              <div className="max-w-2xl"><SettingsInput name="jwtSessionDays" label="JWT 会话有效天数" type="number" min={1} max={30} description="安全提示：缩短会话周期可以降低长期凭据泄漏风险，修改后新登录会使用新周期。" /></div>
              <SettingsEditor name="customCss" label="自定义 CSS" extensions={[css()]} description="样式只注入当前面板页面，适合覆盖主题变量或品牌细节。" />
              <SettingsEditor name="customHeadHtml" label="自定义 HTML / JavaScript 头部代码" extensions={[html()]} description="内容会原样挂载到 document.head，请只粘贴可信代码。" />
            </CardContent></Card></TabsContent>
          </Tabs>
          <div className="flex justify-end pt-4"><Button type="submit" className="w-full sm:w-auto" disabled={saveMutation.isPending}><Save />{saveMutation.isPending ? '保存中…' : '保存设置'}</Button></div>
        </form>
      </Form>
      {publicSettings.isError ? <p className="text-xs text-muted-foreground">公开站点信息暂时不可用，保存后会自动重试同步。</p> : null}
    </PageContainer>
  );
}

function SectionTitle({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  return <><CardTitle className="flex items-center gap-2 text-base"><Icon className="h-5 w-5" />{title}</CardTitle><CardDescription>{description}</CardDescription></>;
}

function SettingsInput({ name, label, description, type = 'text', placeholder, min, max }: { name: FieldPath<SettingsForm>; label: string; description?: string; type?: InputHTMLAttributes<HTMLInputElement>['type']; placeholder?: string; min?: number; max?: number }) {
  const { control } = useFormContext<SettingsForm>();
  return <FormField control={control} name={name} render={({ field }) => <FormItem><FormLabel>{label}</FormLabel><FormControl><Input {...field} type={type} min={min} max={max} placeholder={placeholder} value={field.value == null ? '' : String(field.value)} onChange={(event) => field.onChange(event.target.value)} /></FormControl>{description ? <FormDescription>{description}</FormDescription> : null}<FormMessage /></FormItem>} />;
}

function SettingsTextarea({ name, label, description, rows = 4, className }: { name: FieldPath<SettingsForm>; label: string; description?: string; rows?: number; className?: string }) {
  const { control } = useFormContext<SettingsForm>();
  return <FormField control={control} name={name} render={({ field }) => <FormItem className={className}><FormLabel>{label}</FormLabel><FormControl><Textarea {...field} rows={rows} value={String(field.value ?? '')} /></FormControl>{description ? <FormDescription>{description}</FormDescription> : null}<FormMessage /></FormItem>} />;
}

function SettingsSwitch({ name, label, description, className }: { name: FieldPath<SettingsForm>; label: string; description: string; className?: string }) {
  const { control } = useFormContext<SettingsForm>();
  return <FormField control={control} name={name} render={({ field }) => <FormItem className={`flex flex-row items-start justify-between gap-4 rounded-lg border p-4 shadow-sm ${className ?? ''}`}><div className="min-w-0 space-y-0.5"><FormLabel>{label}</FormLabel><FormDescription className="break-words">{description}</FormDescription></div><FormControl><Switch className="shrink-0" checked={Boolean(field.value)} onCheckedChange={field.onChange} /></FormControl></FormItem>} />;
}

function SettingsSelect({ name, label, description, options }: { name: FieldPath<SettingsForm>; label: string; description?: string; options: Array<{ value: string; label: string }> }) {
  const { control } = useFormContext<SettingsForm>();
  return <FormField control={control} name={name} render={({ field }) => <FormItem><FormLabel>{label}</FormLabel><Select value={String(field.value || 'none')} onValueChange={(value) => field.onChange(value === 'none' ? 'none' : value)}><FormControl><SelectTrigger><SelectValue placeholder="请选择" /></SelectTrigger></FormControl><SelectContent>{options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select>{description ? <FormDescription>{description}</FormDescription> : null}<FormMessage /></FormItem>} />;
}

function SettingsEditor({ name, label, description, extensions }: { name: FieldPath<SettingsForm>; label: string; description: string; extensions: Extension[] }) {
  const { control } = useFormContext<SettingsForm>();
  const { resolvedTheme } = useTheme();
  const editorTheme = resolvedTheme === 'dark' ? 'dark' : 'light';
  return <FormField control={control} name={name} render={({ field }) => <FormItem className="min-w-0"><FormLabel className="flex items-center gap-2"><Code2 className="h-4 w-4" />{label}</FormLabel><FormControl><div className="min-w-0 overflow-hidden rounded-md border bg-background shadow-sm"><CodeMirror value={String(field.value ?? '')} height="220px" theme={editorTheme} extensions={extensions} basicSetup={{ lineNumbers: true, foldGutter: true }} onChange={field.onChange} /></div></FormControl><FormDescription>{description}</FormDescription><FormMessage /></FormItem>} />;
}

function SetOriginButton({ name }: { name: 'publicBaseUrl' | 'subscriptionBaseUrl' }) {
  const { setValue } = useFormContext<SettingsForm>();
  return <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => setValue(name, window.location.origin, { shouldDirty: true })}><Link2 />使用当前面板地址</Button>;
}

function toForm(settings: SystemSettings): SettingsForm {
  return {
    siteName: settings.siteName,
    siteDescription: settings.siteDescription,
    publicBaseUrl: settings.publicBaseUrl,
    logoUrl: settings.logoUrl,
    faviconUrl: settings.faviconUrl,
    siteAnnouncement: settings.siteAnnouncement,
    footerCopyright: settings.footerCopyright,
    supportTelegramUrl: settings.supportTelegramUrl,
    supportDiscordUrl: settings.supportDiscordUrl,
    supportEmail: settings.supportEmail,
    supportCustomUrl: settings.supportCustomUrl,
    registrationEnabled: settings.registrationEnabled,
    defaultPlanId: settings.defaultPlanId ?? 'none',
    defaultQuotaGB: Math.max(1, Math.round(settings.defaultTrafficLimitBytes / 1024 ** 3)),
    defaultBalanceYuan: settings.defaultBalance / 100,
    defaultValidityDays: settings.defaultValidityDays,
    emailDomainMode: settings.emailDomainMode,
    emailDomainListText: settings.emailDomainList.join('\n'),
    passwordMinLength: settings.passwordMinLength,
    subscriptionBaseUrl: settings.subscriptionBaseUrl,
    subscriptionShortLinksEnabled: settings.subscriptionShortLinksEnabled,
    subscriptionUpdateIntervalHours: settings.subscriptionUpdateIntervalHours,
    defaultTemplateId: settings.defaultTemplateId ?? 'none',
    publicLinesEnabled: settings.publicLinesEnabled,
    includeUsageHeaders: settings.includeUsageHeaders,
    heartbeatTimeoutSecs: settings.heartbeatTimeoutSecs,
    configSyncDebounceMs: settings.configSyncDebounceMs,
    defaultPollIntervalSecs: settings.defaultPollIntervalSecs,
    binaryDownloadBaseUrl: settings.binaryDownloadBaseUrl,
    probePresetTargets: settings.probePresetTargets.map(toProbePresetFormValue),
    jwtSessionDays: settings.jwtSessionDays,
    customCss: settings.customCss,
    customHeadHtml: settings.customHeadHtml
  };
}

function toPayload(values: SettingsForm) {
  return {
    siteName: values.siteName,
    siteDescription: values.siteDescription,
    publicBaseUrl: values.publicBaseUrl,
    logoUrl: values.logoUrl,
    faviconUrl: values.faviconUrl,
    siteAnnouncement: values.siteAnnouncement,
    footerCopyright: values.footerCopyright,
    supportTelegramUrl: values.supportTelegramUrl,
    supportDiscordUrl: values.supportDiscordUrl,
    supportEmail: values.supportEmail,
    supportCustomUrl: values.supportCustomUrl,
    registrationEnabled: values.registrationEnabled,
    defaultPlanId: values.defaultPlanId === 'none' ? null : values.defaultPlanId,
    defaultTrafficLimitBytes: Math.round(values.defaultQuotaGB * 1024 ** 3),
    defaultBalance: Math.round(values.defaultBalanceYuan * 100),
    emailDomainList: values.emailDomainListText.split(/\r?\n|,/).map((item) => item.trim().toLowerCase().replace(/^@+/, '')).filter(Boolean),
    defaultValidityDays: values.defaultValidityDays,
    emailDomainMode: values.emailDomainMode,
    passwordMinLength: values.passwordMinLength,
    subscriptionBaseUrl: values.subscriptionBaseUrl,
    subscriptionShortLinksEnabled: values.subscriptionShortLinksEnabled,
    subscriptionUpdateIntervalHours: values.subscriptionUpdateIntervalHours,
    defaultTemplateId: values.defaultTemplateId === 'none' ? null : values.defaultTemplateId,
    publicLinesEnabled: values.publicLinesEnabled,
    includeUsageHeaders: values.includeUsageHeaders,
    heartbeatTimeoutSecs: values.heartbeatTimeoutSecs,
    configSyncDebounceMs: values.configSyncDebounceMs,
    defaultPollIntervalSecs: values.defaultPollIntervalSecs,
    binaryDownloadBaseUrl: values.binaryDownloadBaseUrl,
    probePresetTargets: values.probePresetTargets.map(toProbePresetTarget),
    jwtSessionDays: values.jwtSessionDays,
    customCss: values.customCss,
    customHeadHtml: values.customHeadHtml
  };
}

function isBlankOrUrl(value: string) {
  return !value || /^https?:\/\//i.test(value);
}
