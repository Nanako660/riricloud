import { useState, useMemo } from 'react';
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

const CLASH_SNIPPETS: Snippet[] = [
  {
    id: 'tun',
    title: '开启 TUN 虚拟网卡模式',
    description: '接管系统全部 TCP/UDP 流量，自动路由并劫持 53 端口 DNS',
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
    title: '持久化 Fake-IP 与选择节点',
    description: '客户端重启时记住用户上次选中的代理节点与 Fake-IP 缓存',
    payload: `profile:
  store-selected: true
  store-fake-ip: true`
  },
  {
    id: 'controller',
    title: '配置 Clash API 控制器',
    description: '提供 9090 端口给外部 Dashboard 控制面板连接',
    payload: `external-controller: 127.0.0.1:9090
secret: ''`
  },
  {
    id: 'general',
    title: '基础监听与模式定义',
    description: '设置 mixed-port 7890、禁止局域网访问、规则模式',
    payload: `mixed-port: 7890
allow-lan: false
mode: rule
log-level: info`
  }
];

const SINGBOX_SNIPPETS: Snippet[] = [
  {
    id: 'clash_api',
    title: '配置 Clash API 外部控制器',
    description: '开放 9090 控制端口，便于使用主流 Clash UI 面板连接',
    payload: {
      experimental: {
        clash_api: {
          external_controller: "127.0.0.1:9090",
          secret: ""
        }
      }
    }
  },
  {
    id: 'mixed_inbound',
    title: '添加 Mixed 本地监听入站',
    description: '在 127.0.0.1:7890 监听混合 SOCKS5/HTTP 代理',
    payload: {
      inbounds: [
        {
          type: "mixed",
          tag: "mixed-in",
          listen: "127.0.0.1",
          listen_port: 7890
        }
      ]
    }
  },
  {
    id: 'log',
    title: '设置日志等级与输出',
    description: '将 Sing-box 日志级别设置为 info 并附带时间戳',
    payload: {
      log: {
        level: "info",
        timestamp: true
      }
    }
  },
  {
    id: 'ntp',
    title: '开启 NTP 时间校准服务',
    description: '定期向苹果授时服务器同步系统时间，保障 TLS 证书有效性',
    payload: {
      ntp: {
        enabled: true,
        server: "time.apple.com",
        interval: "30m"
      }
    }
  }
];

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
  const [activeClient, setActiveClient] = useState<'clash' | 'singbox'>('clash');

  // 本地快速语法状态判定
  const syntaxStatus = useMemo(() => {
    if (activeClient === 'clash') {
      if (!yamlValue.trim()) return { valid: true, message: '配置为空' };
      // 检查制表符等基础 YAML 禁忌
      if (/\t/.test(yamlValue)) {
        return { valid: false, message: 'YAML 包含制表符 (Tab)，请使用空格缩进' };
      }
      if (yamlError) return { valid: false, message: yamlError };
      return { valid: true, message: 'YAML 语法有效' };
    } else {
      if (!jsonValue.trim()) return { valid: true, message: '配置为空' };
      try {
        const parsed = JSON.parse(jsonValue);
        if (!isObject(parsed)) {
          return { valid: false, message: '必须是 JSON 对象格式' };
        }
        return { valid: true, message: 'JSON 语法有效' };
      } catch (err) {
        return { valid: false, message: (err as Error).message || 'JSON 语法错误' };
      }
    }
  }, [activeClient, yamlValue, jsonValue, yamlError]);

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
        onYamlChange(`${yamlValue.trimEnd()}\n\n# 提示：覆盖已存在的 ${topKey} 配置片段\n${rawSnippet}`);
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
              'flex items-center gap-1.5 rounded-sm px-3 py-1 text-xs font-medium transition-colors',
              activeClient === 'clash'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Code2 className="h-3.5 w-3.5 text-amber-500" />
            Clash YAML 顶层覆写
          </button>
          <button
            type="button"
            onClick={() => setActiveClient('singbox')}
            className={cn(
              'flex items-center gap-1.5 rounded-sm px-3 py-1 text-xs font-medium transition-colors',
              activeClient === 'singbox'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Code2 className="h-3.5 w-3.5 text-blue-500" />
            Sing-box JSON 顶层覆写
          </button>
        </div>

        {/* 语法状态与右侧操作 */}
        <div className="flex items-center gap-2">
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
            <span className="max-w-[200px] truncate" title={syntaxStatus.message}>
              {syntaxStatus.message}
            </span>
          </Badge>

          {/* 常用配置片段注入 */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
                <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                常用片段
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel className="text-xs">
                {activeClient === 'clash' ? 'Clash YAML 常用片段' : 'Sing-box JSON 常用片段'}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {(activeClient === 'clash' ? CLASH_SNIPPETS : SINGBOX_SNIPPETS).map((item) => (
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
            title="恢复为内置默认模板片段"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            重置
          </Button>

          {/* 清空 */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-destructive"
            onClick={handleClear}
            title="清空当前客户端覆写"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* 说明文案条 */}
      <div className="text-[11px] text-muted-foreground">
        {activeClient === 'clash' ? (
          <span>
            此处的 YAML 对象将与生成的 Clash 配置执行 <strong>深度合并 (deepMerge)</strong>
            ，可用于注入或覆盖 <code className="font-mono text-foreground">mixed-port</code>、
            <code className="font-mono text-foreground">tun</code>、
            <code className="font-mono text-foreground">profile</code>、
            <code className="font-mono text-foreground">mode</code> 等顶层字段。
          </span>
        ) : (
          <span>
            此处的 JSON 对象将与生成的 Sing-box 配置执行 <strong>深度合并 (deepMerge)</strong>
            ，可用于注入或覆盖 <code className="font-mono text-foreground">inbounds</code>、
            <code className="font-mono text-foreground">log</code>、
            <code className="font-mono text-foreground">experimental.clash_api</code> 等全局参数。
          </span>
        )}
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

      {/* 错误提示 */}
      {(activeClient === 'clash' ? yamlError : jsonError) && (
        <p className="shrink-0 text-xs text-destructive">
          {activeClient === 'clash' ? yamlError : jsonError}
        </p>
      )}
    </div>
  );
}
