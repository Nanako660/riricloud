import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { json } from '@codemirror/lang-json';
import {
  ArrowDown,
  ArrowUp,
  Plus,
  Trash2,
  Sliders,
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

export interface TemplateGroupDraft {
  name: string;
  type: 'select' | 'url-test' | 'fallback' | 'load-balance';
  proxies: string | string[];
  filter?: string;
  includeTags?: string[];
  excludeTags?: string[];
  protocols?: string[];
  maxRate?: number;
  url?: string;
  interval?: number;
  tolerance?: number;
}

const PROTOCOLS = ['VLESS', 'VMESS', 'TROJAN', 'HYSTERIA2', 'TUIC', 'SHADOWSOCKS', 'NAIVE'];
const VALID_TYPES = ['select', 'url-test', 'fallback', 'load-balance'] as const;

function normalizeGroup(value: unknown, index: number, fallbackName?: string): TemplateGroupDraft {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const rawType = typeof source.type === 'string' ? source.type : 'select';
  const type = (VALID_TYPES.includes(rawType as (typeof VALID_TYPES)[number]) ? rawType : 'select') as TemplateGroupDraft['type'];
  return {
    name: typeof source.name === 'string' ? source.name : (fallbackName || `Proxy Group ${index + 1}`),
    type,
    proxies: typeof source.proxies === 'string' || Array.isArray(source.proxies) ? source.proxies as string | string[] : 'all',
    filter: typeof source.filter === 'string' ? source.filter : '',
    includeTags: Array.isArray(source.includeTags) ? source.includeTags.filter((item): item is string => typeof item === 'string') : [],
    excludeTags: Array.isArray(source.excludeTags) ? source.excludeTags.filter((item): item is string => typeof item === 'string') : [],
    protocols: Array.isArray(source.protocols) ? source.protocols.filter((item): item is string => typeof item === 'string') : [],
    ...(typeof source.maxRate === 'number' ? { maxRate: source.maxRate } : {}),
    url: typeof source.url === 'string' ? source.url : 'https://www.gstatic.com/generate_204',
    interval: typeof source.interval === 'number' ? source.interval : 300,
    ...(typeof source.tolerance === 'number' ? { tolerance: source.tolerance } : {})
  };
}

function commaValues(value: string) {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function swap<T>(items: T[], from: number, to: number) {
  const next = [...items];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

export function TemplateGroupsEditor({ value, onChange }: { value: unknown[]; onChange: (value: unknown[]) => void }) {
  const { t } = useTranslation(['admin', 'common']);

  const groupTypes = useMemo(() => [
    { value: 'select', label: t('admin:templateGroups.types.select') },
    { value: 'url-test', label: t('admin:templateGroups.types.urlTest') },
    { value: 'fallback', label: t('admin:templateGroups.types.fallback') },
    { value: 'load-balance', label: t('admin:templateGroups.types.loadBalance') }
  ], [t]);

  const presetGroups = useMemo<Array<{ title: string; desc: string; payload: TemplateGroupDraft }>>(() => [
    {
      title: t('admin:templateGroups.presets.urlTestTitle'),
      desc: t('admin:templateGroups.presets.urlTestDesc'),
      payload: {
        name: t('admin:templateGroups.presets.urlTestName'),
        type: 'url-test',
        proxies: 'all',
        url: 'https://www.gstatic.com/generate_204',
        interval: 300,
        tolerance: 50
      }
    },
    {
      title: t('admin:templateGroups.presets.selectTitle'),
      desc: t('admin:templateGroups.presets.selectDesc'),
      payload: {
        name: t('admin:templateGroups.presets.selectName'),
        type: 'select',
        proxies: 'all'
      }
    },
    {
      title: t('admin:templateGroups.presets.fallbackTitle'),
      desc: t('admin:templateGroups.presets.fallbackDesc'),
      payload: {
        name: t('admin:templateGroups.presets.fallbackName'),
        type: 'fallback',
        proxies: 'all',
        url: 'https://www.gstatic.com/generate_204',
        interval: 300
      }
    },
    {
      title: t('admin:templateGroups.presets.loadBalanceTitle'),
      desc: t('admin:templateGroups.presets.loadBalanceDesc'),
      payload: {
        name: t('admin:templateGroups.presets.loadBalanceName'),
        type: 'load-balance',
        proxies: 'all',
        url: 'https://www.gstatic.com/generate_204',
        interval: 300
      }
    },
    {
      title: t('admin:templateGroups.presets.aiTitle'),
      desc: t('admin:templateGroups.presets.aiDesc'),
      payload: {
        name: t('admin:templateGroups.presets.aiName'),
        type: 'select',
        proxies: 'all'
      }
    },
    {
      title: t('admin:templateGroups.presets.streamingTitle'),
      desc: t('admin:templateGroups.presets.streamingDesc'),
      payload: {
        name: t('admin:templateGroups.presets.streamingName'),
        type: 'select',
        proxies: 'all'
      }
    }
  ], [t]);

  const groups = useMemo(() => value.map((item, i) => normalizeGroup(item, i, t('admin:templateGroups.defaultGroupName', { index: i + 1 }))), [value, t]);
  const [mode, setMode] = useState<'visual' | 'code'>('visual');
  const [source, setSource] = useState(() => JSON.stringify(value, null, 2));
  const [sourceError, setSourceError] = useState('');

  useEffect(() => {
    if (mode === 'visual') setSource(JSON.stringify(value, null, 2));
  }, [mode, value]);

  const updateGroup = (index: number, patch: Partial<TemplateGroupDraft>) => {
    onChange(groups.map((group, itemIndex) => itemIndex === index ? { ...group, ...patch } : group));
  };

  const toggleProtocol = (index: number, protocol: string, checked: boolean) => {
    const current = groups[index].protocols ?? [];
    updateGroup(index, { protocols: checked ? [...current, protocol] : current.filter((item) => item !== protocol) });
  };

  const addPreset = (preset: TemplateGroupDraft) => {
    onChange([...groups, preset]);
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
            <Sliders className="h-3.5 w-3.5 text-primary" />
            {t('admin:templateGroups.modeVisual')}
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
            {t('admin:templateGroups.modeCode')}
          </button>
        </div>

        {/* 右侧状态徽章与操作 */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {mode === 'visual' ? (
            <Badge variant="secondary" className="text-xs">
              {t('admin:templateGroups.totalCount', { count: groups.length })}
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
              <span>{!sourceError ? t('admin:templateGroups.statusValid') : t('admin:templateGroups.statusError')}</span>
            </Badge>
          )}

          {/* 常用预设菜单 */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
                <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                {t('admin:templateGroups.presetsDropdown')}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="text-xs">{t('admin:templateGroups.presetsDropdownLabel')}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {presetGroups.map((preset) => (
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
              title={t('admin:templateGroups.beautifyTitle')}
            >
              <Wand2 className="h-3.5 w-3.5 text-primary" />
              {t('admin:templateGroups.beautify')}
            </Button>
          )}

          {/* 新增策略组 */}
          <Button
            type="button"
            variant="default"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={() => onChange([...groups, normalizeGroup({}, groups.length, t('admin:templateGroups.defaultGroupName', { index: groups.length + 1 }))])}
          >
            <Plus className="h-3.5 w-3.5" />
            {t('admin:templateGroups.addGroup')}
          </Button>
        </div>
      </div>

      {/* 主体编辑区 */}
      {mode === 'visual' ? (
        <div className="min-h-0 min-w-0 flex-1 space-y-3 overflow-y-auto pr-1">
          {groups.length === 0 ? (
            <div className="flex h-40 flex-col items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground">
              <span>{t('admin:templateGroups.emptyNotice')}</span>
            </div>
          ) : (
            groups.map((group, index) => (
              <Card key={`${group.name}-${index}`} className="border-border/70 shadow-sm">
                <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[11px] font-bold text-foreground">
                      {index + 1}
                    </span>
                    <CardTitle className="text-sm font-semibold">{group.name}</CardTitle>
                    <Badge variant="outline" className="text-[10px]">
                      {groupTypes.find((item) => item.value === group.type)?.label || group.type}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1">
                    <IconButton
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label={t('admin:templateGroups.moveUp')}
                      disabled={index === 0}
                      onClick={() => onChange(swap(groups, index, index - 1))}
                    >
                      <ArrowUp className="size-4" />
                    </IconButton>
                    <IconButton
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label={t('admin:templateGroups.moveDown')}
                      disabled={index === groups.length - 1}
                      onClick={() => onChange(swap(groups, index, index + 1))}
                    >
                      <ArrowDown className="size-4" />
                    </IconButton>
                    <IconButton
                      type="button"
                      variant="ghost"
                      size="icon-xs" className="text-muted-foreground hover:text-destructive"
                      aria-label={t('admin:templateGroups.deleteGroup')}
                      onClick={() => onChange(groups.filter((_, itemIndex) => itemIndex !== index))}
                    >
                      <Trash2 className="size-4" />
                    </IconButton>
                  </div>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t('admin:templateGroups.nameLabel')}</Label>
                    <Input
                      value={group.name}
                      onChange={(event) => updateGroup(index, { name: event.target.value })}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t('admin:templateGroups.typeLabel')}</Label>
                    <Select
                      value={group.type}
                      onValueChange={(type) => updateGroup(index, { type: type as TemplateGroupDraft['type'] })}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {groupTypes.map((item) => (
                          <SelectItem key={item.value} value={item.value} className="text-xs">
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label className="text-xs">{t('admin:templateGroups.proxiesLabel')}</Label>
                    <Input
                      value={Array.isArray(group.proxies) ? group.proxies.join(', ') : group.proxies}
                      onChange={(event) =>
                        updateGroup(index, {
                          proxies: event.target.value.includes(',') ? commaValues(event.target.value) : event.target.value
                        })
                      }
                      placeholder={t('admin:templateGroups.proxiesPlaceholder')}
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t('admin:templateGroups.filterLabel')}</Label>
                    <Input
                      value={group.filter ?? ''}
                      onChange={(event) => updateGroup(index, { filter: event.target.value })}
                      placeholder={t('admin:templateGroups.filterPlaceholder')}
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t('admin:templateGroups.includeTagsLabel')}</Label>
                    <Input
                      value={(group.includeTags ?? []).join(', ')}
                      onChange={(event) => updateGroup(index, { includeTags: commaValues(event.target.value) })}
                      placeholder={t('admin:templateGroups.includeTagsPlaceholder')}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t('admin:templateGroups.excludeTagsLabel')}</Label>
                    <Input
                      value={(group.excludeTags ?? []).join(', ')}
                      onChange={(event) => updateGroup(index, { excludeTags: commaValues(event.target.value) })}
                      placeholder={t('admin:templateGroups.excludeTagsPlaceholder')}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t('admin:templateGroups.maxRateLabel')}</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.1"
                      value={group.maxRate ?? ''}
                      onChange={(event) =>
                        updateGroup(index, { maxRate: event.target.value ? Number(event.target.value) : undefined })
                      }
                      placeholder={t('admin:templateGroups.maxRatePlaceholder')}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label className="text-xs">{t('admin:templateGroups.protocolsLabel')}</Label>
                    <div className="grid grid-cols-2 gap-2 rounded-md border bg-background/50 p-2.5 sm:grid-cols-4">
                      {PROTOCOLS.map((protocol) => (
                        <label key={protocol} className="flex items-center gap-2 text-xs">
                          <Checkbox
                            checked={(group.protocols ?? []).includes(protocol)}
                            onCheckedChange={(checked) => toggleProtocol(index, protocol, checked === true)}
                          />
                          <span className="font-mono text-[11px]">{protocol}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  {group.type !== 'select' && (
                    <>
                      <div className="space-y-1.5">
                        <Label className="text-xs">{t('admin:templateGroups.urlLabel')}</Label>
                        <Input
                          value={group.url ?? ''}
                          onChange={(event) => updateGroup(index, { url: event.target.value })}
                          className="h-8 text-xs font-mono"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">{t('admin:templateGroups.intervalLabel')}</Label>
                        <Input
                          type="number"
                          min="5"
                          value={group.interval ?? 300}
                          onChange={(event) => updateGroup(index, { interval: Number(event.target.value) || 300 })}
                          className="h-8 text-xs"
                        />
                      </div>
                      <div className="space-y-1.5 sm:col-span-2">
                        <Label className="text-xs">{t('admin:templateGroups.toleranceLabel')}</Label>
                        <Input
                          type="number"
                          min="0"
                          value={group.tolerance ?? ''}
                          onChange={(event) =>
                            updateGroup(index, { tolerance: event.target.value ? Number(event.target.value) : undefined })
                          }
                          placeholder={t('admin:templateGroups.tolerancePlaceholder')}
                          className="h-8 text-xs"
                        />
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
                  if (!Array.isArray(parsed)) throw new Error(t('admin:templateGroups.errorMustBeArray'));
                  setSourceError('');
                  onChange(parsed);
                } catch (err) {
                  setSourceError((err as Error).message || t('admin:templateGroups.errorSyntax'));
                }
              }}
            />
          </div>
          {sourceError && (
            <div className="shrink-0 rounded-lg border border-destructive/30 bg-destructive/5 p-3 shadow-sm">
              <div className="flex items-center justify-between gap-2 pb-1.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-destructive">
                  <AlertCircle className="h-4 w-4 shrink-0 text-destructive animate-pulse" />
                  <span>{t('admin:templateGroups.syntaxErrorTitle')}</span>
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {t('admin:templateGroups.syntaxErrorDesc')}
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
