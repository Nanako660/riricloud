import { useState, KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, X, RotateCcw, Globe, ShieldCheck, Zap } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export interface SemanticDnsConfig {
  enable?: boolean;
  fakeIp?: boolean;
  ipv6?: boolean;
  directDns?: string[];
  proxyDns?: string[];
}

interface TemplateDnsEditorProps {
  value: SemanticDnsConfig;
  onChange: (value: SemanticDnsConfig) => void;
}

const DIRECT_PRESETS = [
  { label: 'Ali DoH', value: 'https://223.5.5.5/dns-query' },
  { label: 'Tencent DoH', value: 'https://doh.pub/dns-query' },
  { label: 'Ali DNS', value: '223.5.5.5' },
  { label: 'DNSPod', value: '119.29.29.29' },
  { label: '114 DNS', value: '114.114.114.114' }
];

const PROXY_PRESETS = [
  { label: 'Cloudflare DoH', value: 'https://1.1.1.1/dns-query' },
  { label: 'Google DoH', value: 'https://8.8.8.8/dns-query' },
  { label: 'Quad9 DoH', value: 'https://9.9.9.9/dns-query' },
  { label: 'Cloudflare 1.1.1.1', value: '1.1.1.1' },
  { label: 'Google 8.8.8.8', value: '8.8.8.8' }
];

const RECOMMENDED_DNS: SemanticDnsConfig = {
  enable: true,
  fakeIp: true,
  ipv6: false,
  directDns: ['https://223.5.5.5/dns-query', '223.5.5.5'],
  proxyDns: ['https://1.1.1.1/dns-query', 'https://8.8.8.8/dns-query', 'https://9.9.9.9/dns-query']
};

export function TemplateDnsEditor({ value, onChange }: TemplateDnsEditorProps) {
  const { t } = useTranslation(['admin', 'common']);
  const [directInput, setDirectInput] = useState('');
  const [proxyInput, setProxyInput] = useState('');

  const enable = value.enable !== false;
  const fakeIp = value.fakeIp === true;
  const ipv6 = value.ipv6 !== false;
  const directDns = Array.isArray(value.directDns) ? value.directDns : [];
  const proxyDns = Array.isArray(value.proxyDns) ? value.proxyDns : [];

  const update = (patch: Partial<SemanticDnsConfig>) => {
    onChange({
      enable,
      fakeIp,
      ipv6,
      directDns,
      proxyDns,
      ...patch
    });
  };

  const addDirect = (item: string) => {
    const trimmed = item.trim();
    if (!trimmed || directDns.includes(trimmed)) return;
    update({ directDns: [...directDns, trimmed] });
    setDirectInput('');
  };

  const removeDirect = (index: number) => {
    update({ directDns: directDns.filter((_, i) => i !== index) });
  };

  const addProxy = (item: string) => {
    const trimmed = item.trim();
    if (!trimmed || proxyDns.includes(trimmed)) return;
    update({ proxyDns: [...proxyDns, trimmed] });
    setProxyInput('');
  };

  const removeProxy = (index: number) => {
    update({ proxyDns: proxyDns.filter((_, i) => i !== index) });
  };

  const handleDirectKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addDirect(directInput);
    }
  };

  const handleProxyKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addProxy(proxyInput);
    }
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
      {/* 顶部总览与重置操作 */}
      <div className="flex items-center justify-between gap-2 border-b pb-3">
        <div>
          <h4 className="text-sm font-semibold tracking-tight text-foreground">{t('admin:templateDns.title')}</h4>
          <p className="text-xs text-muted-foreground">{t('admin:templateDns.desc')}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 text-xs"
          onClick={() => onChange(RECOMMENDED_DNS)}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          {t('admin:templateDns.resetRecommended')}
        </Button>
      </div>

      {/* 核心开关组 */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex flex-col justify-between gap-2 rounded-lg border bg-card p-3 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <Globe className="h-3.5 w-3.5 text-primary" />
              {t('admin:templateDns.enableDns')}
            </span>
            <Switch
              checked={enable}
              onCheckedChange={(checked) => update({ enable: checked })}
            />
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {t('admin:templateDns.enableDnsDesc')}
          </p>
        </div>

        <div className="flex flex-col justify-between gap-2 rounded-lg border bg-card p-3 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <Zap className="h-3.5 w-3.5 text-amber-500" />
              {t('admin:templateDns.enableFakeIp')}
            </span>
            <Switch
              checked={fakeIp}
              onCheckedChange={(checked) => update({ fakeIp: checked })}
            />
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {t('admin:templateDns.enableFakeIpDesc')}
          </p>
        </div>

        <div className="flex flex-col justify-between gap-2 rounded-lg border bg-card p-3 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-blue-500" />
              {t('admin:templateDns.enableIpv6')}
            </span>
            <Switch
              checked={ipv6}
              onCheckedChange={(checked) => update({ ipv6: checked })}
            />
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {t('admin:templateDns.enableIpv6Desc')}
          </p>
        </div>
      </div>

      {/* 国内直连 DNS 管理 */}
      <div className="space-y-3 rounded-lg border bg-card/60 p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-xs font-semibold text-foreground">{t('admin:templateDns.directDnsTitle')}</Label>
            <p className="text-[11px] text-muted-foreground">
              {t('admin:templateDns.directDnsDesc', { count: directDns.length })}
            </p>
          </div>
        </div>

        {/* 预设快捷添加 */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground">{t('admin:templateDns.commonPresets')}</span>
          {DIRECT_PRESETS.map((preset) => (
            <Button
              key={preset.value}
              type="button"
              variant="outline"
              size="sm"
              className="h-6 px-2 text-[11px] hover:border-primary/50 hover:bg-primary/5"
              onClick={() => addDirect(preset.value)}
              disabled={directDns.includes(preset.value)}
            >
              + {preset.label}
            </Button>
          ))}
        </div>

        {/* 徽章列表 */}
        <div className="flex min-h-[42px] flex-wrap items-center gap-1.5 rounded-md border border-dashed bg-background/50 p-2">
          {directDns.length === 0 ? (
            <span className="text-xs text-muted-foreground/70">{t('admin:templateDns.emptyDirect')}</span>
          ) : (
            directDns.map((item, index) => (
              <Badge
                key={`${item}-${index}`}
                variant="secondary"
                className="flex items-center gap-1 py-1 pl-2.5 pr-1.5 font-mono text-xs"
              >
                <span className="max-w-[280px] truncate" title={item}>
                  {item}
                </span>
                <button
                  type="button"
                  onClick={() => removeDirect(index)}
                  className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label={t('admin:templateDns.removeAria')}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))
          )}
        </div>

        {/* 自定义添加 */}
        <div className="flex items-center gap-2">
          <Input
            value={directInput}
            onChange={(e) => setDirectInput(e.target.value)}
            onKeyDown={handleDirectKeyDown}
            placeholder={t('admin:templateDns.directPlaceholder')}
            className="h-8 text-xs font-mono"
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-8 shrink-0 gap-1 text-xs"
            onClick={() => addDirect(directInput)}
            disabled={!directInput.trim()}
          >
            <Plus className="h-3.5 w-3.5" />
            {t('admin:templateDns.add')}
          </Button>
        </div>
      </div>

      {/* 远程代理 DNS 管理 */}
      <div className="space-y-3 rounded-lg border bg-card/60 p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-xs font-semibold text-foreground">{t('admin:templateDns.proxyDnsTitle')}</Label>
            <p className="text-[11px] text-muted-foreground">
              {t('admin:templateDns.proxyDnsDesc', { count: proxyDns.length })}
            </p>
          </div>
        </div>

        {/* 预设快捷添加 */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground">{t('admin:templateDns.commonPresets')}</span>
          {PROXY_PRESETS.map((preset) => (
            <Button
              key={preset.value}
              type="button"
              variant="outline"
              size="sm"
              className="h-6 px-2 text-[11px] hover:border-primary/50 hover:bg-primary/5"
              onClick={() => addProxy(preset.value)}
              disabled={proxyDns.includes(preset.value)}
            >
              + {preset.label}
            </Button>
          ))}
        </div>

        {/* 徽章列表 */}
        <div className="flex min-h-[42px] flex-wrap items-center gap-1.5 rounded-md border border-dashed bg-background/50 p-2">
          {proxyDns.length === 0 ? (
            <span className="text-xs text-muted-foreground/70">{t('admin:templateDns.emptyProxy')}</span>
          ) : (
            proxyDns.map((item, index) => (
              <Badge
                key={`${item}-${index}`}
                variant="secondary"
                className="flex items-center gap-1 py-1 pl-2.5 pr-1.5 font-mono text-xs"
              >
                <span className="max-w-[280px] truncate" title={item}>
                  {item}
                </span>
                <button
                  type="button"
                  onClick={() => removeProxy(index)}
                  className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label={t('admin:templateDns.removeAria')}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))
          )}
        </div>

        {/* 自定义添加 */}
        <div className="flex items-center gap-2">
          <Input
            value={proxyInput}
            onChange={(e) => setProxyInput(e.target.value)}
            onKeyDown={handleProxyKeyDown}
            placeholder={t('admin:templateDns.proxyPlaceholder')}
            className="h-8 text-xs font-mono"
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-8 shrink-0 gap-1 text-xs"
            onClick={() => addProxy(proxyInput)}
            disabled={!proxyInput.trim()}
          >
            <Plus className="h-3.5 w-3.5" />
            {t('admin:templateDns.add')}
          </Button>
        </div>
      </div>
    </div>
  );
}
