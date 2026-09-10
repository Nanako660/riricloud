import { useEffect, useMemo, useState } from 'react';
import { json } from '@codemirror/lang-json';
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
  const [source, setSource] = useState(() => JSON.stringify(template, null, 2));
  const [internalError, setInternalError] = useState('');

  // 外部 template 变化时，如果在无语法错误状态下则同步更新展示
  useEffect(() => {
    try {
      const currentParsed = JSON.parse(source);
      // 如果当前编辑器内的内容和传入的 template 深度等价，则不触发二次覆盖
      if (JSON.stringify(currentParsed) === JSON.stringify(template)) return;
    } catch {
      // 当前处于编辑错误状态，保护用户正在编辑的内容不被外部重置
      return;
    }
    setSource(JSON.stringify(template, null, 2));
    setInternalError('');
  }, [template]); // eslint-disable-line react-hooks/exhaustive-deps

  // 本地语法与结构实时状态
  const status = useMemo(() => {
    if (!source.trim()) {
      return { valid: false, message: '源文件内容不能为空' };
    }
    try {
      const parsed = JSON.parse(source);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { valid: false, message: '根节点必须是 JSON 对象' };
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
      return { valid: true, message: 'JSON 格式合法且结构完整' };
    } catch (err) {
      return { valid: false, message: (err as Error).message || 'JSON 语法错误' };
    }
  }, [source]);

  const handleSourceChange = (nextSource: string) => {
    setSource(nextSource);
    try {
      const parsed = JSON.parse(nextSource);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('根节点必须是 JSON 对象');
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
      const parsed = JSON.parse(source);
      const pretty = JSON.stringify(parsed, null, 2);
      setSource(pretty);
      setInternalError('');
      toast.success('源文件已美化排版');
    } catch {
      toast.error('当前 JSON 存在语法错误，无法自动格式化');
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(source);
      toast.success('完整模板源码已复制至剪贴板');
    } catch {
      toast.error('复制失败');
    }
  };

  const handleReset = () => {
    setSource(JSON.stringify(template, null, 2));
    setInternalError('');
    toast.info('已还原为当前表单草稿状态');
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-hidden">
      {/* 统一沉浸式顶栏 */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card/60 p-2.5 shadow-sm">
        {/* 左侧标识 */}
        <div className="flex items-center gap-1.5 rounded-md bg-muted p-1">
          <span className="flex items-center gap-1.5 rounded-sm bg-background px-3 py-1 text-xs font-medium text-foreground shadow-sm">
            <FileCode className="h-3.5 w-3.5 text-primary" />
            模板完整 JSON 源码定义
          </span>
        </div>

        {/* 中间状态徽标与右侧操作 */}
        <div className="flex items-center gap-2">
          <Badge
            variant={status.valid ? 'outline' : 'destructive'}
            className="flex items-center gap-1 py-0.5 text-[11px]"
          >
            {status.valid ? (
              <CheckCircle2 className="h-3 w-3 text-emerald-500" />
            ) : (
              <AlertCircle className="h-3 w-3" />
            )}
            <span className="max-w-[240px] truncate" title={status.message}>
              {status.message}
            </span>
          </Badge>

          {/* 美化排版 */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            onClick={handleFormat}
            disabled={!status.valid}
            title="美化排版 JSON"
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
              title="使用当前源文件拉起客户端配置渲染与 Sing-box 内核校验"
            >
              <Eye className="h-3.5 w-3.5" />
              快速渲染与校验
            </Button>
          )}
        </div>
      </div>

      {/* 说明文案条 */}
      <div className="text-[11px] text-muted-foreground">
        此处为订阅模板的完整单一源文档（包含策略组、分流规则、DNS 与注入配置）。合法的修改将
        <strong>即时双向同步</strong> 至前序各分步 Tab；语法错误时将自动隔离保护，防止脏数据污染。
      </div>

      {/* 全高全宽 CodeMirror 编辑器 */}
      <div
        className={cn(
          'min-h-0 min-w-0 flex-1 overflow-hidden rounded-md border bg-background shadow-sm',
          !status.valid && 'border-destructive/60'
        )}
      >
        <TemplateCodeEditor
          value={source}
          height="100%"
          className="h-full"
          extensions={[json()]}
          basicSetup={{ lineNumbers: true, foldGutter: true }}
          onChange={handleSourceChange}
        />
      </div>

      {/* 底部报错栏 */}
      {internalError && (
        <p className="shrink-0 text-xs text-destructive font-mono">
          语法错误: {internalError}
        </p>
      )}
    </div>
  );
}
