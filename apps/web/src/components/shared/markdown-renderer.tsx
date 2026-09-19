import { isValidElement, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ImageLightbox } from '@/components/shared/image-lightbox';
import { slugify } from '@/lib/slugify';
import {
  AlertCircle,
  AlertTriangle,
  Check,
  Copy,
  ExternalLink,
  Info,
  Lightbulb,
  Rocket,
  ShieldAlert
} from 'lucide-react';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

function CodeCopyButton({ value }: { value: string }) {
  const { t } = useTranslation('common');
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(t('actions.copied'));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t('actions.copyFailed'));
    }
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-6 rounded hover:bg-muted text-muted-foreground hover:text-foreground shrink-0"
            onClick={onCopy}
          >
            {copied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
            <span className="sr-only">{t('actions.copy')}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">
          <p className="text-xs">{copied ? t('actions.copied') : t('actions.copy')}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function getNodeText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(getNodeText).join('');
  }
  if (isValidElement(node) && node.props && (node.props as { children?: ReactNode }).children) {
    return getNodeText((node.props as { children?: ReactNode }).children);
  }
  return '';
}

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  return (
    <div className={`markdown-body space-y-3 text-sm leading-relaxed ${className || ''}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => {
            const text = getNodeText(children);
            const id = slugify(text);
            return (
              <h1 id={id} className="scroll-m-20 text-2xl font-bold tracking-tight text-foreground mt-6 mb-4">
                {children}
              </h1>
            );
          },
          h2: ({ children }) => {
            const text = getNodeText(children);
            const id = slugify(text);
            return (
              <h2
                id={id}
                className="group scroll-m-20 text-xl font-semibold tracking-tight text-foreground mt-6 mb-3 pb-1.5 border-b border-border/50 flex items-center gap-2"
              >
                <span>{children}</span>
              </h2>
            );
          },
          h3: ({ children }) => {
            const text = getNodeText(children);
            const id = slugify(text);
            return (
              <h3 id={id} className="scroll-m-20 text-base font-semibold text-foreground mt-4 mb-2">
                {children}
              </h3>
            );
          },
          h4: ({ children }) => (
            <h4 className="text-sm font-semibold text-foreground mt-3 mb-1">
              {children}
            </h4>
          ),
          p: ({ children }) => (
            <p className="leading-7 text-foreground/90 my-2">{children}</p>
          ),
          ul: ({ children }) => (
            <ul className="my-2 ml-4 list-disc space-y-1 text-foreground/90">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="my-2 ml-4 list-decimal space-y-1 text-foreground/90">{children}</ol>
          ),
          li: ({ children }) => <li className="leading-6">{children}</li>,
          hr: () => <hr className="my-6 border-border/60" />,
          table: ({ children }) => (
            <div className="my-4 w-full overflow-y-auto rounded-lg border border-border">
              <table className="w-full border-collapse text-left text-xs sm:text-sm">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-muted/60 font-medium text-foreground">{children}</thead>,
          tbody: ({ children }) => <tbody className="divide-y divide-border/60">{children}</tbody>,
          tr: ({ children }) => <tr className="hover:bg-muted/30 transition-colors">{children}</tr>,
          th: ({ children }) => <th className="p-2.5 font-semibold text-foreground">{children}</th>,
          td: ({ children }) => <td className="p-2.5 text-foreground/80">{children}</td>,
          blockquote: ({ children }) => {
            const rawText = getNodeText(children).trim();

            const alertTypes = [
              { key: '[!NOTE]', title: '注意 (Note)', icon: Info, border: 'border-sky-500/40 bg-sky-500/[0.06] text-sky-900 dark:text-sky-200' },
              { key: '[!TIP]', title: '提示 (Tip)', icon: Lightbulb, border: 'border-emerald-500/40 bg-emerald-500/[0.06] text-emerald-900 dark:text-emerald-200' },
              { key: '[!IMPORTANT]', title: '重要 (Important)', icon: AlertCircle, border: 'border-indigo-500/40 bg-indigo-500/[0.06] text-indigo-900 dark:text-indigo-200' },
              { key: '[!WARNING]', title: '警告 (Warning)', icon: AlertTriangle, border: 'border-amber-500/40 bg-amber-500/[0.06] text-amber-900 dark:text-amber-200' },
              { key: '[!CAUTION]', title: '危险 (Caution)', icon: ShieldAlert, border: 'border-rose-500/40 bg-rose-500/[0.06] text-rose-900 dark:text-rose-200' }
            ];

            const matched = alertTypes.find((a) => rawText.startsWith(a.key));

            if (matched) {
              const cleanedText = rawText.replace(matched.key, '').trim();
              const IconComponent = matched.icon;

              return (
                <div className={`my-4 rounded-lg border-l-4 p-3.5 shadow-xs ${matched.border}`}>
                  <div className="flex items-center gap-2 font-semibold text-xs mb-1">
                    <IconComponent className="size-4 shrink-0" />
                    <span>{matched.title}</span>
                  </div>
                  <div className="text-xs sm:text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">
                    {cleanedText}
                  </div>
                </div>
              );
            }

            return (
              <blockquote className="my-3 border-l-4 border-primary/40 bg-muted/20 px-4 py-2 italic text-muted-foreground rounded-r">
                {children}
              </blockquote>
            );
          },
          code: ({ className: codeClass, children, ...props }) => {
            const match = /language-(\w+)/.exec(codeClass || '');
            const codeString = String(children).replace(/\n$/, '');
            const isInline = !codeClass && !codeString.includes('\n');

            if (isInline) {
              return (
                <code
                  className="rounded bg-muted/80 px-1.5 py-0.5 font-mono text-xs text-foreground font-medium border border-border/40"
                  {...props}
                >
                  {children}
                </code>
              );
            }

            return (
              <div className="relative group my-3 rounded-lg border border-border bg-muted/40 overflow-hidden font-mono text-xs">
                <div className="flex items-center justify-between px-3 py-1.5 bg-muted/70 border-b border-border/50 text-muted-foreground text-[11px]">
                  <span>{match ? match[1].toUpperCase() : '代码'}</span>
                  <CodeCopyButton value={codeString} />
                </div>
                <pre className="p-3 overflow-x-auto leading-5 text-foreground/90">
                  <code>{children}</code>
                </pre>
              </div>
            );
          },
          a: ({ href, children }) => {
            if (!href) return <span>{children}</span>;

            // 特殊客户端协议唤起链接（如 clash://, shadowrocket:// 等），美化为快捷导入按钮
            if (
              href.startsWith('clash://') ||
              href.startsWith('shadowrocket://') ||
              href.startsWith('sing-box://') ||
              href.startsWith('surge://')
            ) {
              return (
                <a
                  href={href}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-xs hover:bg-primary/90 transition my-1.5 text-decoration-none"
                >
                  <Rocket className="size-3.5 shrink-0" />
                  <span>{children}</span>
                </a>
              );
            }

            const isExternal = href.startsWith('http');
            return (
              <a
                href={href}
                target={isExternal ? '_blank' : undefined}
                rel={isExternal ? 'noopener noreferrer' : undefined}
                className="inline-flex items-center gap-0.5 font-medium text-primary underline underline-offset-4 hover:text-primary/80 transition"
              >
                <span>{children}</span>
                {isExternal && <ExternalLink className="size-3 inline opacity-70 ml-0.5" />}
              </a>
            );
          },
          img: ({ src, alt }) => {
            if (!src) return null;
            return <ImageLightbox src={src} alt={alt} className="my-3 max-w-full" />;
          }
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
