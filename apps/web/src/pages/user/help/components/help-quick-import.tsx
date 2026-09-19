import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Copy, Download, Rocket } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
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
    <div className="my-5 rounded-lg border border-border/70 bg-muted/20 p-3 sm:p-3.5 transition-colors">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* 左侧：微型说明与一键导入 */}
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

        {/* 右侧：专属订阅胶囊与操作 */}
        <div className="flex items-center gap-2 self-stretch sm:self-auto">
          {importUrl ? (
            <Button
              size="sm"
              variant="default"
              className="h-7 px-2.5 text-xs gap-1 font-medium shrink-0"
              onClick={handleOneClickImport}
            >
              <Download className="size-3" />
              <span>{t('user:help.quickImport.oneClickBtn', { client: clientLabel })}</span>
            </Button>
          ) : null}

          <TooltipProvider>
            <div className="flex items-center gap-1 rounded-md border border-border/60 bg-background/80 px-2 py-0.5 max-w-[200px] sm:max-w-[240px]">
              <span className="text-[11px] font-mono text-muted-foreground truncate select-all">
                {variables.subUrl}
              </span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={handleCopy}
                    className="size-5 shrink-0 hover:bg-muted"
                  >
                    {copied ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3 text-muted-foreground" />}
                    <span className="sr-only">{t('user:help.quickImport.copySub')}</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p className="text-xs">{copied ? t('common:actions.copied') : t('user:help.quickImport.copySub')}</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
        </div>
      </div>
    </div>
  );
}
