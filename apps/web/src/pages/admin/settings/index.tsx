import { useEffect, useState, type InputHTMLAttributes } from 'react';
import { Link } from 'react-router-dom';
import { useForm, useFormContext, type FieldPath } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import CodeMirror from '@uiw/react-codemirror';
import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { useTheme } from 'next-themes';
import { z } from 'zod';
import { Clock, Code2, Gauge, Globe2, Link2, Mail, Palette, RotateCcw, Save, Send, ShieldCheck, UsersRound, type LucideIcon } from 'lucide-react';
import type { Extension } from '@codemirror/state';
import { toast } from 'sonner';
import { api, extractErrorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';
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
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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

const COMMON_TIMEZONES = [
  { value: 'Asia/Shanghai', label: 'Asia/Shanghai（北京 / 上海 / 香港 / 台北 · UTC+8）' },
  { value: 'Asia/Tokyo', label: 'Asia/Tokyo（东京 / 首尔 · UTC+9）' },
  { value: 'Asia/Singapore', label: 'Asia/Singapore（新加坡 · UTC+8）' },
  { value: 'UTC', label: 'UTC（协调世界时 · UTC+0）' },
  { value: 'Europe/London', label: 'Europe/London（伦敦 · UTC+0/+1）' },
  { value: 'Europe/Paris', label: 'Europe/Paris（巴黎 / 柏林 · UTC+1/+2）' },
  { value: 'America/New_York', label: 'America/New_York（纽约 / 美东 · UTC-5/-4）' },
  { value: 'America/Los_Angeles', label: 'America/Los_Angeles（洛杉矶 / 美西 · UTC-8/-7）' },
  { value: 'Australia/Sydney', label: 'Australia/Sydney（悉尼 / 墨尔本 · UTC+10/+11）' }
];

function isValidTimezone(value: string): boolean {
  if (!value || !value.trim()) return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: value.trim() });
    return true;
  } catch {
    return false;
  }
}

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
  systemTimezone: string;
  defaultPlanId: string | null;
  defaultBalance: number;
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
  lineSpeedtestEnabled: boolean;
  lineSpeedtestIntervalMins: number;
  lineSpeedtestTargetUrl: string;
  lineSpeedtestTimeoutMs: number;
  smtpEnabled: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPass: string;
  smtpFrom: string;
  emailVerificationEnabled: boolean;
  enforceEmailVerification: boolean;
  captchaMode: 'OFF' | 'LOCAL' | 'TURNSTILE';
  turnstileSiteKey: string;
  turnstileSecretKey: string;
}

const settingsSchema = z.object({
  siteName: z.string().trim().min(1, '站点名不能为空').max(32),
  siteDescription: z.string().max(120),
  publicBaseUrl: z.string().refine(isBlankOrUrl, '请输入有效的全站访问 URL'),
  systemTimezone: z.string().trim().min(1, '时区不能为空').refine(isValidTimezone, '请输入有效的 IANA 时区标识（例如 Asia/Shanghai 或 UTC）'),
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
  defaultBalanceYuan: z.coerce.number().min(0, '余额不能为负数').multipleOf(0.01, '最多保留两位小数'),
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
  customHeadHtml: z.string().max(20000),
  lineSpeedtestEnabled: z.boolean(),
  lineSpeedtestIntervalMins: z.coerce.number().int().min(1).max(1440),
  lineSpeedtestTargetUrl: z.string().refine(isBlankOrUrl, '请输入有效的测速目标 URL'),
  lineSpeedtestTimeoutMs: z.coerce.number().int().min(500).max(30000),
  smtpEnabled: z.boolean(),
  smtpHost: z.string().max(255),
  smtpPort: z.coerce.number().int().min(1).max(65535),
  smtpSecure: z.boolean(),
  smtpUser: z.string().max(255),
  smtpPass: z.string().max(512),
  smtpFrom: z.string().max(255),
  emailVerificationEnabled: z.boolean(),
  enforceEmailVerification: z.boolean(),
  captchaMode: z.enum(['OFF', 'LOCAL', 'TURNSTILE']),
  turnstileSiteKey: z.string().max(255),
  turnstileSecretKey: z.string().max(512)
});

export type SettingsForm = z.infer<typeof settingsSchema>;

export default function AdminSettingsPage() {
  const queryClient = useQueryClient();
  const publicSettings = usePublicSettings();
  const plans = useAdminPlans();
  const templates = useAdminTemplates();
  const [smtpTestOpen, setSmtpTestOpen] = useState(false);
  const [smtpTestEmail, setSmtpTestEmail] = useState('');
  const settingsQuery = useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: async () => (await api.get<SystemSettings>('/admin/settings')).data
  });
  const defaultTemplate = templates.data?.find((t) => t.isDefault) ?? templates.data?.find((t) => t.id === settingsQuery.data?.defaultTemplateId);
  const form = useForm<SettingsForm>({
    resolver: zodResolver(settingsSchema),
    defaultValues: toForm({
      siteName: '', siteDescription: '', publicBaseUrl: '', logoUrl: '', faviconUrl: '', siteAnnouncement: '', footerCopyright: '',
      supportTelegramUrl: '', supportDiscordUrl: '', supportEmail: '', supportCustomUrl: '', registrationEnabled: false,
      systemTimezone: 'Asia/Shanghai',
      defaultPlanId: null, defaultBalance: 0, emailDomainMode: 'none',
      emailDomainList: [], passwordMinLength: 8, subscriptionBaseUrl: '', subscriptionShortLinksEnabled: false, subscriptionUpdateIntervalHours: 24,
      defaultTemplateId: null, publicLinesEnabled: true, includeUsageHeaders: true, heartbeatTimeoutSecs: 15,
      configSyncDebounceMs: 250, defaultPollIntervalSecs: 15, binaryDownloadBaseUrl: '', probePresetTargets: [],
      jwtSessionDays: 1, customCss: '', customHeadHtml: '',
      lineSpeedtestEnabled: true, lineSpeedtestIntervalMins: 30,
      lineSpeedtestTargetUrl: 'http://cp.cloudflare.com/generate_204', lineSpeedtestTimeoutMs: 3000,
      smtpEnabled: false, smtpHost: '', smtpPort: 587, smtpSecure: false, smtpUser: '', smtpPass: '', smtpFrom: '',
      emailVerificationEnabled: false, enforceEmailVerification: false, captchaMode: 'OFF', turnstileSiteKey: '', turnstileSecretKey: ''
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
  const smtpTestMutation = useMutation({
    mutationFn: async (email: string) => (await api.post<{ success: boolean; messageId?: string; durationMs?: number }>('/admin/settings/smtp/test', { email })).data,
    onSuccess: (result) => { setSmtpTestOpen(false); toast.success(`测试邮件已发送${result.durationMs ? `（${result.durationMs}ms）` : ''}`); },
    onError: (error) => toast.error(extractErrorMessage(error, 'SMTP 测试失败'))
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
          <Tabs defaultValue="branding" className="min-w-0 max-w-full w-full space-y-4">
            <TabsList className="h-auto w-full max-w-full justify-start gap-1 overflow-x-auto p-1">
              <TabsTrigger className="shrink-0" value="branding"><Palette className="h-4 w-4 shrink-0" />基础与品牌</TabsTrigger>
              <TabsTrigger className="shrink-0" value="users"><UsersRound className="h-4 w-4 shrink-0" />注册与用户</TabsTrigger>
              <TabsTrigger className="shrink-0" value="subscription"><Globe2 className="h-4 w-4 shrink-0" />订阅与分发</TabsTrigger>
              <TabsTrigger className="shrink-0" value="agent"><Gauge className="h-4 w-4 shrink-0" />Agent 运维</TabsTrigger>
              <TabsTrigger className="shrink-0" value="advanced"><ShieldCheck className="h-4 w-4 shrink-0" />安全与高级</TabsTrigger>
            </TabsList>

            <TabsContent value="branding"><Card className="min-w-0 overflow-hidden"><CardHeader><SectionTitle icon={Palette} title="基础与品牌" description="这些信息会同步到登录页、侧边栏、页脚和用户订阅控制台。" /></CardHeader><CardContent className="grid min-w-0 gap-5 md:grid-cols-2">
               <SettingsInput name="siteName" label="站点名称" placeholder="RiriCloud" />
               <SettingsInput name="siteDescription" label="副标题描述" placeholder="留空则不显示副标题" />
               <div className="space-y-2 md:col-span-2 min-w-0"><SettingsInput name="publicBaseUrl" label="全站访问 URL（主入口基准 URL）" placeholder="https://panel.example.com" description="面板对外完整基准 URL（例如 https://panel.example.com）。订阅基准 URL 与二进制分发基准 URL 留空时均默认继承此地址。" /><SetOriginButton name="publicBaseUrl" /></div>
              <TimezoneSettingField />
              <SettingsInput name="logoUrl" label="Logo URL" placeholder="https://cdn.example.com/logo.svg" description="留空时使用默认云朵图标。" />
              <SettingsInput name="faviconUrl" label="Favicon URL" placeholder="https://cdn.example.com/favicon.ico" />
              <SettingsTextarea name="siteAnnouncement" label="全局公告横幅" className="md:col-span-2" rows={5} description="支持标题、粗体、列表、行内代码和安全的 HTTPS 链接 Markdown。" />
              <SettingsInput name="footerCopyright" label="页脚版权" placeholder="© 2026 RiriCloud" description="展示于侧边栏底部与登录页页脚；留空时自动回退为版本与站点名称。" />
              <SettingsInput name="supportEmail" label="客服邮箱" placeholder="support@example.com" />
              <SettingsInput name="supportTelegramUrl" label="Telegram 客服 / 群组" placeholder="https://t.me/riricloud" />
              <SettingsInput name="supportDiscordUrl" label="Discord 客服 / 群组" placeholder="https://discord.gg/example" />
              <SettingsInput name="supportCustomUrl" label="自定义支持链接" placeholder="https://example.com/support" />
            </CardContent></Card></TabsContent>

            <TabsContent value="users"><Card className="min-w-0 overflow-hidden"><CardHeader><SectionTitle icon={UsersRound} title="注册与用户策略" description="控制新用户注册条件和首次登录时的默认权益。" /></CardHeader><CardContent className="grid min-w-0 gap-5 md:grid-cols-2">
              <SettingsSwitch name="registrationEnabled" label="开放注册" description="关闭后公开注册接口和注册页入口都会拒绝新用户。" className="md:col-span-2" />
              <SettingsSelect name="defaultPlanId" label="新用户默认套餐" options={[{ value: 'none', label: '不自动绑定套餐' }, ...(plans.data ?? []).map((plan) => ({ value: plan.id, label: plan.name }))]} description="绑定后注册会立即生成有效订阅和订阅链接。" />
              <SettingsInput name="defaultBalanceYuan" label="新用户注册初始余额（元）" type="number" min={0} description="注册赠金会记录为 SYSTEM_GIFT 流水。" />
              <div className="rounded-lg border border-dashed bg-muted/30 p-3.5 text-xs text-muted-foreground md:col-span-2 space-y-1 min-w-0">
                <p className="font-medium text-foreground">关于新用户流量与有效期：</p>
                <p>新用户注册后的流量配额与账号有效期完全统一由「新用户默认套餐」决定。若选择「不自动绑定套餐」，新注册用户初始配额为 0 且无到期限制，用户可通过赠送的初始余额在「套餐市场」自选开通。</p>
              </div>
              <SettingsInput name="passwordMinLength" label="密码最小长度" type="number" min={8} max={64} />
              <SettingsSelect name="emailDomainMode" label="邮箱域名过滤模式" options={[{ value: 'none', label: '不限制' }, { value: 'whitelist', label: '白名单，仅允许列表域名' }, { value: 'blacklist', label: '黑名单，拒绝列表域名' }]} />
               <SettingsTextarea name="emailDomainListText" label="邮箱域名列表" rows={5} className="md:col-span-2" description="每行一个域名，例如 example.com；不需要填写 @。" />
               <div className="md:col-span-2 space-y-4 rounded-lg border p-4 shadow-sm">
                 <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="flex min-w-0 items-start gap-2"><Mail className="mt-0.5 size-5 shrink-0 text-primary" /><div><h3 className="text-sm font-semibold">邮件服务（SMTP）</h3><p className="text-xs text-muted-foreground">用于发送注册和换绑邮箱验证码，密码字段保持脱敏。</p></div></div><Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => setSmtpTestOpen(true)} disabled={smtpTestMutation.isPending}><Send />发送测试邮件</Button></div>
                 <SettingsSwitch name="smtpEnabled" label="启用 SMTP 发信" description="关闭后邮箱验证码不会发送。" />
                 <div className="grid min-w-0 gap-4 sm:grid-cols-2"><SettingsInput name="smtpHost" label="SMTP 服务器" placeholder="smtp.example.com" /><SettingsInput name="smtpPort" label="端口" type="number" min={1} max={65535} /><SettingsSwitch name="smtpSecure" label="使用 SSL/TLS" description="465 端口通常开启，587 端口通常关闭并使用 STARTTLS。" /><SettingsInput name="smtpUser" label="账号" placeholder="noreply@example.com" /><SettingsInput name="smtpPass" label="密码" type="password" placeholder="留空保留当前密码" /><SettingsInput name="smtpFrom" label="发信人地址" placeholder="RiriCloud <noreply@example.com>" /></div>
                 <SettingsSwitch name="emailVerificationEnabled" label="启用注册邮箱验证" description="注册时必须完成 6 位邮箱验证码验证，验证码有效期 5 分钟。" />
                 <SettingsSwitch name="enforceEmailVerification" label="强制邮箱验证（限制订阅与节点连接）" description="开启后，未验证邮箱的用户将无法拉取订阅配置与连接节点（管理员账号豁免）。适用于要求存量用户补全验证或防滥用场景。" />
               </div>
               <div className="md:col-span-2 space-y-4 rounded-lg border p-4 shadow-sm"><div className="flex items-start gap-2"><ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" /><div><h3 className="text-sm font-semibold">人机验证（CAPTCHA）</h3><p className="text-xs text-muted-foreground">在获取注册验证码前拦截自动化请求；本地图形验证码无需外部服务。</p></div></div><SettingsSelect name="captchaMode" label="验证模式" options={[{ value: 'OFF', label: '关闭' }, { value: 'LOCAL', label: '本地图形验证码' }, { value: 'TURNSTILE', label: 'Cloudflare Turnstile' }]} />{form.watch('captchaMode') === 'TURNSTILE' ? <div className="grid gap-4 sm:grid-cols-2"><SettingsInput name="turnstileSiteKey" label="Site Key" placeholder="0x4AAAAAAA..." /><SettingsInput name="turnstileSecretKey" label="Secret Key" type="password" placeholder="留空保留当前密钥" /></div> : null}</div>
             </CardContent></Card></TabsContent>

            <TabsContent value="subscription"><Card className="min-w-0 overflow-hidden"><CardHeader><SectionTitle icon={Globe2} title="订阅与客户端分发" description="配置客户端获取订阅的地址、更新节奏与默认模板。" /></CardHeader><CardContent className="grid min-w-0 gap-5 md:grid-cols-2">
               <div className="space-y-2 md:col-span-2 min-w-0"><SettingsInput name="subscriptionBaseUrl" label="订阅基准 URL（覆盖项，可选）" placeholder="https://sub.example.com" description="客户端获取订阅的独立基准域名或反代路径。留空时自动继承「全站访问 URL」，若全站 URL 亦留空则使用当前访问地址。" /><SetOriginButton name="subscriptionBaseUrl" /></div>
              <SettingsSwitch name="subscriptionShortLinksEnabled" label="使用 Nginx 伪静态短链接" description="开启后展示 https://domain.com/<UUID>；请先在 Nginx 中配置对应 rewrite 规则。" />
              <SettingsInput name="subscriptionUpdateIntervalHours" label="客户端更新周期（小时）" type="number" min={1} max={168} />
              <div className="rounded-lg border bg-muted/20 p-4 space-y-2 md:col-span-2 min-w-0">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 min-w-0">
                  <div className="space-y-0.5 min-w-0">
                    <p className="text-sm font-medium">全局默认订阅模板</p>
                    <p className="text-xs text-muted-foreground break-words">
                      当前默认：<span className="font-semibold text-foreground">{defaultTemplate ? defaultTemplate.name : '未设置默认模板（回退系统内嵌规则）'}</span>
                      {defaultTemplate?.description ? ` — ${defaultTemplate.description}` : ''}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" className="shrink-0" asChild>
                    <Link to="/admin/templates">前往模板管理设置</Link>
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">全局默认订阅模板用于未单独绑定专有模板的套餐及普通订阅分发；标记与管理统一在「订阅模板」页面维护。</p>
              </div>
              <SettingsSwitch name="publicLinesEnabled" label="公开线路列表" description="关闭后用户订阅和线路页不再返回公开线路。" />
              <SettingsSwitch name="includeUsageHeaders" label="注入用量响应头" description="向订阅响应附加 Subscription-Userinfo。" />
            </CardContent></Card></TabsContent>

            <TabsContent value="agent"><Card className="min-w-0 overflow-hidden"><CardHeader><SectionTitle icon={Gauge} title="Agent 运维与网络探针" description="调整节点健康判定、配置推送和 HTTP 轮询行为。" /></CardHeader><CardContent className="grid min-w-0 gap-5 md:grid-cols-2">
              <SettingsInput name="heartbeatTimeoutSecs" label="心跳离线判定超时（秒）" type="number" min={5} max={3600} />
              <SettingsInput name="configSyncDebounceMs" label="配置同步防抖（毫秒）" type="number" min={0} max={10000} />
              <SettingsInput name="defaultPollIntervalSecs" label="默认 HTTP 轮询周期（秒）" type="number" min={5} max={300} />
              <SettingsInput name="binaryDownloadBaseUrl" label="二进制分发基准 URL（覆盖项，可选）" placeholder="https://downloads.example.com/riricloud" description="供节点下载 riri-agent 及 sing-box 内核的专用存储/CDN 地址。留空时自动继承「全站访问 URL」。" />
              <div className="rounded-lg border bg-muted/20 p-4 md:col-span-2 space-y-4 min-w-0">
                <div className="space-y-1">
                  <h4 className="text-sm font-semibold">线路自动测速</h4>
                  <p className="text-xs text-muted-foreground">主控后台定时对所有已启用的线路执行连通性与端到端延迟探测，结果同步至管理端与用户端线路卡片。</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 min-w-0">
                  <SettingsSwitch name="lineSpeedtestEnabled" label="开启线路自动定时测速" description="关闭后将仅在管理端点击「测速」时手动触发。" className="sm:col-span-2" />
                  <SettingsInput name="lineSpeedtestIntervalMins" label="自动测速执行周期（分钟）" type="number" min={1} max={1440} description="建议 15 ~ 60 分钟。" />
                  <SettingsInput name="lineSpeedtestTimeoutMs" label="单次测速超时阈值（毫秒）" type="number" min={500} max={30000} description="默认 3000ms。" />
                  <div className="sm:col-span-2 min-w-0">
                    <SettingsInput name="lineSpeedtestTargetUrl" label="测速探测目标 URL" placeholder="http://cp.cloudflare.com/generate_204" description="端到端测速时通过代理请求的目标地址，建议使用轻量无内容的 204 返回站点。" />
                  </div>
                </div>
              </div>
              <ProbePresetEditor />
            </CardContent></Card></TabsContent>

            <TabsContent value="advanced"><Card className="min-w-0 overflow-hidden"><CardHeader><SectionTitle icon={ShieldCheck} title="安全与高级个性化" description="控制会话有效期，并为已登录面板注入自定义样式与头部代码。" /></CardHeader><CardContent className="min-w-0 space-y-6">
              <div className="max-w-2xl min-w-0"><SettingsInput name="jwtSessionDays" label="JWT 会话有效天数" type="number" min={1} max={30} description="安全提示：缩短会话周期可以降低长期凭据泄漏风险，修改后新登录会使用新周期。" /></div>
              <SettingsEditor name="customCss" label="自定义 CSS" extensions={[css()]} description="样式只注入当前面板页面，适合覆盖主题变量或品牌细节。" />
              <SettingsEditor name="customHeadHtml" label="自定义 HTML / JavaScript 头部代码" extensions={[html()]} description="这是管理员可信边界：内容会原样挂载到 document.head，页面内脚本可能读取当前 JWT；默认 CSP 会阻止任意 inline script，请仅使用已审计的资源。" />
            </CardContent></Card></TabsContent>
          </Tabs>
          <div className="flex justify-end pt-4"><Button type="submit" className="w-full sm:w-auto" disabled={saveMutation.isPending}><Save />{saveMutation.isPending ? '保存中…' : '保存设置'}</Button></div>
        </form>
      </Form>
      {publicSettings.isError ? <p className="text-xs text-muted-foreground">公开站点信息暂时不可用，保存后会自动重试同步。</p> : null}
      <Dialog open={smtpTestOpen} onOpenChange={setSmtpTestOpen}><DialogContent size="compact"><DialogHeader><DialogTitle>发送 SMTP 测试邮件</DialogTitle><DialogDescription>请输入收件地址，系统会先验证 SMTP 连接，再发送一封测试邮件。</DialogDescription></DialogHeader><div className="space-y-2"><Label htmlFor="smtp-test-email">收件邮箱</Label><Input id="smtp-test-email" type="email" value={smtpTestEmail} onChange={(event) => setSmtpTestEmail(event.target.value)} placeholder="admin@example.com" /></div><DialogFooter><Button type="button" variant="outline" onClick={() => setSmtpTestOpen(false)}>取消</Button><Button type="button" disabled={smtpTestMutation.isPending || !smtpTestEmail.trim()} onClick={() => smtpTestMutation.mutate(smtpTestEmail.trim())}><Send />{smtpTestMutation.isPending ? '发送中…' : '发送测试邮件'}</Button></DialogFooter></DialogContent></Dialog>
    </PageContainer>
  );
}

function SectionTitle({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  return <><CardTitle className="flex items-center gap-2 text-base"><Icon className="h-5 w-5" />{title}</CardTitle><CardDescription>{description}</CardDescription></>;
}

function SettingsInput({ name, label, description, type = 'text', placeholder, min, max }: { name: FieldPath<SettingsForm>; label: string; description?: string; type?: InputHTMLAttributes<HTMLInputElement>['type']; placeholder?: string; min?: number; max?: number }) {
  const { control } = useFormContext<SettingsForm>();
  return <FormField control={control} name={name} render={({ field }) => <FormItem className="min-w-0"><FormLabel>{label}</FormLabel><FormControl><Input {...field} className="min-w-0" type={type} min={min} max={max} placeholder={placeholder} value={field.value == null ? '' : String(field.value)} onChange={(event) => field.onChange(event.target.value)} /></FormControl>{description ? <FormDescription className="break-words">{description}</FormDescription> : null}<FormMessage /></FormItem>} />;
}

function SettingsTextarea({ name, label, description, rows = 4, className }: { name: FieldPath<SettingsForm>; label: string; description?: string; rows?: number; className?: string }) {
  const { control } = useFormContext<SettingsForm>();
  return <FormField control={control} name={name} render={({ field }) => <FormItem className={`min-w-0 ${className ?? ''}`}><FormLabel>{label}</FormLabel><FormControl><Textarea {...field} className="min-w-0" rows={rows} value={String(field.value ?? '')} /></FormControl>{description ? <FormDescription className="break-words">{description}</FormDescription> : null}<FormMessage /></FormItem>} />;
}

function SettingsSwitch({ name, label, description, className }: { name: FieldPath<SettingsForm>; label: string; description: string; className?: string }) {
  const { control } = useFormContext<SettingsForm>();
  return <FormField control={control} name={name} render={({ field }) => <FormItem className={`flex flex-row items-start justify-between gap-4 rounded-lg border p-4 shadow-sm min-w-0 ${className ?? ''}`}><div className="min-w-0 space-y-0.5"><FormLabel>{label}</FormLabel><FormDescription className="break-words">{description}</FormDescription></div><FormControl><Switch className="shrink-0" checked={Boolean(field.value)} onCheckedChange={field.onChange} /></FormControl></FormItem>} />;
}

function SettingsSelect({ name, label, description, options }: { name: FieldPath<SettingsForm>; label: string; description?: string; options: Array<{ value: string; label: string }> }) {
  const { control } = useFormContext<SettingsForm>();
  return <FormField control={control} name={name} render={({ field }) => <FormItem className="min-w-0"><FormLabel>{label}</FormLabel><Select value={String(field.value || 'none')} onValueChange={(value) => field.onChange(value === 'none' ? 'none' : value)}><FormControl><SelectTrigger className="w-full min-w-0 overflow-hidden [&>span]:truncate"><SelectValue placeholder="请选择" /></SelectTrigger></FormControl><SelectContent>{options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select>{description ? <FormDescription className="break-words">{description}</FormDescription> : null}<FormMessage /></FormItem>} />;
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

function TimezoneSettingField() {
  const { control, watch, setValue } = useFormContext<SettingsForm>();
  const currentTimezone = watch('systemTimezone') || 'Asia/Shanghai';
  const isPreset = COMMON_TIMEZONES.some((tz) => tz.value === currentTimezone);
  const [selectMode, setSelectMode] = useState<string>(isPreset ? currentTimezone : 'custom');

  useEffect(() => {
    if (COMMON_TIMEZONES.some((tz) => tz.value === currentTimezone)) {
      setSelectMode(currentTimezone);
    } else {
      setSelectMode('custom');
    }
  }, [currentTimezone]);

  let previewText = '';
  try {
    previewText = formatDateTime(new Date(), currentTimezone);
  } catch {
    previewText = '无效时区';
  }

  return (
    <div className="space-y-3 md:col-span-2 rounded-lg border p-3.5 sm:p-4 bg-muted/10 min-w-0 max-w-full overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 min-w-0">
        <div className="space-y-0.5 min-w-0">
          <FormLabel className="text-sm font-medium flex items-center gap-1.5">
            <Clock className="size-4 shrink-0 text-primary" />
            <span className="truncate">全站统一时区设置</span>
          </FormLabel>
          <FormDescription className="break-words">
            全站时间展示、账单流水、自然月流量重置（1日 00:00:00）及流量统计时间桶切分均以此统一时区为准。
          </FormDescription>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground rounded-md bg-muted/60 px-2.5 py-1 tabular-nums self-start sm:self-auto shrink-0 max-w-full truncate">
          <span className="shrink-0">当前时区时间：</span>
          <strong className="text-foreground font-medium truncate">{previewText}</strong>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 min-w-0">
        <FormItem className="min-w-0">
          <FormLabel className="text-xs text-muted-foreground">常用时区快捷选择</FormLabel>
          <Select
            value={selectMode}
            onValueChange={(val) => {
              setSelectMode(val);
              if (val !== 'custom') {
                setValue('systemTimezone', val, { shouldValidate: true, shouldDirty: true });
              }
            }}
          >
            <SelectTrigger className="w-full min-w-0 overflow-hidden [&>span]:truncate">
              <SelectValue placeholder="请选择常用时区" />
            </SelectTrigger>
            <SelectContent>
              {COMMON_TIMEZONES.map((tz) => (
                <SelectItem key={tz.value} value={tz.value}>
                  {tz.label}
                </SelectItem>
              ))}
              <SelectItem value="custom">自定义 IANA 时区（手动填写）</SelectItem>
            </SelectContent>
          </Select>
        </FormItem>

        <FormField
          control={control}
          name="systemTimezone"
          render={({ field }) => (
            <FormItem className="min-w-0">
              <FormLabel className="text-xs text-muted-foreground">IANA 时区标识</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  className="min-w-0"
                  placeholder="例如 Asia/Shanghai 或 UTC"
                  onChange={(e) => field.onChange(e.target.value.trim())}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </div>
  );
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
    systemTimezone: settings.systemTimezone || 'Asia/Shanghai',
    defaultPlanId: settings.defaultPlanId ?? 'none',
    defaultBalanceYuan: settings.defaultBalance / 100,
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
    customHeadHtml: settings.customHeadHtml,
    lineSpeedtestEnabled: settings.lineSpeedtestEnabled,
    lineSpeedtestIntervalMins: settings.lineSpeedtestIntervalMins,
    lineSpeedtestTargetUrl: settings.lineSpeedtestTargetUrl,
    lineSpeedtestTimeoutMs: settings.lineSpeedtestTimeoutMs,
    smtpEnabled: settings.smtpEnabled,
    smtpHost: settings.smtpHost,
    smtpPort: settings.smtpPort,
    smtpSecure: settings.smtpSecure,
    smtpUser: settings.smtpUser,
    smtpPass: settings.smtpPass,
    smtpFrom: settings.smtpFrom,
    emailVerificationEnabled: settings.emailVerificationEnabled,
    enforceEmailVerification: settings.enforceEmailVerification ?? false,
    captchaMode: settings.captchaMode,
    turnstileSiteKey: settings.turnstileSiteKey,
    turnstileSecretKey: settings.turnstileSecretKey
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
    systemTimezone: values.systemTimezone,
    defaultPlanId: values.defaultPlanId === 'none' ? null : values.defaultPlanId,
    defaultBalance: Math.round(values.defaultBalanceYuan * 100),
    emailDomainList: values.emailDomainListText.split(/\r?\n|,/).map((item) => item.trim().toLowerCase().replace(/^@+/, '')).filter(Boolean),
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
    customHeadHtml: values.customHeadHtml,
    lineSpeedtestEnabled: values.lineSpeedtestEnabled,
    lineSpeedtestIntervalMins: values.lineSpeedtestIntervalMins,
    lineSpeedtestTargetUrl: values.lineSpeedtestTargetUrl,
    lineSpeedtestTimeoutMs: values.lineSpeedtestTimeoutMs,
    smtpEnabled: values.smtpEnabled,
    smtpHost: values.smtpHost,
    smtpPort: values.smtpPort,
    smtpSecure: values.smtpSecure,
    smtpUser: values.smtpUser,
    smtpPass: values.smtpPass,
    smtpFrom: values.smtpFrom,
    emailVerificationEnabled: values.emailVerificationEnabled,
    enforceEmailVerification: values.enforceEmailVerification,
    captchaMode: values.captchaMode,
    turnstileSiteKey: values.turnstileSiteKey,
    turnstileSecretKey: values.turnstileSecretKey
  };
}

function isBlankOrUrl(value: string) {
  return !value || /^https?:\/\//i.test(value);
}
