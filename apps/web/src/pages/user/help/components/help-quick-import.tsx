import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, CheckCircle2, Copy, Download, Rocket } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
    <Card className="border-primary/25 bg-primary/[0.02] shadow-xs my-4 overflow-hidden">
      <CardContent className="p-4 sm:p-5 space-y-3.5">
        {/* 顶部标题与一键唤起主操作 */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary mt-0.5">
              <Rocket className="size-4" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm sm:text-base text-foreground">
                  {t('user:help.quickImport.title')}
                </span>
                <Badge variant="outline" className="text-[10px] font-normal border-primary/40 text-primary py-0 h-4">
                  {t('user:help.quickImport.badge')}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t('user:help.quickImport.desc')}
              </p>
            </div>
          </div>

          {importUrl ? (
            <Button
              size="sm"
              className="gap-1.5 shadow-xs font-medium text-xs self-start sm:self-auto shrink-0"
              onClick={handleOneClickImport}
            >
              <Download className="size-3.5" />
              <span>{t('user:help.quickImport.oneClickBtn', { client: clientLabel })}</span>
            </Button>
          ) : null}
        </div>

        {/* 专属订阅 URL 单行胶囊与独立复制按钮 */}
        <div className="flex items-center gap-2 rounded-lg border border-border/80 bg-background/80 p-1.5 pl-3 shadow-2xs">
          <span className="text-xs font-mono text-muted-foreground truncate flex-1 select-all" title={variables.subUrl}>
            {variables.subUrl}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCopy}
            className="h-7 px-2.5 text-xs gap-1.5 shrink-0"
          >
            {copied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
            <span>{copied ? t('common:actions.copied') : t('user:help.quickImport.copySub')}</span>
          </Button>
        </div>

        {/* 安全防泄露提示 */}
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0" />
          <span>{t('user:help.quickImport.securityTip')}</span>
        </div>
      </CardContent>
    </Card>
  );
}
