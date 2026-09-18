import { useEffect, useMemo, useState, type InputHTMLAttributes } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n/config';
import { useFormResetOnKey } from '@/hooks/use-form-reset';
import { Link } from 'react-router-dom';
import { useForm, useFormContext, type FieldPath } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import CodeMirror from '@uiw/react-codemirror';
import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { useTheme } from 'next-themes';
import { z } from 'zod';
import { Clock, Code2, Database, Gauge, Globe2, Link2, Mail, Palette, RefreshCw, RotateCcw, Save, Send, ShieldCheck, Trash2, UsersRound, type LucideIcon } from 'lucide-react';
import type { Extension } from '@codemirror/state';
import { toast } from 'sonner';
import { api, extractErrorMessage } from '@/lib/api';
import { formatBytes, formatDateTime } from '@/lib/utils';
import { usePublicSettings } from '@/lib/public-settings';
import { useAdminPlans } from '@/pages/admin/plans/use-plans';
import { useAdminTemplates } from '@/pages/admin/templates/use-templates';
import { ProbePresetEditor } from './components/probe-preset-editor';
import { probePresetTargetsSchema, toProbePresetFormValue, toProbePresetTarget, type ProbePresetTarget } from './components/probe-preset-schema';
import { SpeedTierEditor } from './components/speed-tier-editor';
import { DEFAULT_SPEED_TIERS, type SpeedTier } from '@/lib/speed-tier';
import { DatabaseStatsResponse, TelemetryCleanupDialog, VacuumResponse } from '@/components/shared/telemetry-cleanup-dialog';
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

const TIMEZONE_CONFIGS = [
  { value: 'Asia/Shanghai', key: 'admin:settings.tzShanghai' as const },
  { value: 'Asia/Tokyo', key: 'admin:settings.tzTokyo' as const },
  { value: 'Asia/Singapore', key: 'admin:settings.tzSingapore' as const },
  { value: 'UTC', key: 'admin:settings.tzUtc' as const },
  { value: 'Europe/London', key: 'admin:settings.tzLondon' as const },
  { value: 'Europe/Paris', key: 'admin:settings.tzParis' as const },
  { value: 'America/New_York', key: 'admin:settings.tzNewYork' as const },
  { value: 'America/Los_Angeles', key: 'admin:settings.tzLosAngeles' as const },
  { value: 'Australia/Sydney', key: 'admin:settings.tzSydney' as const }
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
  passwordRequireLowercase: boolean;
  passwordRequireUppercase: boolean;
  passwordRequireDigit: boolean;
  passwordRequireSpecial: boolean;
  subscriptionBaseUrl: string;
  subscriptionShortLinksEnabled: boolean;
  subscriptionEffectsSyncEnabled: boolean;
  subscriptionUpdateIntervalHours: number;
  appendSubscriptionSpeedBadge: boolean;
  speedLimitUnitConversionEnabled: boolean;
  speedLimitColorTiers: SpeedTier[];
  defaultTemplateId: string | null;
  publicLinesEnabled: boolean;
  includeUsageHeaders: boolean;
  heartbeatTimeoutSecs: number;
  configSyncDebounceMs: number;
  defaultPollIntervalSecs: number;
  binaryDownloadBaseUrl: string;
  githubRepoUrl: string;
  githubMirrorUrls: string[];
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
  logsRetentionDays: number;
  logsMaxCount: number;
  logsMinIngestLevel: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  trafficHourlyRetentionDays: number;
  nodeRateRetentionDays: number;
  agentLogMaxSizeMb: number;
  agentLogMaxFiles: number;
}

function createSettingsSchema() {
  return z.object({
    siteName: z.string().trim().min(1, i18n.t('admin:settings.valSiteNameReq')).max(32),
    siteDescription: z.string().max(120),
    publicBaseUrl: z.string().refine(isBlankOrUrl, i18n.t('admin:settings.valPublicBaseUrl')),
    systemTimezone: z.string().trim().min(1, i18n.t('admin:settings.valTimezoneReq')).refine(isValidTimezone, i18n.t('admin:settings.valTimezoneInvalid')),
    logoUrl: z.string().refine(isBlankOrUrl, i18n.t('admin:settings.valLogoUrl')),
    faviconUrl: z.string().refine(isBlankOrUrl, i18n.t('admin:settings.valFaviconUrl')),
    siteAnnouncement: z.string().max(10000),
    footerCopyright: z.string().max(200),
    supportTelegramUrl: z.string().refine(isBlankOrUrl, i18n.t('admin:settings.valTgUrl')),
    supportDiscordUrl: z.string().refine(isBlankOrUrl, i18n.t('admin:settings.valDiscordUrl')),
    supportEmail: z.string().refine((value) => !value || z.string().email().safeParse(value).success, i18n.t('admin:settings.valEmail')),
    supportCustomUrl: z.string().refine(isBlankOrUrl, i18n.t('admin:settings.valCustomSupportUrl')),
    registrationEnabled: z.boolean(),
    defaultPlanId: z.string(),
    defaultBalanceYuan: z.coerce.number().min(0, i18n.t('admin:settings.valBalanceNegative')).multipleOf(0.01, i18n.t('admin:settings.valBalanceDecimals')),
    emailDomainMode: z.enum(['none', 'whitelist', 'blacklist']),
    emailDomainListText: z.string().max(16000),
    passwordMinLength: z.coerce.number().int().min(8).max(64),
    passwordRequireLowercase: z.boolean(),
    passwordRequireUppercase: z.boolean(),
    passwordRequireDigit: z.boolean(),
    passwordRequireSpecial: z.boolean(),
    subscriptionBaseUrl: z.string().refine(isBlankOrUrl, i18n.t('admin:settings.valSubBaseUrl')),
    subscriptionShortLinksEnabled: z.boolean(),
    subscriptionEffectsSyncEnabled: z.boolean(),
    subscriptionUpdateIntervalHours: z.coerce.number().int().min(1).max(168),
    appendSubscriptionSpeedBadge: z.boolean(),
    speedLimitUnitConversionEnabled: z.boolean(),
    speedLimitColorTiers: z.array(z.object({
      maxMbps: z.number().int().min(1).nullable().optional(),
      color: z.string().min(1)
    })),
    defaultTemplateId: z.string(),
    publicLinesEnabled: z.boolean(),
    includeUsageHeaders: z.boolean(),
    heartbeatTimeoutSecs: z.coerce.number().int().min(5).max(3600),
    configSyncDebounceMs: z.coerce.number().int().min(0).max(10000),
    defaultPollIntervalSecs: z.coerce.number().int().min(5).max(300),
    binaryDownloadBaseUrl: z.string().refine(isBlankOrUrl, i18n.t('admin:settings.valBinaryDownloadUrl')),
    githubRepoUrl: z.string().refine(isBlankOrUrl, i18n.t('admin:settings.valGithubRepoUrl')),
    githubMirrorUrlsText: z.string().max(16000),
    probePresetTargets: probePresetTargetsSchema,
    jwtSessionDays: z.coerce.number().int().min(1).max(30),
    customCss: z.string().max(50000),
    customHeadHtml: z.string().max(20000),
    lineSpeedtestEnabled: z.boolean(),
    lineSpeedtestIntervalMins: z.coerce.number().int().min(1).max(1440),
    lineSpeedtestTargetUrl: z.string().refine(isBlankOrUrl, i18n.t('admin:settings.valSpeedtestTargetUrl')),
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
    turnstileSecretKey: z.string().max(512),
    logsRetentionDays: z.coerce.number().int().min(1).max(3650),
    logsMaxCount: z.coerce.number().int().min(1000).max(1000000),
    logsMinIngestLevel: z.enum(['DEBUG', 'INFO', 'WARN', 'ERROR']),
    trafficHourlyRetentionDays: z.coerce.number().int().min(1).max(3650),
    nodeRateRetentionDays: z.coerce.number().int().min(1).max(3650),
    agentLogMaxSizeMb: z.coerce.number().int().min(1).max(1024),
    agentLogMaxFiles: z.coerce.number().int().min(1).max(20)
  });
}

export type SettingsForm = z.infer<ReturnType<typeof createSettingsSchema>>;

export default function AdminSettingsPage() {
  const { t } = useTranslation(['admin', 'common']);
  const queryClient = useQueryClient();
  const publicSettings = usePublicSettings();
  const plans = useAdminPlans();
  const templates = useAdminTemplates();
  const [smtpTestOpen, setSmtpTestOpen] = useState(false);
  const [smtpTestEmail, setSmtpTestEmail] = useState('');
  const [cleanupOpen, setCleanupOpen] = useState(false);
  const settingsQuery = useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: async () => (await api.get<SystemSettings>('/admin/settings')).data
  });
  const dbStatsQuery = useQuery({
    queryKey: ['admin-database-stats'],
    queryFn: async () => (await api.get<DatabaseStatsResponse>('/admin/telemetry/cleanup/database-stats')).data
  });
  const vacuumMutation = useMutation({
    mutationFn: async () => (await api.post<VacuumResponse>('/admin/telemetry/cleanup/vacuum', {})).data,
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['admin-database-stats'] });
      if (data.totalReclaimedBytes > 0) {
        toast.success(t('admin:settings.vacuumSuccessReclaimed', { bytes: formatBytes(data.totalReclaimedBytes) }));
      } else {
        toast.success(t('admin:settings.vacuumSuccessClean'));
      }
    },
    onError: (error) => {
      toast.error(extractErrorMessage(error, t('admin:settings.vacuumFailed')));
    }
  });
  const defaultTemplate = templates.data?.find((t) => t.isDefault) ?? templates.data?.find((t) => t.id === settingsQuery.data?.defaultTemplateId);
  const dynamicSettingsSchema = useMemo(() => {
    void t;
    return createSettingsSchema();
  }, [t]);
  const form = useForm<SettingsForm>({
    resolver: zodResolver(dynamicSettingsSchema),
    defaultValues: toForm({
      siteName: '', siteDescription: '', publicBaseUrl: '', logoUrl: '', faviconUrl: '', siteAnnouncement: '', footerCopyright: '',
      supportTelegramUrl: '', supportDiscordUrl: '', supportEmail: '', supportCustomUrl: '', registrationEnabled: false,
      systemTimezone: 'Asia/Shanghai',
      defaultPlanId: null, defaultBalance: 0, emailDomainMode: 'none',
      emailDomainList: [], passwordMinLength: 8, passwordRequireLowercase: true, passwordRequireUppercase: false, passwordRequireDigit: true, passwordRequireSpecial: false, subscriptionBaseUrl: '', subscriptionShortLinksEnabled: false, subscriptionEffectsSyncEnabled: true, subscriptionUpdateIntervalHours: 24, appendSubscriptionSpeedBadge: true,
      speedLimitUnitConversionEnabled: true, speedLimitColorTiers: DEFAULT_SPEED_TIERS,
      defaultTemplateId: null, publicLinesEnabled: true, includeUsageHeaders: true, heartbeatTimeoutSecs: 15,
      configSyncDebounceMs: 250, defaultPollIntervalSecs: 15, binaryDownloadBaseUrl: '', githubRepoUrl: 'https://github.com/Nanako660/riricloud', githubMirrorUrls: [], probePresetTargets: [],
      jwtSessionDays: 1, customCss: '', customHeadHtml: '',
      lineSpeedtestEnabled: true, lineSpeedtestIntervalMins: 30,
      lineSpeedtestTargetUrl: 'http://cp.cloudflare.com/generate_204', lineSpeedtestTimeoutMs: 3000,
      smtpEnabled: false, smtpHost: '', smtpPort: 587, smtpSecure: false, smtpUser: '', smtpPass: '', smtpFrom: '',
      emailVerificationEnabled: false, enforceEmailVerification: false, captchaMode: 'OFF', turnstileSiteKey: '', turnstileSecretKey: '',
      logsRetentionDays: 7, logsMaxCount: 100000, logsMinIngestLevel: 'INFO', trafficHourlyRetentionDays: 90,
      nodeRateRetentionDays: 30, agentLogMaxSizeMb: 50, agentLogMaxFiles: 5
    })
  });

  // 服务端设置回灌：仅在表单没有未保存修改时跟随数据版本同步，
  // 避免后台 refetch 或别处 invalidate 清空管理员正在编辑的设置项
  useFormResetOnKey({
    resetKey: settingsQuery.data ? 'settings' : null,
    dataRevision: settingsQuery.dataUpdatedAt,
    isDirty: form.formState.isDirty,
    reset: () => { if (settingsQuery.data) form.reset(toForm(settingsQuery.data)); }
  });

  const saveMutation = useMutation({
    mutationFn: async (values: SettingsForm) => (await api.put<SystemSettings>('/admin/settings', toPayload(values))).data,
    onSuccess: (settings) => {
      form.reset(toForm(settings));
      toast.success(t('admin:settings.saveSuccess'));
      void queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] });
      void queryClient.invalidateQueries({ queryKey: ['system', 'public-info'] });
    },
    onError: (error) => toast.error(extractErrorMessage(error, t('admin:settings.saveFailed')))
  });
  const resetMutation = useMutation({
    mutationFn: async () => (await api.post<SystemSettings>('/admin/settings/reset', {})).data,
    onSuccess: (settings) => {
      form.reset(toForm(settings));
      toast.success(t('admin:settings.resetSuccess'));
      void queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] });
      void queryClient.invalidateQueries({ queryKey: ['system', 'public-info'] });
    },
    onError: (error) => toast.error(extractErrorMessage(error, t('admin:settings.resetFailed')))
  });
  const smtpTestMutation = useMutation({
    mutationFn: async (email: string) => (await api.post<{ success: boolean; messageId?: string; durationMs?: number }>('/admin/settings/smtp/test', { email })).data,
    onSuccess: (result) => { setSmtpTestOpen(false); toast.success(t('admin:settings.smtpTestSuccess', { duration: result.durationMs ? `（${result.durationMs}ms）` : '' })); },
    onError: (error) => toast.error(extractErrorMessage(error, t('admin:settings.smtpTestFailed')))
  });

  if (settingsQuery.isPending) {
    return <PageContainer><PageHeader title={t('admin:settings.title')} /><Skeleton className="h-[520px] w-full" /></PageContainer>;
  }

  return (
    <PageContainer>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <PageHeader title={t('admin:settings.title')} description={t('admin:settings.subtitle')} />
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <AlertDialog>
            <AlertDialogTrigger asChild><Button type="button" variant="outline" className="w-full sm:w-auto" disabled={resetMutation.isPending}><RotateCcw />{t('admin:settings.resetDefaults')}</Button></AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader><AlertDialogTitle>{t('admin:settings.resetConfirmTitle')}</AlertDialogTitle><AlertDialogDescription>{t('admin:settings.resetConfirmDesc')}</AlertDialogDescription></AlertDialogHeader>
              <AlertDialogFooter><AlertDialogCancel>{t('common:actions.cancel')}</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => resetMutation.mutate()}>{t('admin:settings.resetConfirm')}</AlertDialogAction></AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button type="button" className="w-full sm:w-auto" disabled={saveMutation.isPending} onClick={() => form.handleSubmit((values) => saveMutation.mutate(values))()}><Save />{saveMutation.isPending ? t('admin:settings.saving') : t('admin:settings.saveSettingsButton')}</Button>
        </div>
      </div>

      <Form {...form}>
        <form className="min-w-0" onSubmit={form.handleSubmit((values) => saveMutation.mutate(values))}>
          <Tabs defaultValue="branding" className="min-w-0 max-w-full w-full space-y-4">
            <TabsList className="h-auto w-full max-w-full justify-start gap-1 overflow-x-auto p-1">
              <TabsTrigger className="shrink-0" value="branding"><Palette className="h-4 w-4 shrink-0" />{t('admin:settings.generalTab')}</TabsTrigger>
              <TabsTrigger className="shrink-0" value="users"><UsersRound className="h-4 w-4 shrink-0" />{t('admin:settings.authTab')}</TabsTrigger>
               <TabsTrigger className="shrink-0" value="subscription"><Globe2 className="h-4 w-4 shrink-0" />{t('admin:settings.subscriptionTab')}</TabsTrigger>
               <TabsTrigger className="shrink-0" value="agent"><Gauge className="h-4 w-4 shrink-0" />{t('admin:settings.agentTab')}</TabsTrigger>
              <TabsTrigger className="shrink-0" value="storage"><Database className="h-4 w-4 shrink-0" />{t('admin:settings.databaseTab')}</TabsTrigger>
               <TabsTrigger className="shrink-0" value="advanced"><ShieldCheck className="h-4 w-4 shrink-0" />{t('admin:settings.securityTab')}</TabsTrigger>
            </TabsList>

            <TabsContent value="branding"><Card className="min-w-0 overflow-hidden"><CardHeader><SectionTitle icon={Palette} title={t('admin:settings.sectionBranding')} description={t('admin:settings.sectionBrandingDesc')} /></CardHeader><CardContent className="grid min-w-0 gap-5 md:grid-cols-2">
               <SettingsInput name="siteName" label={t('admin:settings.fieldSiteName')} placeholder="RiriCloud" />
               <SettingsInput name="siteDescription" label={t('admin:settings.fieldSiteDesc')} placeholder={t('admin:settings.placeholderSiteDesc')} />
               <div className="space-y-2 md:col-span-2 min-w-0"><SettingsInput name="publicBaseUrl" label={t('admin:settings.fieldPublicBaseUrl')} placeholder="https://panel.example.com" description={t('admin:settings.descPublicBaseUrl')} /><SetOriginButton name="publicBaseUrl" /></div>
              <TimezoneSettingField />
              <SettingsInput name="logoUrl" label={t('admin:settings.fieldLogoUrl')} placeholder="https://cdn.example.com/logo.svg" description={t('admin:settings.descLogoUrl')} />
              <SettingsInput name="faviconUrl" label={t('admin:settings.fieldFaviconUrl')} placeholder="https://cdn.example.com/favicon.ico" />
              <SettingsTextarea name="siteAnnouncement" label={t('admin:settings.fieldSiteAnnouncement')} className="md:col-span-2" rows={5} description={t('admin:settings.descSiteAnnouncement')} />
              <SettingsInput name="footerCopyright" label={t('admin:settings.fieldFooterCopyright')} placeholder={t('admin:settings.placeholderFooterCopyright')} description={t('admin:settings.descFooterCopyright')} />
              <SettingsInput name="supportEmail" label={t('admin:settings.fieldSupportEmail')} placeholder="support@example.com" />
              <SettingsInput name="supportTelegramUrl" label={t('admin:settings.fieldSupportTg')} placeholder="https://t.me/riricloud" />
              <SettingsInput name="supportDiscordUrl" label={t('admin:settings.fieldSupportDiscord')} placeholder="https://discord.gg/example" />
              <SettingsInput name="supportCustomUrl" label={t('admin:settings.fieldSupportCustom')} placeholder="https://example.com/support" />
            </CardContent></Card></TabsContent>

            <TabsContent value="users"><Card className="min-w-0 overflow-hidden"><CardHeader><SectionTitle icon={UsersRound} title={t('admin:settings.sectionUsers')} description={t('admin:settings.sectionUsersDesc')} /></CardHeader><CardContent className="grid min-w-0 gap-5 md:grid-cols-2">
              <SettingsSwitch name="registrationEnabled" label={t('admin:settings.fieldRegistrationEnabled')} description={t('admin:settings.descRegistrationEnabled')} className="md:col-span-2" />
              <SettingsSelect name="defaultPlanId" label={t('admin:settings.fieldDefaultPlanId')} options={[{ value: 'none', label: t('admin:settings.optNoAutoPlan') }, ...(plans.data ?? []).map((plan) => ({ value: plan.id, label: plan.name }))]} description={t('admin:settings.descDefaultPlanId')} />
              <SettingsInput name="defaultBalanceYuan" label={t('admin:settings.fieldDefaultBalanceYuan')} type="number" min={0} description={t('admin:settings.descDefaultBalanceYuan')} />
              <div className="rounded-lg border border-dashed bg-muted/30 p-3.5 text-xs text-muted-foreground md:col-span-2 space-y-1 min-w-0">
                <p className="font-medium text-foreground">{t('admin:settings.noticeNewUserTrafficTitle')}</p>
                <p>{t('admin:settings.noticeNewUserTrafficDesc')}</p>
              </div>
              <SettingsInput name="passwordMinLength" label={t('admin:settings.fieldPasswordMinLength')} type="number" min={8} max={64} description={t('admin:settings.descPasswordMinLength')} />
              <div className="md:col-span-2 space-y-4 rounded-lg border p-4 shadow-sm">
                <div className="flex items-start gap-2"><ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" /><div><h3 className="text-sm font-semibold">{t('admin:settings.sectionPasswordComplexity')}</h3><p className="text-xs text-muted-foreground">{t('admin:settings.descPasswordComplexity')}</p></div></div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <SettingsSwitch name="passwordRequireLowercase" label={t('admin:settings.fieldPasswordRequireLowercase')} description={t('admin:settings.descPasswordRequireLowercase')} />
                  <SettingsSwitch name="passwordRequireUppercase" label={t('admin:settings.fieldPasswordRequireUppercase')} description={t('admin:settings.descPasswordRequireUppercase')} />
                  <SettingsSwitch name="passwordRequireDigit" label={t('admin:settings.fieldPasswordRequireDigit')} description={t('admin:settings.descPasswordRequireDigit')} />
                  <SettingsSwitch name="passwordRequireSpecial" label={t('admin:settings.fieldPasswordRequireSpecial')} description={t('admin:settings.descPasswordRequireSpecial')} />
                </div>
              </div>
              <SettingsSelect name="emailDomainMode" label={t('admin:settings.fieldEmailDomainMode')} options={[{ value: 'none', label: t('admin:settings.optEmailDomainNone') }, { value: 'whitelist', label: t('admin:settings.optEmailDomainWhitelist') }, { value: 'blacklist', label: t('admin:settings.optEmailDomainBlacklist') }]} />
               <SettingsTextarea name="emailDomainListText" label={t('admin:settings.fieldEmailDomainListText')} rows={5} className="md:col-span-2" description={t('admin:settings.descEmailDomainListText')} />
               <div className="md:col-span-2 space-y-4 rounded-lg border p-4 shadow-sm">
                 <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="flex min-w-0 items-start gap-2"><Mail className="mt-0.5 size-5 shrink-0 text-primary" /><div><h3 className="text-sm font-semibold">{t('admin:settings.sectionSmtp')}</h3><p className="text-xs text-muted-foreground">{t('admin:settings.descSmtp')}</p></div></div><Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => setSmtpTestOpen(true)} disabled={smtpTestMutation.isPending}><Send />{t('admin:settings.btnSendSmtpTest')}</Button></div>
                 <SettingsSwitch name="smtpEnabled" label={t('admin:settings.fieldSmtpEnabled')} description={t('admin:settings.descSmtpEnabled')} />
                 <div className="grid min-w-0 gap-4 sm:grid-cols-2"><SettingsInput name="smtpHost" label={t('admin:settings.fieldSmtpHost')} placeholder="smtp.example.com" /><SettingsInput name="smtpPort" label={t('admin:settings.fieldSmtpPort')} type="number" min={1} max={65535} /><SettingsSwitch name="smtpSecure" label={t('admin:settings.fieldSmtpSecure')} description={t('admin:settings.descSmtpSecure')} /><SettingsInput name="smtpUser" label={t('admin:settings.fieldSmtpUser')} placeholder="noreply@example.com" /><SettingsInput name="smtpPass" label={t('admin:settings.fieldSmtpPass')} type="password" placeholder={t('admin:settings.placeholderSmtpPass')} /><SettingsInput name="smtpFrom" label={t('admin:settings.fieldSmtpFrom')} placeholder="RiriCloud <noreply@example.com>" /></div>
                 <SettingsSwitch name="emailVerificationEnabled" label={t('admin:settings.fieldEmailVerificationEnabled')} description={t('admin:settings.descEmailVerificationEnabled')} />
                 <SettingsSwitch name="enforceEmailVerification" label={t('admin:settings.fieldEnforceEmailVerification')} description={t('admin:settings.descEnforceEmailVerification')} />
               </div>
               <div className="md:col-span-2 space-y-4 rounded-lg border p-4 shadow-sm"><div className="flex items-start gap-2"><ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" /><div><h3 className="text-sm font-semibold">{t('admin:settings.sectionCaptcha')}</h3><p className="text-xs text-muted-foreground">{t('admin:settings.descCaptcha')}</p></div></div><SettingsSelect name="captchaMode" label={t('admin:settings.fieldCaptchaMode')} options={[{ value: 'OFF', label: t('admin:settings.optCaptchaOff') }, { value: 'LOCAL', label: t('admin:settings.optCaptchaLocal') }, { value: 'TURNSTILE', label: t('admin:settings.optCaptchaTurnstile') }]} />{form.watch('captchaMode') === 'TURNSTILE' ? <div className="grid gap-4 sm:grid-cols-2"><SettingsInput name="turnstileSiteKey" label={t('admin:settings.fieldTurnstileSiteKey')} placeholder="0x4AAAAAAA..." /><SettingsInput name="turnstileSecretKey" label={t('admin:settings.fieldTurnstileSecretKey')} type="password" placeholder={t('admin:settings.placeholderTurnstileSecretKey')} /></div> : null}</div>
             </CardContent></Card></TabsContent>

            <TabsContent value="subscription"><Card className="min-w-0 overflow-hidden"><CardHeader><SectionTitle icon={Globe2} title={t('admin:settings.sectionSubscription')} description={t('admin:settings.sectionSubscriptionDesc')} /></CardHeader><CardContent className="grid min-w-0 gap-5 md:grid-cols-2">
               <div className="space-y-2 md:col-span-2 min-w-0"><SettingsInput name="subscriptionBaseUrl" label={t('admin:settings.fieldSubscriptionBaseUrl')} placeholder="https://sub.example.com" description={t('admin:settings.descSubscriptionBaseUrl')} /><SetOriginButton name="subscriptionBaseUrl" /></div>
              <SettingsSwitch name="subscriptionShortLinksEnabled" label={t('admin:settings.fieldSubscriptionShortLinksEnabled')} description={t('admin:settings.descSubscriptionShortLinksEnabled')} />
              <SettingsSwitch name="subscriptionEffectsSyncEnabled" label={t('admin:settings.fieldSubscriptionEffectsSyncEnabled')} description={t('admin:settings.descSubscriptionEffectsSyncEnabled')} />
              <SettingsInput name="subscriptionUpdateIntervalHours" label={t('admin:settings.fieldSubscriptionUpdateIntervalHours')} type="number" min={1} max={168} />
              <div className="rounded-lg border bg-muted/20 p-4 space-y-2 md:col-span-2 min-w-0">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 min-w-0">
                  <div className="space-y-0.5 min-w-0">
                    <p className="text-sm font-medium">{t('admin:settings.cardGlobalDefaultTemplate')}</p>
                    <p className="text-xs text-muted-foreground break-words">
                      {t('admin:settings.currentDefaultLabel')}<span className="font-semibold text-foreground">{defaultTemplate ? defaultTemplate.name : t('admin:settings.noDefaultTemplate')}</span>
                      {defaultTemplate?.description ? ` — ${defaultTemplate.description}` : ''}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" className="shrink-0" asChild>
                    <Link to="/admin/templates">{t('admin:settings.btnManageTemplates')}</Link>
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">{t('admin:settings.descGlobalDefaultTemplate')}</p>
              </div>
              <SettingsSwitch name="publicLinesEnabled" label={t('admin:settings.fieldPublicLinesEnabled')} description={t('admin:settings.descPublicLinesEnabled')} />
              <SettingsSwitch name="includeUsageHeaders" label={t('admin:settings.fieldIncludeUsageHeaders')} description={t('admin:settings.descIncludeUsageHeaders')} />
              <SettingsSwitch name="appendSubscriptionSpeedBadge" label={t('admin:settings.fieldAppendSubscriptionSpeedBadge')} description={t('admin:settings.descAppendSubscriptionSpeedBadge')} />
              <SettingsSwitch name="speedLimitUnitConversionEnabled" label={t('admin:settings.fieldSpeedLimitUnitConversionEnabled')} description={t('admin:settings.descSpeedLimitUnitConversionEnabled')} />
              <div className="md:col-span-2 min-w-0">
                <SpeedTierEditor />
              </div>
            </CardContent></Card></TabsContent>

             <TabsContent value="agent"><Card className="min-w-0 overflow-hidden"><CardHeader><SectionTitle icon={Gauge} title={t('admin:settings.sectionAgent')} description={t('admin:settings.sectionAgentDesc')} /></CardHeader><CardContent className="grid min-w-0 gap-5 md:grid-cols-2">
              <SettingsInput name="heartbeatTimeoutSecs" label={t('admin:settings.fieldHeartbeatTimeoutSecs')} type="number" min={5} max={3600} />
              <SettingsInput name="configSyncDebounceMs" label={t('admin:settings.fieldConfigSyncDebounceMs')} type="number" min={0} max={10000} />
              <SettingsInput name="defaultPollIntervalSecs" label={t('admin:settings.fieldDefaultPollIntervalSecs')} type="number" min={5} max={300} />
              <SettingsInput name="binaryDownloadBaseUrl" label={t('admin:settings.fieldBinaryDownloadBaseUrl')} placeholder="https://downloads.example.com/riricloud" description={t('admin:settings.descBinaryDownloadBaseUrl')} />
              <SettingsInput name="githubRepoUrl" label={t('admin:settings.fieldGithubRepoUrl')} placeholder="https://github.com/Nanako660/riricloud" description={t('admin:settings.descGithubRepoUrl')} />
              <div className="md:col-span-2 min-w-0">
                <SettingsTextarea name="githubMirrorUrlsText" label={t('admin:settings.fieldGithubMirrorUrlsText')} rows={4} className="md:col-span-2" description={t('admin:settings.descGithubMirrorUrlsText')} />
              </div>
              <div className="rounded-lg border bg-muted/20 p-4 md:col-span-2 space-y-4 min-w-0">
                <div className="space-y-1">
                  <h4 className="text-sm font-semibold">{t('admin:settings.cardLineSpeedtestTitle')}</h4>
                  <p className="text-xs text-muted-foreground">{t('admin:settings.descLineSpeedtest')}</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 min-w-0">
                  <SettingsSwitch name="lineSpeedtestEnabled" label={t('admin:settings.fieldLineSpeedtestEnabled')} description={t('admin:settings.descLineSpeedtestEnabled')} className="sm:col-span-2" />
                  <SettingsInput name="lineSpeedtestIntervalMins" label={t('admin:settings.fieldLineSpeedtestIntervalMins')} type="number" min={1} max={1440} description={t('admin:settings.descLineSpeedtestIntervalMins')} />
                  <SettingsInput name="lineSpeedtestTimeoutMs" label={t('admin:settings.fieldLineSpeedtestTimeoutMs')} type="number" min={500} max={30000} description={t('admin:settings.descLineSpeedtestTimeoutMs')} />
                  <div className="sm:col-span-2 min-w-0">
                    <SettingsInput name="lineSpeedtestTargetUrl" label={t('admin:settings.fieldLineSpeedtestTargetUrl')} placeholder="http://cp.cloudflare.com/generate_204" description={t('admin:settings.descLineSpeedtestTargetUrl')} />
                  </div>
                </div>
              </div>
               <ProbePresetEditor />
             </CardContent></Card></TabsContent>

            <TabsContent value="storage"><div className="space-y-4">
              <Card className="min-w-0 overflow-hidden"><CardHeader><SectionTitle icon={Database} title={t('admin:settings.sectionStorage')} description={t('admin:settings.sectionStorageDesc')} /></CardHeader><CardContent className="grid min-w-0 gap-5 md:grid-cols-2">
                <SettingsInput name="trafficHourlyRetentionDays" label={t('admin:settings.fieldTrafficHourlyRetentionDays')} type="number" min={1} max={3650} description={t('admin:settings.descTrafficHourlyRetentionDays')} />
                <SettingsInput name="nodeRateRetentionDays" label={t('admin:settings.fieldNodeRateRetentionDays')} type="number" min={1} max={3650} description={t('admin:settings.descNodeRateRetentionDays')} />
                <SettingsInput name="logsRetentionDays" label={t('admin:settings.fieldLogsRetentionDays')} type="number" min={1} max={3650} />
                <SettingsInput name="logsMaxCount" label={t('admin:settings.fieldLogsMaxCount')} type="number" min={1000} max={1000000} />
                <SettingsSelect name="logsMinIngestLevel" label={t('admin:settings.fieldLogsMinIngestLevel')} options={[{ value: 'DEBUG', label: 'DEBUG' }, { value: 'INFO', label: t('admin:settings.optLogsLevelInfo') }, { value: 'WARN', label: 'WARN' }, { value: 'ERROR', label: 'ERROR' }]} description={t('admin:settings.descLogsMinIngestLevel')} />
                <div className="rounded-lg border bg-muted/20 p-4 text-xs text-muted-foreground md:col-span-2">{t('admin:settings.tipLegacyTrafficLogNotice')}</div>
              </CardContent></Card>
              <Card className="min-w-0 overflow-hidden"><CardHeader><SectionTitle icon={Gauge} title={t('admin:settings.cardAgentLogRotateTitle')} description={t('admin:settings.descAgentLogRotate')} /></CardHeader><CardContent className="grid min-w-0 gap-5 md:grid-cols-2">
                <SettingsInput name="agentLogMaxSizeMb" label={t('admin:settings.fieldAgentLogMaxSizeMb')} type="number" min={1} max={1024} />
                <SettingsInput name="agentLogMaxFiles" label={t('admin:settings.fieldAgentLogMaxFiles')} type="number" min={1} max={20} description={t('admin:settings.descAgentLogMaxFiles')} />
              </CardContent></Card>
              <Card className="min-w-0 overflow-hidden"><CardHeader><SectionTitle icon={Trash2} title={t('admin:settings.cardStorageVacuumTitle')} description={t('admin:settings.descStorageVacuum')} /></CardHeader><CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-lg border bg-muted/20 p-3">
                    <p className="text-xs text-muted-foreground">{t('admin:settings.statMainDb')}</p>
                    <p className="mt-1 text-base font-semibold tabular-nums">
                      {dbStatsQuery.isLoading
                        ? t('admin:settings.statReading')
                        : formatBytes(dbStatsQuery.data?.databases.find((d) => d.target === 'main')?.totalSize ?? 0)}
                    </p>
                  </div>
                  <div className="rounded-lg border bg-muted/20 p-3">
                    <p className="text-xs text-muted-foreground">{t('admin:settings.statTelemetryDb')}</p>
                    <p className="mt-1 text-base font-semibold tabular-nums">
                      {dbStatsQuery.isLoading
                        ? t('admin:settings.statReading')
                        : formatBytes(dbStatsQuery.data?.databases.find((d) => d.target === 'telemetry')?.totalSize ?? 0)}
                    </p>
                  </div>
                  <div className="rounded-lg border bg-muted/20 p-3">
                    <p className="text-xs text-muted-foreground">{t('admin:settings.statTotalDb')}</p>
                    <p className="mt-1 text-base font-semibold tabular-nums">
                      {dbStatsQuery.isLoading
                        ? t('admin:settings.statReading')
                        : formatBytes(dbStatsQuery.data?.totalBytes ?? 0)}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="destructive" onClick={() => setCleanupOpen(true)}>
                    <Trash2 />{t('admin:settings.btnOpenCleanup')}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={vacuumMutation.isPending}
                    onClick={() => vacuumMutation.mutate()}
                  >
                    <RefreshCw className={vacuumMutation.isPending ? 'animate-spin' : ''} />
                    {vacuumMutation.isPending ? t('admin:settings.vacuuming') : t('admin:settings.btnVacuum')}
                  </Button>
                </div>
              </CardContent></Card>
            </div></TabsContent>

             <TabsContent value="advanced"><Card className="min-w-0 overflow-hidden"><CardHeader><SectionTitle icon={ShieldCheck} title={t('admin:settings.sectionAdvanced')} description={t('admin:settings.sectionAdvancedDesc')} /></CardHeader><CardContent className="min-w-0 space-y-6">
              <div className="max-w-2xl min-w-0"><SettingsInput name="jwtSessionDays" label={t('admin:settings.fieldJwtSessionDays')} type="number" min={1} max={30} description={t('admin:settings.descJwtSessionDays')} /></div>
              <SettingsEditor name="customCss" label={t('admin:settings.fieldCustomCss')} extensions={[css()]} description={t('admin:settings.descCustomCss')} />
              <SettingsEditor name="customHeadHtml" label={t('admin:settings.fieldCustomHeadHtml')} extensions={[html()]} description={t('admin:settings.descCustomHeadHtml')} />
            </CardContent></Card></TabsContent>
          </Tabs>
          <div className="flex justify-end pt-4"><Button type="submit" className="w-full sm:w-auto" disabled={saveMutation.isPending}><Save />{saveMutation.isPending ? t('admin:settings.saving') : t('admin:settings.saveSettingsButton')}</Button></div>
        </form>
      </Form>
      {publicSettings.isError ? <p className="text-xs text-muted-foreground">{t('admin:settings.publicSettingsUnavailable')}</p> : null}
      <Dialog open={smtpTestOpen} onOpenChange={setSmtpTestOpen}><DialogContent size="compact"><DialogHeader><DialogTitle>{t('admin:settings.dialogSmtpTestTitle')}</DialogTitle><DialogDescription>{t('admin:settings.dialogSmtpTestDesc')}</DialogDescription></DialogHeader><div className="space-y-2"><Label htmlFor="smtp-test-email">{t('admin:settings.labelSmtpTestEmail')}</Label><Input id="smtp-test-email" type="email" value={smtpTestEmail} onChange={(event) => setSmtpTestEmail(event.target.value)} placeholder="admin@example.com" /></div><DialogFooter><Button type="button" variant="outline" onClick={() => setSmtpTestOpen(false)}>{t('common:actions.cancel')}</Button><Button type="button" disabled={smtpTestMutation.isPending || !smtpTestEmail.trim()} onClick={() => smtpTestMutation.mutate(smtpTestEmail.trim())}><Send />{smtpTestMutation.isPending ? t('admin:settings.sendingTestEmail') : t('admin:settings.btnSendTestEmail')}</Button></DialogFooter></DialogContent></Dialog>
      <TelemetryCleanupDialog open={cleanupOpen} onOpenChange={setCleanupOpen} />
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
  const { t } = useTranslation(['admin', 'common']);
  const { control } = useFormContext<SettingsForm>();
  return <FormField control={control} name={name} render={({ field }) => <FormItem className="min-w-0"><FormLabel>{label}</FormLabel><Select value={String(field.value || 'none')} onValueChange={(value) => field.onChange(value === 'none' ? 'none' : value)}><FormControl><SelectTrigger className="w-full min-w-0 overflow-hidden [&>span]:truncate"><SelectValue placeholder={t('admin:settings.selectPlaceholder')} /></SelectTrigger></FormControl><SelectContent>{options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select>{description ? <FormDescription className="break-words">{description}</FormDescription> : null}<FormMessage /></FormItem>} />;
}

function SettingsEditor({ name, label, description, extensions }: { name: FieldPath<SettingsForm>; label: string; description: string; extensions: Extension[] }) {
  const { control } = useFormContext<SettingsForm>();
  const { resolvedTheme } = useTheme();
  const editorTheme = resolvedTheme === 'dark' ? 'dark' : 'light';
  return <FormField control={control} name={name} render={({ field }) => <FormItem className="min-w-0"><FormLabel className="flex items-center gap-2"><Code2 className="h-4 w-4" />{label}</FormLabel><FormControl><div className="min-w-0 overflow-hidden rounded-md border bg-background shadow-sm"><CodeMirror value={String(field.value ?? '')} height="220px" theme={editorTheme} extensions={extensions} basicSetup={{ lineNumbers: true, foldGutter: true }} onChange={field.onChange} /></div></FormControl><FormDescription>{description}</FormDescription><FormMessage /></FormItem>} />;
}

function SetOriginButton({ name }: { name: 'publicBaseUrl' | 'subscriptionBaseUrl' }) {
  const { t } = useTranslation(['admin', 'common']);
  const { setValue } = useFormContext<SettingsForm>();
  return <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => setValue(name, window.location.origin, { shouldDirty: true })}><Link2 />{t('admin:settings.btnSetOrigin')}</Button>;
}

function TimezoneSettingField() {
  const { t } = useTranslation(['admin', 'common']);
  const { control, watch, setValue } = useFormContext<SettingsForm>();
  const currentTimezone = watch('systemTimezone') || 'Asia/Shanghai';
  const isPreset = TIMEZONE_CONFIGS.some((tz) => tz.value === currentTimezone);
  const [selectMode, setSelectMode] = useState<string>(isPreset ? currentTimezone : 'custom');

  useEffect(() => {
    if (TIMEZONE_CONFIGS.some((tz) => tz.value === currentTimezone)) {
      setSelectMode(currentTimezone);
    } else {
      setSelectMode('custom');
    }
  }, [currentTimezone]);

  let previewText = '';
  try {
    previewText = formatDateTime(new Date(), currentTimezone);
  } catch {
    previewText = t('admin:settings.tzInvalid');
  }

  return (
    <div className="space-y-3 md:col-span-2 rounded-lg border p-3.5 sm:p-4 bg-muted/10 min-w-0 max-w-full overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 min-w-0">
        <div className="space-y-0.5 min-w-0">
          <FormLabel className="text-sm font-medium flex items-center gap-1.5">
            <Clock className="size-4 shrink-0 text-primary" />
            <span className="truncate">{t('admin:settings.tzLabel')}</span>
          </FormLabel>
          <FormDescription className="break-words">
            {t('admin:settings.tzDesc')}
          </FormDescription>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground rounded-md bg-muted/60 px-2.5 py-1 tabular-nums self-start sm:self-auto shrink-0 max-w-full truncate">
          <span className="shrink-0">{t('admin:settings.tzCurrentTime')}</span>
          <strong className="text-foreground font-medium truncate">{previewText}</strong>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 min-w-0">
        <FormItem className="min-w-0">
          <FormLabel className="text-xs text-muted-foreground">{t('admin:settings.tzPresetSelect')}</FormLabel>
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
              <SelectValue placeholder={t('admin:settings.tzSelectPlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              {TIMEZONE_CONFIGS.map((tz) => (
                <SelectItem key={tz.value} value={tz.value}>
                  {t(tz.key)}
                </SelectItem>
              ))}
              <SelectItem value="custom">{t('admin:settings.tzCustomOption')}</SelectItem>
            </SelectContent>
          </Select>
        </FormItem>

        <FormField
          control={control}
          name="systemTimezone"
          render={({ field }) => (
            <FormItem className="min-w-0">
              <FormLabel className="text-xs text-muted-foreground">{t('admin:settings.tzIanaInput')}</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  className="min-w-0"
                  placeholder={t('admin:settings.tzIanaPlaceholder')}
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
    passwordRequireLowercase: settings.passwordRequireLowercase ?? true,
    passwordRequireUppercase: settings.passwordRequireUppercase ?? false,
    passwordRequireDigit: settings.passwordRequireDigit ?? true,
    passwordRequireSpecial: settings.passwordRequireSpecial ?? false,
    subscriptionBaseUrl: settings.subscriptionBaseUrl,
    subscriptionShortLinksEnabled: settings.subscriptionShortLinksEnabled,
    subscriptionEffectsSyncEnabled: settings.subscriptionEffectsSyncEnabled ?? true,
    subscriptionUpdateIntervalHours: settings.subscriptionUpdateIntervalHours,
    appendSubscriptionSpeedBadge: settings.appendSubscriptionSpeedBadge ?? true,
    speedLimitUnitConversionEnabled: settings.speedLimitUnitConversionEnabled ?? true,
    speedLimitColorTiers: settings.speedLimitColorTiers?.length ? settings.speedLimitColorTiers : DEFAULT_SPEED_TIERS,
    defaultTemplateId: settings.defaultTemplateId ?? 'none',
    publicLinesEnabled: settings.publicLinesEnabled,
    includeUsageHeaders: settings.includeUsageHeaders,
    heartbeatTimeoutSecs: settings.heartbeatTimeoutSecs,
    configSyncDebounceMs: settings.configSyncDebounceMs,
    defaultPollIntervalSecs: settings.defaultPollIntervalSecs,
    binaryDownloadBaseUrl: settings.binaryDownloadBaseUrl,
    githubRepoUrl: settings.githubRepoUrl,
    githubMirrorUrlsText: settings.githubMirrorUrls.join('\n'),
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
    turnstileSecretKey: settings.turnstileSecretKey,
    logsRetentionDays: settings.logsRetentionDays,
    logsMaxCount: settings.logsMaxCount,
    logsMinIngestLevel: settings.logsMinIngestLevel,
    trafficHourlyRetentionDays: settings.trafficHourlyRetentionDays,
    nodeRateRetentionDays: settings.nodeRateRetentionDays,
    agentLogMaxSizeMb: settings.agentLogMaxSizeMb,
    agentLogMaxFiles: settings.agentLogMaxFiles
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
    passwordRequireLowercase: values.passwordRequireLowercase,
    passwordRequireUppercase: values.passwordRequireUppercase,
    passwordRequireDigit: values.passwordRequireDigit,
    passwordRequireSpecial: values.passwordRequireSpecial,
    subscriptionBaseUrl: values.subscriptionBaseUrl,
    subscriptionShortLinksEnabled: values.subscriptionShortLinksEnabled,
    subscriptionEffectsSyncEnabled: values.subscriptionEffectsSyncEnabled,
    subscriptionUpdateIntervalHours: values.subscriptionUpdateIntervalHours,
    appendSubscriptionSpeedBadge: values.appendSubscriptionSpeedBadge,
    speedLimitUnitConversionEnabled: values.speedLimitUnitConversionEnabled,
    speedLimitColorTiers: values.speedLimitColorTiers,
    defaultTemplateId: values.defaultTemplateId === 'none' ? null : values.defaultTemplateId,
    publicLinesEnabled: values.publicLinesEnabled,
    includeUsageHeaders: values.includeUsageHeaders,
    heartbeatTimeoutSecs: values.heartbeatTimeoutSecs,
    configSyncDebounceMs: values.configSyncDebounceMs,
    defaultPollIntervalSecs: values.defaultPollIntervalSecs,
    binaryDownloadBaseUrl: values.binaryDownloadBaseUrl,
    githubRepoUrl: values.githubRepoUrl,
    githubMirrorUrls: values.githubMirrorUrlsText.split(/\r?\n/).map((item) => item.trim()).filter(Boolean),
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
    turnstileSecretKey: values.turnstileSecretKey,
    logsRetentionDays: values.logsRetentionDays,
    logsMaxCount: values.logsMaxCount,
    logsMinIngestLevel: values.logsMinIngestLevel,
    trafficHourlyRetentionDays: values.trafficHourlyRetentionDays,
    nodeRateRetentionDays: values.nodeRateRetentionDays,
    agentLogMaxSizeMb: values.agentLogMaxSizeMb,
    agentLogMaxFiles: values.agentLogMaxFiles
  };
}

function isBlankOrUrl(value: string) {
  return !value || /^https?:\/\//i.test(value);
}
