import { useEffect, useMemo, useState } from 'react';
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

const RULE_TYPES = [
  { value: 'domain-suffix', label: '域名后缀' },
  { value: 'domain-keyword', label: '域名关键词' },
  { value: 'domain', label: '精确域名' },
  { value: 'ip-cidr', label: 'IP 网段' },
  { value: 'geosite', label: 'GeoSite' },
  { value: 'remote-rule-set', label: '远程 Rule-Set' },
  { value: 'match', label: '最终匹配' }
];

const PRESET_RULES: Array<{ title: string; desc: string; payload: TemplateRuleDraft }> = [
  {
    title: '🛑 广告与追踪拦截',
    desc: '常见广告追踪域名，出站目标 REJECT',
    payload: {
      name: '广告与追踪拦截',
      type: 'domain-suffix',
      target: 'REJECT',
      enabled: true,
      rules: ['doubleclick.net', 'adservice.google.com', 'adcolony.com', 'adjust.com', 'applovin.com', 'appsflyer.com']
    }
  },
  {
    title: '🤖 AI 服务分流',
    desc: 'OpenAI、Claude、Gemini 等 AI 常用域名',
    payload: {
      name: 'AI 服务',
      type: 'domain-suffix',
      target: '',
      enabled: true,
      rules: ['openai.com', 'chatgpt.com', 'oaistatic.com', 'oaiusercontent.com', 'anthropic.com', 'claude.ai', 'bard.google.com', 'gemini.google.com']
    }
  },
  {
    title: '🎬 国际流媒体',
    desc: 'YouTube、Netflix、Disney+ 常见流媒体后缀',
    payload: {
      name: '国际流媒体',
      type: 'domain-suffix',
      target: '',
      enabled: true,
      rules: ['youtube.com', 'googlevideo.com', 'netflix.com', 'nflxvideo.net', 'disneyplus.com', 'spotify.com']
    }
  },
  {
    title: '🎯 中国大陆主流直连 (GeoSite)',
    desc: '国内直连域名与私有地址，目标 DIRECT',
    payload: {
      name: '中国大陆直连',
      type: 'geosite',
      target: 'DIRECT',
      enabled: true,
      rules: ['cn', 'private']
    }
  },
  {
    title: '🐟 漏网之鱼 (兜底匹配)',
    desc: '未命中前面任何规则的最终流量流向',
    payload: {
      name: '兜底匹配 Final',
      type: 'match',
      target: '',
      enabled: true,
      rules: []
    }
  },
  {
    title: '🌐 远程 Rule-Set 规则集',
    desc: '通过 HTTP 订阅远端维护的规则集',
    payload: {
      name: '远程分流规则集',
      type: 'remote-rule-set',
      target: '',
      enabled: true,
      rules: [],
      url: 'https://raw.githubusercontent.com/Loyalsoldier/clash-rules/release/gfw.txt',
      singboxUrl: 'https://raw.githubusercontent.com/SagerNet/sing-geosite/rule-set/geosite-geolocation-!cn.srs',
      format: 'binary'
    }
  }
];

function normalizeRule(value: unknown, index: number): TemplateRuleDraft {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const type = typeof source.type === 'string' && RULE_TYPES.some((item) => item.value === source.type) ? source.type as TemplateRuleDraft['type'] : 'domain-suffix';
  return {
    name: typeof source.name === 'string' ? source.name : `分流规则 ${index + 1}`,
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
  const rules = useMemo(() => value.map(normalizeRule), [value]);
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
            可视化设计
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
            JSON 源码
          </button>
        </div>

        {/* 右侧状态徽章与操作 */}
        <div className="flex items-center gap-2">
          {mode === 'visual' ? (
            <Badge variant="secondary" className="text-xs">
              共 {rules.length} 条分流规则
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
              <span className="max-w-[200px] truncate" title={sourceError || 'JSON 数组有效'}>
                {!sourceError ? 'JSON 数组有效' : sourceError}
              </span>
            </Badge>
          )}

          {/* 常用预设菜单 */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
                <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                常用预设
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="text-xs">添加常用分流预设</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {PRESET_RULES.map((preset) => (
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
              title="美化排版 JSON"
            >
              <Wand2 className="h-3.5 w-3.5 text-primary" />
              美化
            </Button>
          )}

          {/* 新增分流规则 */}
          <Button
            type="button"
            variant="default"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={() => onChange([...rules, normalizeRule({}, rules.length)])}
          >
            <Plus className="h-3.5 w-3.5" />
            新增规则
          </Button>
        </div>
      </div>

      {/* 主体编辑区 */}
      {mode === 'visual' ? (
        <div className="min-h-0 min-w-0 flex-1 space-y-3 overflow-y-auto pr-1">
          {rules.length === 0 ? (
            <div className="flex h-40 flex-col items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground">
              <span>暂无分流规则，请点击上方「新增规则」或从「常用预设」快速引入</span>
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
                      {RULE_TYPES.find((t) => t.value === rule.type)?.label || rule.type}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      aria-label="上移分流规则"
                      disabled={index === 0}
                      onClick={() => onChange(swap(rules, index, index - 1))}
                    >
                      <ArrowUp className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      aria-label="下移分流规则"
                      disabled={index === rules.length - 1}
                      onClick={() => onChange(swap(rules, index, index + 1))}
                    >
                      <ArrowDown className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      aria-label="删除分流规则"
                      onClick={() => onChange(rules.filter((_, itemIndex) => itemIndex !== index))}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">规则名称</Label>
                    <Input
                      value={rule.name}
                      onChange={(event) => updateRule(index, { name: event.target.value })}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">匹配类型</Label>
                    <Select
                      value={rule.type}
                      onValueChange={(type) => updateRule(index, { type: type as TemplateRuleDraft['type'] })}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {RULE_TYPES.map((item) => (
                          <SelectItem key={item.value} value={item.value} className="text-xs">
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">出站目标策略组</Label>
                    <Select
                      value={rule.target || '__default'}
                      onValueChange={(target) => updateRule(index, { target: target === '__default' ? '' : target })}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="默认主策略组" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__default" className="text-xs">
                          默认主策略组
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
                      启用此分流规则
                    </Label>
                  </div>

                  {rule.type !== 'match' && rule.type !== 'remote-rule-set' && (
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label className="text-xs">规则条目清单（每行一条）</Label>
                      <Textarea
                        value={rule.rules.join('\n')}
                        onChange={(event) =>
                          updateRule(index, {
                            rules: event.target.value.split('\n').map((item) => item.trim()).filter(Boolean)
                          })
                        }
                        placeholder="例如 example.com 或 192.168.0.0/16"
                        className="min-h-20 font-mono text-xs"
                      />
                    </div>
                  )}

                  {rule.type === 'remote-rule-set' && (
                    <>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Clash Rule-Provider URL</Label>
                        <Input
                          value={rule.url ?? ''}
                          onChange={(event) => updateRule(index, { url: event.target.value })}
                          placeholder="https://...yaml"
                          className="h-8 text-xs font-mono"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Sing-box Rule-Set URL</Label>
                        <Input
                          value={rule.singboxUrl ?? ''}
                          onChange={(event) => updateRule(index, { singboxUrl: event.target.value })}
                          placeholder="https://...srs"
                          className="h-8 text-xs font-mono"
                        />
                      </div>
                      <div className="space-y-1.5 sm:col-span-2">
                        <Label className="text-xs">Sing-box 规则集格式</Label>
                        <Select
                          value={rule.format ?? 'binary'}
                          onValueChange={(format) => updateRule(index, { format: format as 'binary' | 'source' })}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="binary" className="text-xs">
                              binary (.srs 编译二进制)
                            </SelectItem>
                            <SelectItem value="source" className="text-xs">
                              source (JSON 文本源)
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
                  if (!Array.isArray(parsed)) throw new Error('必须是 JSON 数组');
                  setSourceError('');
                  onChange(parsed);
                } catch (err) {
                  setSourceError((err as Error).message || 'JSON 语法错误');
                }
              }}
            />
          </div>
          {sourceError && <p className="shrink-0 text-xs text-destructive">{sourceError}</p>}
        </div>
      )}
    </div>
  );
}
