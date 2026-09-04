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
const GROUP_TYPES = [
  { value: 'select', label: '手动选择' },
  { value: 'url-test', label: '自动测速' },
  { value: 'fallback', label: '故障转移' },
  { value: 'load-balance', label: '负载均衡' }
];

function normalizeGroup(value: unknown, index: number): TemplateGroupDraft {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const type = typeof source.type === 'string' && GROUP_TYPES.some((item) => item.value === source.type)
    ? source.type as TemplateGroupDraft['type']
    : 'select';
  return {
    name: typeof source.name === 'string' ? source.name : `策略组 ${index + 1}`,
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
  const groups = useMemo(() => value.map(normalizeGroup), [value]);
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

  return (
    <Tabs value={mode} onValueChange={(next) => setMode(next as 'visual' | 'code')} className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
      <TabsList className="grid w-full grid-cols-2 sm:w-auto">
        <TabsTrigger value="visual">可视化编辑</TabsTrigger>
        <TabsTrigger value="code">JSON 源码</TabsTrigger>
      </TabsList>
      <TabsContent value="visual" className="min-h-0 min-w-0 flex-1 space-y-3 overflow-y-auto">
        {groups.map((group, index) => (
          <Card key={`${group.name}-${index}`}>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-sm">策略组 {index + 1}</CardTitle>
              <div className="flex items-center gap-1">
                <Button type="button" variant="ghost" size="icon" aria-label="上移策略组" disabled={index === 0} onClick={() => onChange(swap(groups, index, index - 1))}><ArrowUp className="size-4" /></Button>
                <Button type="button" variant="ghost" size="icon" aria-label="下移策略组" disabled={index === groups.length - 1} onClick={() => onChange(swap(groups, index, index + 1))}><ArrowDown className="size-4" /></Button>
                <Button type="button" variant="ghost" size="icon" aria-label="删除策略组" onClick={() => onChange(groups.filter((_, itemIndex) => itemIndex !== index))}><Trash2 className="size-4 text-destructive" /></Button>
              </div>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2"><Label>名称</Label><Input value={group.name} onChange={(event) => updateGroup(index, { name: event.target.value })} /></div>
              <div className="space-y-2"><Label>类型</Label><Select value={group.type} onValueChange={(type) => updateGroup(index, { type: type as TemplateGroupDraft['type'] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{GROUP_TYPES.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-2 sm:col-span-2"><Label>候选项</Label><Input value={Array.isArray(group.proxies) ? group.proxies.join(', ') : group.proxies} onChange={(event) => updateGroup(index, { proxies: event.target.value.includes(',') ? commaValues(event.target.value) : event.target.value })} placeholder="all、DIRECT 或策略组名称，逗号分隔" /></div>
              <div className="space-y-2"><Label>名称 / Tag 正则</Label><Input value={group.filter ?? ''} onChange={(event) => updateGroup(index, { filter: event.target.value })} placeholder="香港|HK" /></div>
              <div className="space-y-2"><Label>线路标签</Label><Input value={(group.includeTags ?? []).join(', ')} onChange={(event) => updateGroup(index, { includeTags: commaValues(event.target.value) })} placeholder="必须包含的标签" /></div>
              <div className="space-y-2"><Label>排除标签</Label><Input value={(group.excludeTags ?? []).join(', ')} onChange={(event) => updateGroup(index, { excludeTags: commaValues(event.target.value) })} placeholder="需要排除的标签" /></div>
              <div className="space-y-2"><Label>最高倍率</Label><Input type="number" min="0" step="0.1" value={group.maxRate ?? ''} onChange={(event) => updateGroup(index, { maxRate: event.target.value ? Number(event.target.value) : undefined })} placeholder="不限制" /></div>
              <div className="space-y-2 sm:col-span-2"><Label>限定协议</Label><div className="grid grid-cols-2 gap-2 rounded-md border p-3 sm:grid-cols-4">{PROTOCOLS.map((protocol) => <label key={protocol} className="flex items-center gap-2 text-sm"><Checkbox checked={(group.protocols ?? []).includes(protocol)} onCheckedChange={(checked) => toggleProtocol(index, protocol, checked === true)} /><span>{protocol}</span></label>)}</div></div>
              {group.type !== 'select' && <>
                <div className="space-y-2"><Label>测速地址</Label><Input value={group.url ?? ''} onChange={(event) => updateGroup(index, { url: event.target.value })} /></div>
                <div className="space-y-2"><Label>检测间隔（秒）</Label><Input type="number" min="5" value={group.interval ?? 300} onChange={(event) => updateGroup(index, { interval: Number(event.target.value) || 300 })} /></div>
                <div className="space-y-2"><Label>容差（毫秒）</Label><Input type="number" min="0" value={group.tolerance ?? ''} onChange={(event) => updateGroup(index, { tolerance: event.target.value ? Number(event.target.value) : undefined })} placeholder="可选" /></div>
              </>}
            </CardContent>
          </Card>
        ))}
        <Button type="button" variant="outline" onClick={() => onChange([...groups, normalizeGroup({}, groups.length)])}><Plus className="size-4" />新增策略组</Button>
      </TabsContent>
      <TabsContent value="code" className="data-[state=active]:flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-hidden">
        <div className={cn('min-h-[360px] min-w-0 flex-1 overflow-hidden rounded-md border bg-background shadow-sm', sourceError && 'border-destructive')}>
          <TemplateCodeEditor value={source} height="100%" className="h-full" extensions={[json()]} basicSetup={{ lineNumbers: true, foldGutter: true }} onChange={(next) => {
            setSource(next);
            try {
              const parsed: unknown = JSON.parse(next);
              if (!Array.isArray(parsed)) throw new Error('not array');
              setSourceError('');
              onChange(parsed);
            } catch {
              setSourceError('JSON 数组尚未闭合，修正后即可同步到可视化模式');
            }
          }} />
        </div>
        {sourceError && <p className="text-xs text-destructive">{sourceError}</p>}
      </TabsContent>
    </Tabs>
  );
}
