import { useEffect, useMemo, useState } from 'react';
import { json } from '@codemirror/lang-json';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
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

  return (
    <Tabs value={mode} onValueChange={(next) => setMode(next as 'visual' | 'code')} className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
      <TabsList className="grid w-full grid-cols-2 sm:w-auto"><TabsTrigger value="visual">可视化编辑</TabsTrigger><TabsTrigger value="code">JSON 源码</TabsTrigger></TabsList>
      <TabsContent value="visual" className="min-h-0 min-w-0 flex-1 space-y-3 overflow-y-auto">
        {rules.map((rule, index) => (
          <Card key={`${rule.name}-${index}`}>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-3"><CardTitle className="text-sm">分流规则 {index + 1}</CardTitle><div className="flex items-center gap-1"><Button type="button" variant="ghost" size="icon" aria-label="上移分流规则" disabled={index === 0} onClick={() => onChange(swap(rules, index, index - 1))}><ArrowUp className="size-4" /></Button><Button type="button" variant="ghost" size="icon" aria-label="下移分流规则" disabled={index === rules.length - 1} onClick={() => onChange(swap(rules, index, index + 1))}><ArrowDown className="size-4" /></Button><Button type="button" variant="ghost" size="icon" aria-label="删除分流规则" onClick={() => onChange(rules.filter((_, itemIndex) => itemIndex !== index))}><Trash2 className="size-4 text-destructive" /></Button></div></CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2"><Label>名称</Label><Input value={rule.name} onChange={(event) => updateRule(index, { name: event.target.value })} /></div>
              <div className="space-y-2"><Label>类型</Label><Select value={rule.type} onValueChange={(type) => updateRule(index, { type: type as TemplateRuleDraft['type'] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{RULE_TYPES.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-2"><Label>目标策略组</Label><Select value={rule.target || '__default'} onValueChange={(target) => updateRule(index, { target: target === '__default' ? '' : target })}><SelectTrigger><SelectValue placeholder="默认主策略组" /></SelectTrigger><SelectContent><SelectItem value="__default">默认主策略组</SelectItem>{targetOptions.map((target) => <SelectItem key={target} value={target}>{target}</SelectItem>)}</SelectContent></Select></div>
              <label className="flex items-center gap-2 pt-7 text-sm"><Checkbox checked={rule.enabled} onCheckedChange={(checked) => updateRule(index, { enabled: checked === true })} />启用规则</label>
              {rule.type !== 'match' && rule.type !== 'remote-rule-set' && <div className="space-y-2 sm:col-span-2"><Label>规则值</Label><Textarea value={rule.rules.join('\n')} onChange={(event) => updateRule(index, { rules: event.target.value.split('\n').map((item) => item.trim()).filter(Boolean) })} placeholder="每行一条规则" className="min-h-24 font-mono text-xs" /></div>}
              {rule.type === 'remote-rule-set' && <>
                <div className="space-y-2"><Label>Clash Provider URL</Label><Input value={rule.url ?? ''} onChange={(event) => updateRule(index, { url: event.target.value })} placeholder="https://...yaml" /></div>
                <div className="space-y-2"><Label>Sing-box Rule-Set URL</Label><Input value={rule.singboxUrl ?? ''} onChange={(event) => updateRule(index, { singboxUrl: event.target.value })} placeholder="https://...srs" /></div>
                <div className="space-y-2"><Label>Sing-box 格式</Label><Select value={rule.format ?? 'binary'} onValueChange={(format) => updateRule(index, { format: format as 'binary' | 'source' })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="binary">binary (.srs)</SelectItem><SelectItem value="source">source (JSON)</SelectItem></SelectContent></Select></div>
              </>}
            </CardContent>
          </Card>
        ))}
        <Button type="button" variant="outline" onClick={() => onChange([...rules, normalizeRule({}, rules.length)])}><Plus className="size-4" />新增分流规则</Button>
      </TabsContent>
      <TabsContent value="code" className="data-[state=active]:flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-hidden"><div className={cn('min-h-[360px] min-w-0 flex-1 overflow-hidden rounded-md border bg-background shadow-sm', sourceError && 'border-destructive')}><TemplateCodeEditor value={source} height="100%" className="h-full" extensions={[json()]} basicSetup={{ lineNumbers: true, foldGutter: true }} onChange={(next) => { setSource(next); try { const parsed: unknown = JSON.parse(next); if (!Array.isArray(parsed)) throw new Error('not array'); setSourceError(''); onChange(parsed); } catch { setSourceError('JSON 数组尚未闭合，修正后即可同步到可视化模式'); } }} /></div>{sourceError && <p className="shrink-0 text-xs text-destructive">{sourceError}</p>}</TabsContent>
    </Tabs>
  );
}
