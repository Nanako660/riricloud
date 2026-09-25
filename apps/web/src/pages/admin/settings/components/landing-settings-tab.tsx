import { useState, useMemo } from 'react';
import { useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  Check,
  Cpu,
  Globe,
  HelpCircle,
  Laptop,
  Layers,
  Layout,
  Lock,
  Pencil,
  Plus,
  Radio,
  RotateCcw,
  Server,
  ShieldCheck,
  Sparkles,
  Trash2,
  Zap,
  type LucideIcon
} from 'lucide-react';
import type { SettingsForm } from '../index';
import type { LandingFeatureItem, LandingFaqItem } from '@/pages/landing/types';
import {
  DEFAULT_FEATURES_ZH,
  DEFAULT_FEATURES_EN,
  DEFAULT_FEATURES_JA,
  DEFAULT_FAQS_ZH,
  DEFAULT_FAQS_EN,
  DEFAULT_FAQS_JA,
  getEffectiveFeatures,
  getEffectiveFaqs
} from '@/pages/landing/default-content';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FormDescription, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

const AVAILABLE_ICONS = [
  { value: 'Zap', icon: Zap, key: 'zap' },
  { value: 'Lock', icon: Lock, key: 'lock' },
  { value: 'Globe', icon: Globe, key: 'globe' },
  { value: 'Laptop', icon: Laptop, key: 'laptop' },
  { value: 'BarChart3', icon: BarChart3, key: 'barchart' },
  { value: 'ShieldCheck', icon: ShieldCheck, key: 'shieldcheck' },
  { value: 'Server', icon: Server, key: 'server' },
  { value: 'Cpu', icon: Cpu, key: 'cpu' },
  { value: 'Radio', icon: Radio, key: 'radio' },
  { value: 'Layers', icon: Layers, key: 'layers' },
  { value: 'Sparkles', icon: Sparkles, key: 'sparkles' }
] as const;

const ICON_MAP: Record<string, LucideIcon> = Object.fromEntries(
  AVAILABLE_ICONS.map((item) => [item.value, item.icon])
);

export function LandingSettingsTab() {
  const { t, i18n } = useTranslation(['admin', 'landing', 'common']);
  const { control, watch, setValue } = useFormContext<SettingsForm>();

  const rawFeaturesJson = watch('landingCustomFeaturesJson');
  const rawFaqJson = watch('landingCustomFaqJson');

  const currentFeatures = useMemo(() => {
    return getEffectiveFeatures(rawFeaturesJson, i18n.language);
  }, [rawFeaturesJson, i18n.language]);

  const currentFaqs = useMemo(() => {
    return getEffectiveFaqs(rawFaqJson, i18n.language);
  }, [rawFaqJson, i18n.language]);

  // Feature Dialog State
  const [featureDialogOpen, setFeatureDialogOpen] = useState(false);
  const [editingFeature, setEditingFeature] = useState<LandingFeatureItem | null>(null);
  const [featureTitle, setFeatureTitle] = useState('');
  const [featureDesc, setFeatureDesc] = useState('');
  const [featureIcon, setFeatureIcon] = useState('Zap');

  // FAQ Dialog State
  const [faqDialogOpen, setFaqDialogOpen] = useState(false);
  const [editingFaq, setEditingFaq] = useState<LandingFaqItem | null>(null);
  const [faqQuestion, setFaqQuestion] = useState('');
  const [faqAnswer, setFaqAnswer] = useState('');

  // Feature Handlers
  const openCreateFeature = () => {
    setEditingFeature(null);
    setFeatureTitle('');
    setFeatureDesc('');
    setFeatureIcon('Zap');
    setFeatureDialogOpen(true);
  };

  const openEditFeature = (item: LandingFeatureItem) => {
    setEditingFeature(item);
    setFeatureTitle(item.title);
    setFeatureDesc(item.description);
    setFeatureIcon(item.icon || 'Zap');
    setFeatureDialogOpen(true);
  };

  const saveFeature = () => {
    if (!featureTitle.trim()) return;
    let nextFeatures: LandingFeatureItem[];
    if (editingFeature) {
      nextFeatures = currentFeatures.map((f) =>
        f.id === editingFeature.id
          ? { ...f, title: featureTitle.trim(), description: featureDesc.trim(), icon: featureIcon }
          : f
      );
    } else {
      nextFeatures = [
        ...currentFeatures,
        {
          id: `feat-${Date.now()}`,
          title: featureTitle.trim(),
          description: featureDesc.trim(),
          icon: featureIcon
        }
      ];
    }
    setValue('landingCustomFeaturesJson', JSON.stringify(nextFeatures), { shouldDirty: true, shouldValidate: true });
    setFeatureDialogOpen(false);
  };

  const deleteFeature = (id: string) => {
    const nextFeatures = currentFeatures.filter((f) => f.id !== id);
    setValue('landingCustomFeaturesJson', JSON.stringify(nextFeatures), { shouldDirty: true, shouldValidate: true });
  };

  const moveFeature = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= currentFeatures.length) return;
    const nextFeatures = [...currentFeatures];
    const temp = nextFeatures[index];
    nextFeatures[index] = nextFeatures[targetIndex];
    nextFeatures[targetIndex] = temp;
    setValue('landingCustomFeaturesJson', JSON.stringify(nextFeatures), { shouldDirty: true, shouldValidate: true });
  };

  const resetFeaturesToDefault = () => {
    const defaults = i18n.language.startsWith('ja')
      ? DEFAULT_FEATURES_JA
      : i18n.language.startsWith('en')
        ? DEFAULT_FEATURES_EN
        : DEFAULT_FEATURES_ZH;
    setValue('landingCustomFeaturesJson', JSON.stringify(defaults), { shouldDirty: true, shouldValidate: true });
  };

  // FAQ Handlers
  const openCreateFaq = () => {
    setEditingFaq(null);
    setFaqQuestion('');
    setFaqAnswer('');
    setFaqDialogOpen(true);
  };

  const openEditFaq = (item: LandingFaqItem) => {
    setEditingFaq(item);
    setFaqQuestion(item.question);
    setFaqAnswer(item.answer);
    setFaqDialogOpen(true);
  };

  const saveFaq = () => {
    if (!faqQuestion.trim()) return;
    let nextFaqs: LandingFaqItem[];
    if (editingFaq) {
      nextFaqs = currentFaqs.map((item) =>
        item.id === editingFaq.id
          ? { ...item, question: faqQuestion.trim(), answer: faqAnswer.trim() }
          : item
      );
    } else {
      nextFaqs = [
        ...currentFaqs,
        {
          id: `faq-${Date.now()}`,
          question: faqQuestion.trim(),
          answer: faqAnswer.trim()
        }
      ];
    }
    setValue('landingCustomFaqJson', JSON.stringify(nextFaqs), { shouldDirty: true, shouldValidate: true });
    setFaqDialogOpen(false);
  };

  const deleteFaq = (id: string) => {
    const nextFaqs = currentFaqs.filter((item) => item.id !== id);
    setValue('landingCustomFaqJson', JSON.stringify(nextFaqs), { shouldDirty: true, shouldValidate: true });
  };

  const moveFaq = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= currentFaqs.length) return;
    const nextFaqs = [...currentFaqs];
    const temp = nextFaqs[index];
    nextFaqs[index] = nextFaqs[targetIndex];
    nextFaqs[targetIndex] = temp;
    setValue('landingCustomFaqJson', JSON.stringify(nextFaqs), { shouldDirty: true, shouldValidate: true });
  };

  const resetFaqsToDefault = () => {
    const defaults = i18n.language.startsWith('ja')
      ? DEFAULT_FAQS_JA
      : i18n.language.startsWith('en')
        ? DEFAULT_FAQS_EN
        : DEFAULT_FAQS_ZH;
    setValue('landingCustomFaqJson', JSON.stringify(defaults), { shouldDirty: true, shouldValidate: true });
  };

  return (
    <div className="space-y-6">
      {/* 1. Global Toggles */}
      <Card className="min-w-0 overflow-hidden">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Layout className="size-5 text-primary" />
            <div>
              <CardTitle className="text-base">{t('admin:settings.landingGeneralTitle', { defaultValue: '首页总览与开关' })}</CardTitle>
              <CardDescription>{t('admin:settings.landingGeneralDesc', { defaultValue: '控制访客访问站点根路径时的展现行为及各区块显隐' })}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid min-w-0 gap-5 sm:grid-cols-2">
          <FormField
            control={control}
            name="landingEnabled"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3.5 shadow-2xs sm:col-span-2">
                <div className="space-y-0.5">
                  <FormLabel className="text-sm font-semibold">{t('admin:settings.fieldLandingEnabled', { defaultValue: '启用首页' })}</FormLabel>
                  <FormDescription className="text-xs">
                    {t('admin:settings.descLandingEnabled', {
                      defaultValue: '开启后访问根路径 / 展示现代化首页；关闭后自动回退至登录页或后台重定向'
                    })}
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={control}
            name="landingShowFeatures"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3.5 shadow-2xs">
                <div className="space-y-0.5">
                  <FormLabel className="text-sm font-medium">{t('admin:settings.fieldLandingShowFeatures', { defaultValue: '展示特性亮点卡片' })}</FormLabel>
                  <FormDescription className="text-xs">
                    {t('admin:settings.descLandingShowFeatures', { defaultValue: '在首页呈现系统核心优势与服务亮点' })}
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={control}
            name="landingShowPlans"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3.5 shadow-2xs">
                <div className="space-y-0.5">
                  <FormLabel className="text-sm font-medium">{t('admin:settings.fieldLandingShowPlans', { defaultValue: '展示公开套餐预览' })}</FormLabel>
                  <FormDescription className="text-xs">
                    {t('admin:settings.descLandingShowPlans', { defaultValue: '在首页呈现当前公开售卖的订阅套餐与价格' })}
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={control}
            name="landingShowFaq"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3.5 shadow-2xs sm:col-span-2">
                <div className="space-y-0.5">
                  <FormLabel className="text-sm font-medium">{t('admin:settings.fieldLandingShowFaq', { defaultValue: '展示常见问答 FAQ' })}</FormLabel>
                  <FormDescription className="text-xs">
                    {t('admin:settings.descLandingShowFaq', { defaultValue: '在首页提供常见新手疑问与解答折叠面板' })}
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
              </FormItem>
            )}
          />
        </CardContent>
      </Card>

      {/* 2. Hero Content Card */}
      <Card className="min-w-0 overflow-hidden">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Sparkles className="size-5 text-primary" />
            <div>
              <CardTitle className="text-base">{t('admin:settings.landingHeroTitle', { defaultValue: '首页焦点区域文案定制' })}</CardTitle>
              <CardDescription>{t('admin:settings.landingHeroDesc', { defaultValue: '定制首页顶部焦点区域的徽章标签、大标题与副标语（留空使用默认）' })}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid min-w-0 gap-5 sm:grid-cols-2">
          <FormField
            control={control}
            name="landingHeroBadge"
            render={({ field }) => (
              <FormItem className="sm:col-span-2">
                <FormLabel>{t('admin:settings.fieldLandingHeroBadge', { defaultValue: '顶部徽章标签文案' })}</FormLabel>
                <FormControl>
                  <Input {...field} placeholder={t('admin:settings.placeholderLandingHeroBadge', { defaultValue: '✨ 新一代高速网络服务' })} />
                </FormControl>
                <FormDescription className="text-xs">
                  {t('admin:settings.descLandingHeroBadge', { defaultValue: '展示于大标题上方的小巧胶囊标签，留空时使用内置默认文案' })}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={control}
            name="landingHeroTitle"
            render={({ field }) => (
              <FormItem className="sm:col-span-2">
                <FormLabel>{t('admin:settings.fieldLandingHeroTitle', { defaultValue: '首页主标题' })}</FormLabel>
                <FormControl>
                  <Input {...field} placeholder={t('admin:settings.placeholderLandingHeroTitle', { defaultValue: '随时随地，畅享无界高速互联' })} />
                </FormControl>
                <FormDescription className="text-xs">
                  {t('admin:settings.descLandingHeroTitle', { defaultValue: '首页最醒目的一级大标题，留空时使用默认' })}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={control}
            name="landingHeroSubtitle"
            render={({ field }) => (
              <FormItem className="sm:col-span-2">
                <FormLabel>{t('admin:settings.fieldLandingHeroSubtitle', { defaultValue: '首页副标题' })}</FormLabel>
                <FormControl>
                  <Textarea
                    {...field}
                    rows={3}
                    placeholder={t('admin:settings.placeholderLandingHeroSubtitle', {
                      defaultValue: '专为高清流媒体与多设备协同优化。一键轻松接入，全天候稳定护航，重塑您的数字生活体验。'
                    })}
                  />
                </FormControl>
                <FormDescription className="text-xs">
                  {t('admin:settings.descLandingHeroSubtitle', { defaultValue: '主标题下方的详细阐述文本，留空时使用内置默认文案' })}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </CardContent>
      </Card>

      {/* 3. Features Visual Manager */}
      <Card className="min-w-0 overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between pb-4">
          <div className="space-y-0.5">
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="size-4 text-primary" />
              <span>{t('admin:settings.landingFeaturesTitle', { defaultValue: '首页特性卡片管理' })}</span>
            </CardTitle>
            <CardDescription className="text-xs">
              {t('admin:settings.landingFeaturesDesc', { defaultValue: '管理首页展示的特性卡片列表，支持可视化增删改与调整顺序' })}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1 text-xs"
              onClick={resetFeaturesToDefault}
            >
              <RotateCcw className="size-3.5" />
              <span>{t('admin:settings.btnResetDefault', { defaultValue: '恢复默认' })}</span>
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-8 gap-1 text-xs"
              onClick={openCreateFeature}
            >
              <Plus className="size-3.5" />
              <span>{t('admin:settings.btnAddFeature', { defaultValue: '添加特性' })}</span>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {currentFeatures.map((item, idx) => {
            const IconComponent = ICON_MAP[item.icon] ?? Sparkles;
            return (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/20 p-3 text-xs transition-colors hover:bg-muted/40"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <IconComponent className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground truncate">{item.title}</p>
                    <p className="text-muted-foreground truncate text-[11px]">{item.description}</p>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <IconButton
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    disabled={idx === 0}
                    onClick={() => moveFeature(idx, 'up')}
                    aria-label={t('common:actions.moveUp')}
                  >
                    <ArrowUp className="size-4" />
                  </IconButton>
                  <IconButton
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    disabled={idx === currentFeatures.length - 1}
                    onClick={() => moveFeature(idx, 'down')}
                    aria-label={t('common:actions.moveDown')}
                  >
                    <ArrowDown className="size-4" />
                  </IconButton>
                  <IconButton
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="text-primary"
                    onClick={() => openEditFeature(item)}
                    aria-label={t('common:actions.edit')}
                  >
                    <Pencil className="size-4" />
                  </IconButton>
                  <IconButton
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="text-destructive hover:text-destructive"
                    onClick={() => deleteFeature(item.id)}
                    aria-label={t('common:actions.delete')}
                  >
                    <Trash2 className="size-4" />
                  </IconButton>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* 4. FAQ Visual Manager */}
      <Card className="min-w-0 overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between pb-4">
          <div className="space-y-0.5">
            <CardTitle className="text-base flex items-center gap-2">
              <HelpCircle className="size-4 text-primary" />
              <span>{t('admin:settings.landingFaqTitle', { defaultValue: '首页常见问答 FAQ 管理' })}</span>
            </CardTitle>
            <CardDescription className="text-xs">
              {t('admin:settings.landingFaqDesc', { defaultValue: '管理首页展示的常见问题与回答，支持增删改与排序' })}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1 text-xs"
              onClick={resetFaqsToDefault}
            >
              <RotateCcw className="size-3.5" />
              <span>{t('admin:settings.btnResetDefault', { defaultValue: '恢复默认' })}</span>
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-8 gap-1 text-xs"
              onClick={openCreateFaq}
            >
              <Plus className="size-3.5" />
              <span>{t('admin:settings.btnAddFaq', { defaultValue: '添加问答' })}</span>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {currentFaqs.map((item, idx) => (
            <div
              key={item.id}
              className="flex items-start justify-between gap-3 rounded-lg border border-border/60 bg-muted/20 p-3 text-xs transition-colors hover:bg-muted/40"
            >
              <div className="space-y-1 min-w-0 flex-1">
                <p className="font-semibold text-foreground flex items-center gap-1.5">
                  <span className="text-primary font-bold">Q:</span>
                  <span>{item.question}</span>
                </p>
                <p className="text-muted-foreground text-[11px] line-clamp-2 leading-relaxed">
                  <span className="font-semibold text-foreground/70 mr-1">A:</span>
                  {item.answer}
                </p>
              </div>

              <div className="flex items-center gap-1 shrink-0 pt-0.5">
                <IconButton
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  disabled={idx === 0}
                  onClick={() => moveFaq(idx, 'up')}
                  aria-label={t('common:actions.moveUp')}
                >
                  <ArrowUp className="size-4" />
                </IconButton>
                <IconButton
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  disabled={idx === currentFaqs.length - 1}
                  onClick={() => moveFaq(idx, 'down')}
                  aria-label={t('common:actions.moveDown')}
                >
                  <ArrowDown className="size-4" />
                </IconButton>
                <IconButton
                  type="button"
                  variant="ghost"
                  size="icon-xs" className="text-primary"
                  onClick={() => openEditFaq(item)}
                  aria-label={t('common:actions.edit')}
                >
                  <Pencil className="size-4" />
                </IconButton>
                <IconButton
                  type="button"
                  variant="ghost"
                  size="icon-xs" className="text-destructive hover:text-destructive"
                  onClick={() => deleteFaq(item.id)}
                  aria-label={t('common:actions.delete')}
                >
                  <Trash2 className="size-4" />
                </IconButton>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Feature Edit / Create Dialog */}
      <Dialog open={featureDialogOpen} onOpenChange={setFeatureDialogOpen}>
        <DialogContent size="default">
          <DialogHeader>
            <DialogTitle>
              {editingFeature
                ? t('admin:settings.dialogEditFeature', { defaultValue: '编辑特性卡片' })
                : t('admin:settings.dialogAddFeature', { defaultValue: '添加特性卡片' })}
            </DialogTitle>
            <DialogDescription>
              {t('admin:settings.dialogFeatureDesc', { defaultValue: '配置展示在首页的特性图标、标题与简短说明。' })}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="feature-icon">{t('admin:settings.labelFeatureIcon', { defaultValue: '卡片图标' })}</Label>
              <Select value={featureIcon} onValueChange={setFeatureIcon}>
                <SelectTrigger id="feature-icon" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AVAILABLE_ICONS.map((opt) => {
                    const IconComp = opt.icon;
                    return (
                      <SelectItem key={opt.value} value={opt.value}>
                        <div className="flex items-center gap-2">
                          <IconComp className="size-4 text-primary" />
                          <span>{t(`admin:settings.icons.${opt.key}` as const)}</span>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="feature-title">{t('admin:settings.labelFeatureTitle', { defaultValue: '特性标题' })}</Label>
              <Input
                id="feature-title"
                value={featureTitle}
                onChange={(e) => setFeatureTitle(e.target.value)}
                placeholder={t('admin:settings.placeholderFeatureTitle', { defaultValue: '例如：极速高清体验' })}
                maxLength={60}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="feature-desc">{t('admin:settings.labelFeatureDesc', { defaultValue: '特性描述说明' })}</Label>
              <Textarea
                id="feature-desc"
                value={featureDesc}
                onChange={(e) => setFeatureDesc(e.target.value)}
                placeholder={t('admin:settings.placeholderFeatureDesc', { defaultValue: '简要介绍该项服务体验或亮点...' })}
                rows={3}
                maxLength={200}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setFeatureDialogOpen(false)}>
              {t('common:actions.cancel', { defaultValue: '取消' })}
            </Button>
            <Button type="button" disabled={!featureTitle.trim()} onClick={saveFeature}>
              <Check className="size-4" />
              <span>{t('common:actions.confirm', { defaultValue: '确定' })}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* FAQ Edit / Create Dialog */}
      <Dialog open={faqDialogOpen} onOpenChange={setFaqDialogOpen}>
        <DialogContent size="default">
          <DialogHeader>
            <DialogTitle>
              {editingFaq
                ? t('admin:settings.dialogEditFaq', { defaultValue: '编辑常见问答' })
                : t('admin:settings.dialogAddFaq', { defaultValue: '添加常见问答' })}
            </DialogTitle>
            <DialogDescription>
              {t('admin:settings.dialogFaqDesc', { defaultValue: '配置展示在首页折叠面板中的问题与解答正文。' })}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="faq-question">{t('admin:settings.labelFaqQuestion', { defaultValue: '问题 (Question)' })}</Label>
              <Input
                id="faq-question"
                value={faqQuestion}
                onChange={(e) => setFaqQuestion(e.target.value)}
                placeholder={t('admin:settings.placeholderFaqQuestion', { defaultValue: '例如：我是新手小白，该如何开始使用？' })}
                maxLength={100}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="faq-answer">{t('admin:settings.labelFaqAnswer', { defaultValue: '解答正文 (Answer)' })}</Label>
              <Textarea
                id="faq-answer"
                value={faqAnswer}
                onChange={(e) => setFaqAnswer(e.target.value)}
                placeholder={t('admin:settings.placeholderFaqAnswer', { defaultValue: '详细解答说明...' })}
                rows={5}
                maxLength={1000}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setFaqDialogOpen(false)}>
              {t('common:actions.cancel', { defaultValue: '取消' })}
            </Button>
            <Button type="button" disabled={!faqQuestion.trim()} onClick={saveFaq}>
              <Check className="size-4" />
              <span>{t('common:actions.confirm', { defaultValue: '确定' })}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
