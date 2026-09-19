import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Copy, Download, Rocket } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import type { UserSubscriptionVariables } from '../use-help-articles';

interface HelpQuickImportProps {
  clientName?: string | null;
  platform: string;
  variables: UserSubscriptionVariables;
}

export function HelpQuickImport({ clientName, platform, variables }: HelpQuickImportProps) {
  const { t } = useTranslation(['user', 'common']);
  const [copied, setCopied] = useState(false);

  const normClient = (clientName || '').toLowerCase();
  const normPlatform = platform.toUpperCase();

  // 判定客户端唤起协议
  let importUrl = '';
  let clientLabel = clientName || '客户端';

  if (normClient.includes('clash') || normPlatform === 'WINDOWS' || normPlatform === 'ANDROID') {
    importUrl = `clash://install-config?url=${variables.clashImportUrl}&name=${encodeURIComponent(variables.siteName)}`;
    clientLabel = clientName || 'Clash';
  } else if (normClient.includes('shadowrocket') || normPlatform === 'IOS') {
    importUrl = `shadowrocket://add/sub://${variables.shadowrocketImportUrl}?title=${encodeURIComponent(variables.siteName)}`;
    clientLabel = clientName || 'Shadowrocket';
  } else if (normClient.includes('sing-box') || normClient.includes('singbox')) {
    importUrl = `sing-box://import-remote-profile?url=${variables.singboxImportUrl}#${encodeURIComponent(variables.siteName)}`;
    clientLabel = clientName || 'Sing-box';
  }

  const handleOneClickImport = () => {
    if (!importUrl) return;
    toast.info(t('user:help.quickImport.launchTip', { client: clientLabel, defaultValue: `正在尝试唤起 ${clientLabel}，若未自动弹出请手动复制链接导入` }));
    window.location.href = importUrl;
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(variables.subUrl);
      setCopied(true);
      toast.success(t('user:help.quickImport.copied', { defaultValue: '已复制专属订阅链接' }));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t('common:actions.copyFailed', { defaultValue: '复制失败' }));
    }
  };

  return (
    <div className="my-5 rounded-lg border border-border/70 bg-muted/25 p-3 sm:p-3.5 transition-colors">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* 左侧：说明与客户端标签 */}
        <div className="flex items-center gap-2.5">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Rocket className="size-3.5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <span>{t('user:help.quickImport.title')}</span>
              <span className="text-[10px] font-normal text-muted-foreground hidden sm:inline">
                ({clientLabel})
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground truncate">
              {t('user:help.quickImport.desc')}
            </p>
          </div>
        </div>

        {/* 右侧：纯双按钮操作区（不显示长 URL） */}
        <div className="flex items-center gap-2 self-stretch sm:self-auto shrink-0">
          {importUrl ? (
            <Button
              size="sm"
              variant="default"
              className="h-8 px-3 text-xs gap-1.5 font-medium shadow-2xs"
              onClick={handleOneClickImport}
            >
              <Download className="size-3.5" />
              <span>{t('user:help.quickImport.oneClickBtn', { client: clientLabel })}</span>
            </Button>
          ) : null}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCopy}
            className="h-8 px-3 text-xs gap-1.5 font-medium bg-background hover:bg-muted/60"
          >
            {copied ? (
              <>
                <Check className="size-3.5 text-emerald-500" />
                <span className="text-emerald-600 dark:text-emerald-400 font-normal">{t('common:actions.copied')}</span>
              </>
            ) : (
              <>
                <Copy className="size-3.5 text-muted-foreground" />
                <span>{t('user:help.quickImport.copySub')}</span>
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
