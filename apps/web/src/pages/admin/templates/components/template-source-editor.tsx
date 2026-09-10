import { useEffect, useMemo, useState } from 'react';
import { json } from '@codemirror/lang-json';
import { yaml } from '@codemirror/lang-yaml';
import YAML from 'yaml';
import {
  FileCode,
  Copy,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Wand2,
  Eye
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { TemplateCodeEditor } from './template-code-editor';
import { type TemplatePayload } from '../use-templates';

interface TemplateSourceEditorProps {
  template: TemplatePayload;
  onChange: (next: TemplatePayload) => void;
  onTestRender?: () => void;
}

export function TemplateSourceEditor({
  template,
  onChange,
  onTestRender
}: TemplateSourceEditorProps) {
  const [lang, setLang] = useState<'json' | 'yaml'>('yaml');
  const [source, setSource] = useState(() => YAML.stringify(template, { indent: 2 }));
  const [internalError, setInternalError] = useState('');

  // 外部 template 变化时，如果在无语法错误状态下则同步更新展示
  useEffect(() => {
    try {
      const currentParsed = lang === 'json' ? JSON.parse(source) : YAML.parse(source);
      // 如果当前编辑器内的内容和传入的 template 深度等价，则不触发二次覆盖
      if (JSON.stringify(currentParsed) === JSON.stringify(template)) return;
    } catch {
      // 当前处于编辑错误状态，保护用户正在编辑的内容不被外部重置
      return;
    }
    if (lang === 'json') {
      setSource(JSON.stringify(template, null, 2));
    } else {
      setSource(YAML.stringify(template, { indent: 2 }));
    }
    setInternalError('');
  }, [template, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  // 本地语法与结构实时状态
  const status = useMemo(() => {
    if (!source.trim()) {
      return { valid: false, message: '源文件内容不能为空' };
    }
    try {
      const parsed = lang === 'json' ? JSON.parse(source) : YAML.parse(source);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { valid: false, message: '根节点必须是对象' };
      }
      if (parsed.proxyGroups && !Array.isArray(parsed.proxyGroups)) {
        return { valid: false, message: 'proxyGroups 必须是数组格式' };
      }
      if (parsed.ruleSets && !Array.isArray(parsed.ruleSets)) {
        return { valid: false, message: 'ruleSets 必须是数组格式' };
      }
      if (parsed.dnsConfig && (typeof parsed.dnsConfig !== 'object' || Array.isArray(parsed.dnsConfig))) {
        return { valid: false, message: 'dnsConfig 必须是对象格式' };
      }
      return { valid: true, message: `${lang.toUpperCase()} 格式合法且结构完整` };
    } catch (err) {
      return { valid: false, message: (err as Error).message || `${lang.toUpperCase()} 语法错误` };
    }
  }, [source, lang]);

  const handleToggleLang = (targetLang: 'json' | 'yaml') => {
    if (targetLang === lang) return;
    try {
      const parsed = lang === 'json' ? JSON.parse(source) : YAML.parse(source);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        toast.error('根节点必须是对象，无法转换');
        return;
      }
      const converted = targetLang === 'json'
        ? JSON.stringify(parsed, null, 2)
        : YAML.stringify(parsed, { indent: 2 });
      setLang(targetLang);
      setSource(converted);
      setInternalError('');
      toast.success(`已切换至 ${targetLang.toUpperCase()} 源码编辑模式`);
    } catch {
      toast.error(`当前 ${lang.toUpperCase()} 存在语法错误，请修复后再切换格式`);
    }
  };

  const handleSourceChange = (nextSource: string) => {
    setSource(nextSource);
    try {
      const parsed = lang === 'json' ? JSON.parse(nextSource) : YAML.parse(nextSource);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('根节点必须是对象');
      }
      setInternalError('');

      // 组装合法的 TemplatePayload
      const nextPayload: TemplatePayload = {
        name: typeof parsed.name === 'string' ? parsed.name : template.name,
        description: typeof parsed.description === 'string' ? parsed.description : template.description,
        proxyGroups: Array.isArray(parsed.proxyGroups) ? parsed.proxyGroups : [],
        ruleSets: Array.isArray(parsed.ruleSets) ? parsed.ruleSets : [],
        dnsConfig: parsed.dnsConfig && typeof parsed.dnsConfig === 'object' && !Array.isArray(parsed.dnsConfig)
          ? parsed.dnsConfig as Record<string, unknown>
          : {},
        customInjectYaml: typeof parsed.customInjectYaml === 'string' ? parsed.customInjectYaml : template.customInjectYaml,
        customInjectJson: typeof parsed.customInjectJson === 'string' ? parsed.customInjectJson : template.customInjectJson,
        isDefault: typeof parsed.isDefault === 'boolean' ? parsed.isDefault : template.isDefault
      };

      // 即时反向回填表单
      onChange(nextPayload);
    } catch (err) {
      setInternalError((err as Error).message || '语法错误');
    }
  };

  const handleFormat = () => {
    try {
      if (lang === 'json') {
        const parsed = JSON.parse(source);
        const pretty = JSON.stringify(parsed, null, 2);
        setSource(pretty);
      } else {
        const parsed = YAML.parse(source);
        const pretty = YAML.stringify(parsed, { indent: 2 });
        setSource(pretty);
      }
      setInternalError('');
      toast.success(`源文件已美化排版 (${lang.toUpperCase()})`);
    } catch {
      toast.error(`当前 ${lang.toUpperCase()} 存在语法错误，无法自动格式化`);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(source);
      toast.success(`完整模板 ${lang.toUpperCase()} 源码已复制至剪贴板`);
    } catch {
      toast.error('复制失败');
    }
  };

  const handleReset = () => {
    if (lang === 'json') {
      setSource(JSON.stringify(template, null, 2));
    } else {
      setSource(YAML.stringify(template, { indent: 2 }));
    }
    setInternalError('');
    toast.info('已还原为当前表单草稿状态');
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-hidden">
      {/* 统一沉浸式顶栏 */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card/60 p-2.5 shadow-sm">
        {/* 左侧语言切换 Tabs */}
        <div className="flex items-center gap-2">
          <Tabs value={lang} onValueChange={(v) => handleToggleLang(v as 'json' | 'yaml')}>
            <TabsList className="h-8">
              <TabsTrigger value="yaml" className="h-7 gap-1.5 px-3 text-xs">
                <FileCode className="h-3.5 w-3.5 text-indigo-500 dark:text-indigo-400" />
                YAML 源码
              </TabsTrigger>
              <TabsTrigger value="json" className="h-7 gap-1.5 px-3 text-xs">
                <FileCode className="h-3.5 w-3.5 text-primary" />
                JSON 源码
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* 中间状态徽标与右侧操作 */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <Badge
            variant={status.valid ? 'outline' : 'destructive'}
            className="flex items-center gap-1 py-0.5 text-[11px]"
          >
            {status.valid ? (
              <CheckCircle2 className="h-3 w-3 text-emerald-500" />
            ) : (
              <AlertCircle className="h-3 w-3" />
            )}
            <span>{status.valid ? '格式正常' : '语法错误'}</span>
          </Badge>

          {/* 美化排版 */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            onClick={handleFormat}
            disabled={!status.valid}
            title={`美化排版 ${lang.toUpperCase()}`}
          >
            <Wand2 className="h-3.5 w-3.5 text-primary" />
            美化
          </Button>

          {/* 复制 */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            onClick={handleCopy}
            title="复制源码"
          >
            <Copy className="h-3.5 w-3.5" />
            复制
          </Button>

          {/* 还原 */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
            onClick={handleReset}
            title="还原为当前草稿"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            还原
          </Button>

          {/* 快速渲染与内核校验测试 */}
          {onTestRender && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-xs text-primary hover:text-primary"
              onClick={onTestRender}
              title="使用当前源文件拉起客户端配置渲染与双内核校验"
            >
              <Eye className="h-3.5 w-3.5" />
              快速渲染与校验
            </Button>
          )}
        </div>
      </div>

      {/* 说明文案条 */}
      <div className="text-[11px] text-muted-foreground">
        此处为订阅模板的单一源文档（支持 JSON / YAML 无损切换）。合法的修改将
        <strong>即时双向同步</strong> 至策略组、分流规则、DNS 与覆写 Tab；语法错误时自动启用隔离保护，防止脏数据污染。
      </div>

      {/* 全高全宽 CodeMirror 编辑器 */}
      <div
        className={cn(
          'min-h-0 min-w-0 flex-1 overflow-hidden rounded-md border bg-background shadow-sm',
          !status.valid && 'border-destructive/60'
        )}
      >
        <TemplateCodeEditor
          key={lang}
          value={source}
          height="100%"
          className="h-full"
          extensions={lang === 'json' ? [json()] : [yaml()]}
          basicSetup={{ lineNumbers: true, foldGutter: true }}
          onChange={handleSourceChange}
        />
      </div>

      {/* 底部语法诊断卡片 */}
      {!status.valid && (
        <div className="shrink-0 rounded-lg border border-destructive/30 bg-destructive/5 p-3 shadow-sm">
          <div className="flex items-center justify-between gap-2 pb-1.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0 text-destructive animate-pulse" />
              <span>{lang.toUpperCase()} 语法诊断错误</span>
            </div>
            <span className="text-[10px] text-muted-foreground">
              已启用安全隔离保护 · 不会同步脏数据
            </span>
          </div>
          <div className="overflow-x-auto rounded-md bg-zinc-950/90 dark:bg-zinc-900/90 px-3 py-2 text-red-400 dark:text-red-300 font-mono text-[11px] leading-relaxed select-text shadow-inner">
            <div className="flex items-start gap-2">
              <span className="shrink-0 font-bold select-none text-red-500/80">&gt;</span>
              <span className="break-all">{internalError || status.message}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
