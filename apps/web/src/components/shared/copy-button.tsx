import * as React from 'react';
import { Check, Copy } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface CopyButtonProps {
  value: string;
  className?: string;
  label?: string;
}

// 一键复制按钮（订阅链接/安装命令复用）
export function CopyButton({ value, className, label }: CopyButtonProps) {
  const { t } = useTranslation('common');
  const [copied, setCopied] = React.useState(false);

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
    <Button type="button" variant="outline" size="sm" className={cn('gap-1.5', className)} onClick={onCopy}>
      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      {copied ? t('actions.copied') : (label ?? t('actions.copy'))}
    </Button>
  );
}
