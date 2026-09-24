import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { json } from '@codemirror/lang-json';
import {
  ArrowDown,
  ArrowUp,
  Plus,
  Trash2,
  ListFilter,
  Code2,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Wand2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { TemplateCodeEditor } from './template-code-editor';

export interface TemplateRuleDraft {
  name: string;
  type: 'domain-suffix' | 'domain-keyword' | 'domain' | 'ip-cidr' | 'geosite' | 'remote-rule-set' | 'match';
  target: string;
  enabled: boolean;
  rules: string[];
  url?: string;
  singboxUrl?: string;
  format?: 'binary' | 'source';
}

const VALID_RULE_TYPES = [
  'domain-suffix',
  'domain-keyword',
  'domain',
  'ip-cidr',
  'geosite',
  'remote-rule-set',
  'match'
] as const;

function normalizeRule(value: unknown, index: number, fallbackName?: string): TemplateRuleDraft {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const rawType = typeof source.type === 'string' ? source.type : 'domain-suffix';
  const type = (VALID_RULE_TYPES.includes(rawType as (typeof VALID_RULE_TYPES)[number]) ? rawType : 'domain-suffix') as TemplateRuleDraft['type'];
  return {
    name: typeof source.name === 'string' ? source.name : (fallbackName || `Routing Rule ${index + 1}`),
    type,
    target: typeof source.target === 'string' ? source.target : '',
    enabled: source.enabled !== false,
    rules: Array.isArray(source.rules) ? source.rules.filter((item): item is string => typeof item === 'string') : [],
    url: typeof source.url === 'string' ? source.url : '',
    singboxUrl: typeof source.singboxUrl === 'string' ? source.singboxUrl : '',
    format: source.format === 'source' ? 'source' : 'binary'
  };
}

function swap<T>(items: T[], from: number, to: number) {
  const next = [...items];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

export function TemplateRulesEditor({ value, onChange, targets }: { value: unknown[]; onChange: (value: unknown[]) => void; targets: string[] }) {
  const { t } = useTranslation(['admin', 'common']);

  const ruleTypes = useMemo(() => [
    { value: 'domain-suffix', label: t('admin:templateRules.types.domainSuffix') },
    { value: 'domain-keyword', label: t('admin:templateRules.types.domainKeyword') },
    { value: 'domain', label: t('admin:templateRules.types.domain') },
    { value: 'ip-cidr', label: t('admin:templateRules.types.ipCidr') },
    { value: 'geosite', label: t('admin:templateRules.types.geosite') },
    { value: 'remote-rule-set', label: t('admin:templateRules.types.remoteRuleSet') },
    { value: 'match', label: t('admin:templateRules.types.match') }
  ], [t]);

  const presetRules = useMemo<Array<{ title: string; desc: string; payload: TemplateRuleDraft }>>(() => [
    {
      title: t('admin:templateRules.presets.adBlockTitle'),
      desc: t('admin:templateRules.presets.adBlockDesc'),
      payload: {
        name: t('admin:templateRules.presets.adBlockName'),
        type: 'domain-suffix',
        target: 'REJECT',
        enabled: true,
        rules: ['doubleclick.net', 'adservice.google.com', 'adcolony.com', 'adjust.com', 'applovin.com', 'appsflyer.com']
      }
    },
    {
      title: t('admin:templateRules.presets.aiTitle'),
      desc: t('admin:templateRules.presets.aiDesc'),
      payload: {
        name: t('admin:templateRules.presets.aiName'),
        type: 'domain-suffix',
        target: '',
        enabled: true,
        rules: ['openai.com', 'chatgpt.com', 'oaistatic.com', 'oaiusercontent.com', 'anthropic.com', 'claude.ai', 'bard.google.com', 'gemini.google.com']
      }
    },
    {
      title: t('admin:templateRules.presets.streamingTitle'),
      desc: t('admin:templateRules.presets.streamingDesc'),
      payload: {
        name: t('admin:templateRules.presets.streamingName'),
        type: 'domain-suffix',
        target: '',
        enabled: true,
        rules: ['youtube.com', 'googlevideo.com', 'netflix.com', 'nflxvideo.net', 'disneyplus.com', 'spotify.com']
      }
    },
    {
      title: t('admin:templateRules.presets.chinaDirectTitle'),
      desc: t('admin:templateRules.presets.chinaDirectDesc'),
      payload: {
        name: t('admin:templateRules.presets.chinaDirectName'),
        type: 'geosite',
        target: 'DIRECT',
        enabled: true,
        rules: ['cn', 'private']
      }
    },
    {
      title: t('admin:templateRules.presets.finalMatchTitle'),
      desc: t('admin:templateRules.presets.finalMatchDesc'),
      payload: {
        name: t('admin:templateRules.presets.finalMatchName'),
        type: 'match',
        target: '',
        enabled: true,
        rules: []
      }
    },
    {
      title: t('admin:templateRules.presets.remoteRuleSetTitle'),
      desc: t('admin:templateRules.presets.remoteRuleSetDesc'),
      payload: {
        name: t('admin:templateRules.presets.remoteRuleSetName'),
        type: 'remote-rule-set',
        target: '',
        enabled: true,
        rules: [],
        url: 'https://raw.githubusercontent.com/Loyalsoldier/clash-rules/release/gfw.txt',
        singboxUrl: 'https://raw.githubusercontent.com/SagerNet/sing-geosite/rule-set/geosite-geolocation-!cn.srs',
        format: 'binary'
      }
    }
  ], [t]);

  const rules = useMemo(() => value.map((item, i) => normalizeRule(item, i, t('admin:templateRules.defaultRuleName', { index: i + 1 }))), [value, t]);
  const [mode, setMode] = useState<'visual' | 'code'>('visual');
  const [source, setSource] = useState(() => JSON.stringify(value, null, 2));
  const [sourceError, setSourceError] = useState('');

  useEffect(() => {
    if (mode === 'visual') setSource(JSON.stringify(value, null, 2));
  }, [mode, value]);

  const updateRule = (index: number, patch: Partial<TemplateRuleDraft>) => onChange(rules.map((rule, itemIndex) => itemIndex === index ? { ...rule, ...patch } : rule));
  const targetOptions = [...new Set(['DIRECT', 'REJECT', ...targets.filter(Boolean)])];

  const addPreset = (preset: TemplateRuleDraft) => {
    onChange([...rules, preset]);
  };

  const formatSource = () => {
    try {
      const parsed = JSON.parse(source);
      if (Array.isArray(parsed)) {
        const pretty = JSON.stringify(parsed, null, 2);
        setSource(pretty);
        setSourceError('');
        onChange(parsed);
      }
    } catch {
      // ignore
    }
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-hidden">
      {/* 统一沉浸式顶栏 */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card/60 p-2.5 shadow-sm">
        {/* 左侧分段切换器 */}
        <div className="flex items-center gap-1.5 rounded-md bg-muted p-1">
          <button
            type="button"
            onClick={() => setMode('visual')}
            className={cn(
              'flex items-center gap-1.5 rounded-sm px-3 py-1 text-xs font-medium transition-colors',
              mode === 'visual'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <ListFilter className="h-3.5 w-3.5 text-primary" />
            {t('admin:templateRules.modeVisual')}
          </button>
          <button
            type="button"
            onClick={() => setMode('code')}
            className={cn(
              'flex items-center gap-1.5 rounded-sm px-3 py-1 text-xs font-medium transition-colors',
              mode === 'code'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Code2 className="h-3.5 w-3.5 text-blue-500" />
            {t('admin:templateRules.modeCode')}
          </button>
        </div>

        {/* 右侧状态徽章与操作 */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {mode === 'visual' ? (
            <Badge variant="secondary" className="text-xs">
              {t('admin:templateRules.totalCount', { count: rules.length })}
            </Badge>
          ) : (
            <Badge
              variant={!sourceError ? 'outline' : 'destructive'}
              className="flex items-center gap-1 py-0.5 text-[11px]"
            >
              {!sourceError ? (
                <CheckCircle2 className="h-3 w-3 text-emerald-500" />
              ) : (
                <AlertCircle className="h-3 w-3" />
              )}
              <span>{!sourceError ? t('admin:templateRules.statusValid') : t('admin:templateRules.statusError')}</span>
            </Badge>
          )}

          {/* 常用预设菜单 */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
                <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                {t('admin:templateRules.presetsDropdown')}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="text-xs">{t('admin:templateRules.presetsDropdownLabel')}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {presetRules.map((preset) => (
                <DropdownMenuItem
                  key={preset.title}
                  onClick={() => addPreset(preset.payload)}
                  className="flex flex-col items-start gap-0.5 py-1.5 cursor-pointer"
                >
                  <span className="font-medium text-xs text-foreground">{preset.title}</span>
                  <span className="text-[10px] text-muted-foreground">{preset.desc}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* 源码美化按钮 */}
          {mode === 'code' && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              onClick={formatSource}
              disabled={!!sourceError}
              title={t('admin:templateRules.beautifyTitle')}
            >
              <Wand2 className="h-3.5 w-3.5 text-primary" />
              {t('admin:templateRules.beautify')}
            </Button>
          )}

          {/* 新增分流规则 */}
          <Button
            type="button"
            variant="default"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={() => onChange([...rules, normalizeRule({}, rules.length, t('admin:templateRules.defaultRuleName', { index: rules.length + 1 }))])}
          >
            <Plus className="h-3.5 w-3.5" />
            {t('admin:templateRules.addRule')}
          </Button>
        </div>
      </div>

      {/* 主体编辑区 */}
      {mode === 'visual' ? (
        <div className="min-h-0 min-w-0 flex-1 space-y-3 overflow-y-auto pr-1">
          {rules.length === 0 ? (
            <div className="flex h-40 flex-col items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground">
              <span>{t('admin:templateRules.emptyNotice')}</span>
            </div>
          ) : (
            rules.map((rule, index) => (
              <Card key={`${rule.name}-${index}`} className="border-border/70 shadow-sm">
                <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[11px] font-bold text-foreground">
                      {index + 1}
                    </span>
                    <CardTitle className="text-sm font-semibold">{rule.name}</CardTitle>
                    <Badge variant="outline" className="text-[10px]">
                      {ruleTypes.find((item) => item.value === rule.type)?.label || rule.type}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1">
                    <IconButton
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label={t('admin:templateRules.moveUp')}
                      disabled={index === 0}
                      onClick={() => onChange(swap(rules, index, index - 1))}
                    >
                      <ArrowUp className="size-4" />
                    </IconButton>
                    <IconButton
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label={t('admin:templateRules.moveDown')}
                      disabled={index === rules.length - 1}
                      onClick={() => onChange(swap(rules, index, index + 1))}
                    >
                      <ArrowDown className="size-4" />
                    </IconButton>
                    <IconButton
                      type="button"
                      variant="ghost"
                      size="icon-xs" className="text-muted-foreground hover:text-destructive"
                      aria-label={t('admin:templateRules.deleteRule')}
                      onClick={() => onChange(rules.filter((_, itemIndex) => itemIndex !== index))}
                    >
                      <Trash2 className="size-4" />
                    </IconButton>
                  </div>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t('admin:templateRules.nameLabel')}</Label>
                    <Input
                      value={rule.name}
                      onChange={(event) => updateRule(index, { name: event.target.value })}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t('admin:templateRules.typeLabel')}</Label>
                    <Select
                      value={rule.type}
                      onValueChange={(type) => updateRule(index, { type: type as TemplateRuleDraft['type'] })}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ruleTypes.map((item) => (
                          <SelectItem key={item.value} value={item.value} className="text-xs">
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t('admin:templateRules.targetLabel')}</Label>
                    <Select
                      value={rule.target || '__default'}
                      onValueChange={(target) => updateRule(index, { target: target === '__default' ? '' : target })}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder={t('admin:templateRules.defaultTargetPlaceholder')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__default" className="text-xs">
                          {t('admin:templateRules.defaultTargetPlaceholder')}
                        </SelectItem>
                        {targetOptions.map((target) => (
                          <SelectItem key={target} value={target} className="text-xs">
                            {target}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2 pt-6">
                    <Checkbox
                      id={`enable-rule-${index}`}
                      checked={rule.enabled}
                      onCheckedChange={(checked) => updateRule(index, { enabled: checked === true })}
                    />
                    <Label htmlFor={`enable-rule-${index}`} className="text-xs font-normal cursor-pointer">
                      {t('admin:templateRules.enableRule')}
                    </Label>
                  </div>

                  {rule.type !== 'match' && rule.type !== 'remote-rule-set' && (
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label className="text-xs">{t('admin:templateRules.rulesListLabel')}</Label>
                      <Textarea
                        value={rule.rules.join('\n')}
                        onChange={(event) =>
                          updateRule(index, {
                            rules: event.target.value.split('\n').map((item) => item.trim()).filter(Boolean)
                          })
                        }
                        placeholder={t('admin:templateRules.rulesListPlaceholder')}
                        className="min-h-20 font-mono text-xs"
                      />
                    </div>
                  )}

                  {rule.type === 'remote-rule-set' && (
                    <>
                      <div className="space-y-1.5">
                        <Label className="text-xs">{t('admin:templateRules.clashUrlLabel')}</Label>
                        <Input
                          value={rule.url ?? ''}
                          onChange={(event) => updateRule(index, { url: event.target.value })}
                          placeholder="https://...yaml"
                          className="h-8 text-xs font-mono"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">{t('admin:templateRules.singboxUrlLabel')}</Label>
                        <Input
                          value={rule.singboxUrl ?? ''}
                          onChange={(event) => updateRule(index, { singboxUrl: event.target.value })}
                          placeholder="https://...srs"
                          className="h-8 text-xs font-mono"
                        />
                      </div>
                      <div className="space-y-1.5 sm:col-span-2">
                        <Label className="text-xs">{t('admin:templateRules.formatLabel')}</Label>
                        <Select
                          value={rule.format ?? 'binary'}
                          onValueChange={(format) => updateRule(index, { format: format as 'binary' | 'source' })}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="binary" className="text-xs">
                              {t('admin:templateRules.formatBinary')}
                            </SelectItem>
                            <SelectItem value="source" className="text-xs">
                              {t('admin:templateRules.formatSource')}
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      ) : (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-hidden">
          <div
            className={cn(
              'min-h-[360px] min-w-0 flex-1 overflow-hidden rounded-md border bg-background shadow-sm',
              sourceError && 'border-destructive'
            )}
          >
            <TemplateCodeEditor
              value={source}
              height="100%"
              className="h-full"
              extensions={[json()]}
              basicSetup={{ lineNumbers: true, foldGutter: true }}
              onChange={(next) => {
                setSource(next);
                try {
                  const parsed: unknown = JSON.parse(next);
                  if (!Array.isArray(parsed)) throw new Error(t('admin:templateRules.errorMustBeArray'));
                  setSourceError('');
                  onChange(parsed);
                } catch (err) {
                  setSourceError((err as Error).message || t('admin:templateRules.errorSyntax'));
                }
              }}
            />
          </div>
          {sourceError && (
            <div className="shrink-0 rounded-lg border border-destructive/30 bg-destructive/5 p-3 shadow-sm">
              <div className="flex items-center justify-between gap-2 pb-1.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-destructive">
                  <AlertCircle className="h-4 w-4 shrink-0 text-destructive animate-pulse" />
                  <span>{t('admin:templateRules.syntaxErrorTitle')}</span>
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {t('admin:templateRules.syntaxErrorDesc')}
                </span>
              </div>
              <div className="overflow-x-auto rounded-md bg-zinc-950/90 dark:bg-zinc-900/90 px-3 py-2 text-red-400 dark:text-red-300 font-mono text-[11px] leading-relaxed select-text shadow-inner">
                <div className="flex items-start gap-2">
                  <span className="shrink-0 font-bold select-none text-red-500/80">&gt;</span>
                  <span className="break-all">{sourceError}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
