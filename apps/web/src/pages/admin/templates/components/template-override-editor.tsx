import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { yaml } from '@codemirror/lang-yaml';
import { json } from '@codemirror/lang-json';
import {
  Code2,
  Sparkles,
  RotateCcw,
  Trash2,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { TemplateCodeEditor } from './template-code-editor';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
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

interface TemplateOverrideEditorProps {
  yamlValue: string;
  jsonValue: string;
  onYamlChange: (value: string) => void;
  onJsonChange: (value: string) => void;
  yamlError?: string;
  jsonError?: string;
}

const DEFAULT_CLASH_YAML = `mixed-port: 7890
allow-lan: false
mode: rule
log-level: info
ipv6: false
tun:
  enable: true
  stack: mixed
  dns-hijack:
    - 'any:53'
  auto-route: true
  auto-detect-interface: true
profile:
  store-selected: true
  store-fake-ip: true`;

const DEFAULT_SINGBOX_JSON = JSON.stringify({
  log: {
    level: "info"
  },
  experimental: {
    clash_api: {
      external_controller: "127.0.0.1:9090",
      secret: ""
    }
  }
}, null, 2);

interface Snippet {
  id: string;
  title: string;
  description: string;
  payload: string | Record<string, unknown>;
}

function isObject(item: unknown): item is Record<string, unknown> {
  return !!item && typeof item === 'object' && !Array.isArray(item);
}

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const output = { ...target };
  for (const key of Object.keys(source)) {
    if (isObject(source[key])) {
      if (key in target && isObject(target[key])) {
        output[key] = deepMerge(target[key] as Record<string, unknown>, source[key] as Record<string, unknown>);
      } else {
        output[key] = source[key];
      }
    } else if (Array.isArray(source[key])) {
      if (key in target && Array.isArray(target[key])) {
        // 合并数组元素并去重
        const targetArr = target[key] as unknown[];
        const sourceArr = source[key] as unknown[];
        const combined = [...targetArr];
        for (const item of sourceArr) {
          const exists = combined.some((c) => JSON.stringify(c) === JSON.stringify(item));
          if (!exists) combined.push(item);
        }
        output[key] = combined;
      } else {
        output[key] = source[key];
      }
    } else {
      output[key] = source[key];
    }
  }
  return output;
}

export function TemplateOverrideEditor({
  yamlValue,
  jsonValue,
  onYamlChange,
  onJsonChange,
  yamlError,
  jsonError
}: TemplateOverrideEditorProps) {
  const { t } = useTranslation(['admin', 'common']);
  const [activeClient, setActiveClient] = useState<'clash' | 'singbox'>('clash');

  const clashSnippets = useMemo<Snippet[]>(
    () => [
      {
        id: 'tun',
        title: t('admin:templateOverride.snippets.clashTunTitle'),
        description: t('admin:templateOverride.snippets.clashTunDesc'),
        payload: `tun:
  enable: true
  stack: mixed
  dns-hijack:
    - 'any:53'
  auto-route: true
  auto-detect-interface: true`
      },
      {
        id: 'profile',
        title: t('admin:templateOverride.snippets.clashProfileTitle'),
        description: t('admin:templateOverride.snippets.clashProfileDesc'),
        payload: `profile:
  store-selected: true
  store-fake-ip: true`
      },
      {
        id: 'controller',
        title: t('admin:templateOverride.snippets.clashControllerTitle'),
        description: t('admin:templateOverride.snippets.clashControllerDesc'),
        payload: `external-controller: 127.0.0.1:9090\nsecret: ''`
      },
      {
        id: 'general',
        title: t('admin:templateOverride.snippets.clashGeneralTitle'),
        description: t('admin:templateOverride.snippets.clashGeneralDesc'),
        payload: `mixed-port: 7890\nallow-lan: false\nmode: rule\nlog-level: info`
      }
    ],
    [t]
  );

  const singboxSnippets = useMemo<Snippet[]>(
    () => [
      {
        id: 'clash_api',
        title: t('admin:templateOverride.snippets.singboxClashApiTitle'),
        description: t('admin:templateOverride.snippets.singboxClashApiDesc'),
        payload: {
          experimental: {
            clash_api: {
              external_controller: '127.0.0.1:9090',
              secret: ''
            }
          }
        }
      },
      {
        id: 'mixed_inbound',
        title: t('admin:templateOverride.snippets.singboxMixedInboundTitle'),
        description: t('admin:templateOverride.snippets.singboxMixedInboundDesc'),
        payload: {
          inbounds: [
            {
              type: 'mixed',
              tag: 'mixed-in',
              listen: '127.0.0.1',
              listen_port: 7890
            }
          ]
        }
      },
      {
        id: 'log',
        title: t('admin:templateOverride.snippets.singboxLogTitle'),
        description: t('admin:templateOverride.snippets.singboxLogDesc'),
        payload: {
          log: {
            level: 'info',
            timestamp: true
          }
        }
      },
      {
        id: 'ntp',
        title: t('admin:templateOverride.snippets.singboxNtpTitle'),
        description: t('admin:templateOverride.snippets.singboxNtpDesc'),
        payload: {
          ntp: {
            enabled: true,
            server: 'time.apple.com',
            interval: '30m'
          }
        }
      }
    ],
    [t]
  );

  // 本地快速语法状态判定
  const syntaxStatus = useMemo(() => {
    if (activeClient === 'clash') {
      if (!yamlValue.trim()) return { valid: true, message: t('admin:templateOverride.emptyConfig') };
      // 检查制表符等基础 YAML 禁忌
      if (/\t/.test(yamlValue)) {
        return { valid: false, message: t('admin:templateOverride.yamlTabWarning') };
      }
      if (yamlError) return { valid: false, message: yamlError };
      return { valid: true, message: t('admin:templateOverride.yamlValid') };
    } else {
      if (!jsonValue.trim()) return { valid: true, message: t('admin:templateOverride.emptyConfig') };
      try {
        const parsed = JSON.parse(jsonValue);
        if (!isObject(parsed)) {
          return { valid: false, message: t('admin:templateOverride.jsonMustBeObject') };
        }
        return { valid: true, message: t('admin:templateOverride.jsonValid') };
      } catch (err) {
        return { valid: false, message: (err as Error).message || t('admin:templateOverride.jsonSyntaxError') };
      }
    }
  }, [activeClient, yamlValue, jsonValue, yamlError, t]);

  // 注入 Clash YAML 片段
  const injectClashSnippet = (snippet: Snippet) => {
    const rawSnippet = typeof snippet.payload === 'string' ? snippet.payload.trim() : '';
    if (!rawSnippet) return;

    if (!yamlValue.trim()) {
      onYamlChange(rawSnippet);
      return;
    }

    // 检查 snippet 的顶层 key 是否已存在
    const firstLineKeyMatch = rawSnippet.match(/^([a-zA-Z0-9_-]+):/);
    if (firstLineKeyMatch) {
      const topKey = firstLineKeyMatch[1];
      const keyRegex = new RegExp(`(^|\\n)${topKey}:`, 'm');
      if (keyRegex.test(yamlValue)) {
        // 如果顶层 key 已存在，在末尾注释提示或替换
        onYamlChange(`${yamlValue.trimEnd()}\n\n${t('admin:templateOverride.overrideNotice', { key: topKey })}\n${rawSnippet}`);
        return;
      }
    }

    onYamlChange(`${yamlValue.trimEnd()}\n\n${rawSnippet}`);
  };

  // 注入 Sing-box JSON 片段（智能 deepMerge）
  const injectSingboxSnippet = (snippet: Snippet) => {
    const snippetObj = typeof snippet.payload === 'object' ? snippet.payload : {};
    if (!jsonValue.trim()) {
      onJsonChange(JSON.stringify(snippetObj, null, 2));
      return;
    }

    try {
      const currentObj = JSON.parse(jsonValue);
      if (isObject(currentObj)) {
        const merged = deepMerge(currentObj, snippetObj as Record<string, unknown>);
        onJsonChange(JSON.stringify(merged, null, 2));
        return;
      }
    } catch {
      // 语法错误则作为新对象处理
    }

    onJsonChange(JSON.stringify(snippetObj, null, 2));
  };

  const handleReset = () => {
    if (activeClient === 'clash') {
      onYamlChange(DEFAULT_CLASH_YAML);
    } else {
      onJsonChange(DEFAULT_SINGBOX_JSON);
    }
  };

  const handleClear = () => {
    if (activeClient === 'clash') {
      onYamlChange('');
    } else {
      onJsonChange('{}');
    }
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-hidden">
      {/* 顶部工具栏 */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card/60 p-2.5 shadow-sm">
        {/* 客户端切换 Tabs */}
        <div className="flex items-center gap-1.5 rounded-md bg-muted p-1">
          <button
            type="button"
            onClick={() => setActiveClient('clash')}
            className={cn(
              'flex items-center gap-1.5 rounded-sm px-2.5 sm:px-3 py-1 text-xs font-medium transition-colors',
              activeClient === 'clash'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Code2 className="h-3.5 w-3.5 text-amber-500" />
            {t('admin:templateOverride.clashTab')}
          </button>
          <button
            type="button"
            onClick={() => setActiveClient('singbox')}
            className={cn(
              'flex items-center gap-1.5 rounded-sm px-2.5 sm:px-3 py-1 text-xs font-medium transition-colors',
              activeClient === 'singbox'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Code2 className="h-3.5 w-3.5 text-blue-500" />
            {t('admin:templateOverride.singboxTab')}
          </button>
        </div>

        {/* 语法状态与右侧操作 */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {/* 实时语法状态徽章 */}
          <Badge
            variant={syntaxStatus.valid ? 'outline' : 'destructive'}
            className="flex items-center gap-1 py-0.5 text-[11px]"
          >
            {syntaxStatus.valid ? (
              <CheckCircle2 className="h-3 w-3 text-emerald-500" />
            ) : (
              <AlertCircle className="h-3 w-3" />
            )}
            <span>{syntaxStatus.valid ? t('admin:templateOverride.statusValid') : t('admin:templateOverride.statusError')}</span>
          </Badge>

          {/* 常用配置片段注入 */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
                <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                {t('admin:templateOverride.snippetsMenu')}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel className="text-xs">
                {activeClient === 'clash' ? t('admin:templateOverride.clashSnippetsLabel') : t('admin:templateOverride.singboxSnippetsLabel')}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {(activeClient === 'clash' ? clashSnippets : singboxSnippets).map((item) => (
                <DropdownMenuItem
                  key={item.id}
                  onClick={() =>
                    activeClient === 'clash'
                      ? injectClashSnippet(item)
                      : injectSingboxSnippet(item)
                  }
                  className="flex flex-col items-start gap-0.5 py-1.5 cursor-pointer"
                >
                  <span className="font-medium text-xs text-foreground">{item.title}</span>
                  <span className="text-[10px] text-muted-foreground line-clamp-1">
                    {item.description}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* 重置为示例 */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            onClick={handleReset}
            title={t('admin:templateOverride.resetTitle')}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {t('admin:templateOverride.reset')}
          </Button>

          {/* 清空 */}
          <IconButton
            type="button"
            variant="ghost"
            size="icon-xs"
            className="text-muted-foreground hover:text-destructive"
            onClick={handleClear}
            aria-label={t('admin:templateOverride.clearTitle')}
          >
            <Trash2 className="size-4" />
          </IconButton>
        </div>
      </div>

      {/* 说明文案条 */}
      <div className="text-[11px] text-muted-foreground">
        {activeClient === 'clash' ? t('admin:templateOverride.clashNotice') : t('admin:templateOverride.singboxNotice')}
      </div>

      {/* 全高全宽代码编辑器 */}
      <div className="min-h-0 min-w-0 flex-1 overflow-hidden rounded-md border bg-background shadow-sm">
        {activeClient === 'clash' ? (
          <TemplateCodeEditor
            value={yamlValue}
            height="100%"
            className="h-full"
            extensions={[yaml()]}
            basicSetup={{ lineNumbers: true, foldGutter: true }}
            onChange={onYamlChange}
          />
        ) : (
          <TemplateCodeEditor
            value={jsonValue}
            height="100%"
            className="h-full"
            extensions={[json()]}
            basicSetup={{ lineNumbers: true, foldGutter: true }}
            onChange={onJsonChange}
          />
        )}
      </div>

      {/* 底部语法诊断卡片 */}
      {(!syntaxStatus.valid || (activeClient === 'clash' ? yamlError : jsonError)) && (
        <div className="shrink-0 rounded-lg border border-destructive/30 bg-destructive/5 p-3 shadow-sm">
          <div className="flex items-center justify-between gap-2 pb-1.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0 text-destructive animate-pulse" />
              <span>{activeClient === 'clash' ? t('admin:templateOverride.clashSyntaxErrorTitle') : t('admin:templateOverride.singboxSyntaxErrorTitle')}</span>
            </div>
            <span className="text-[10px] text-muted-foreground">
              {t('admin:templateOverride.checkSyntaxSubtitle')}
            </span>
          </div>
          <div className="overflow-x-auto rounded-md bg-zinc-950/90 dark:bg-zinc-900/90 px-3 py-2 text-red-400 dark:text-red-300 font-mono text-[11px] leading-relaxed select-text shadow-inner">
            <div className="flex items-start gap-2">
              <span className="shrink-0 font-bold select-none text-red-500/80">&gt;</span>
              <span className="break-all">{(activeClient === 'clash' ? yamlError : jsonError) || syntaxStatus.message}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
