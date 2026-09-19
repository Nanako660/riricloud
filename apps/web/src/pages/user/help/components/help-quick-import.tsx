import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CopyButton } from '@/components/shared/copy-button';
import { CheckCircle2, Download, Rocket } from 'lucide-react';
import { toast } from 'sonner';
import type { UserSubscriptionVariables } from '../use-help-articles';

interface HelpQuickImportProps {
  clientName?: string | null;
  platform: string;
  variables: UserSubscriptionVariables;
}

export function HelpQuickImport({ clientName, platform, variables }: HelpQuickImportProps) {
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
    toast.info(`正在尝试唤起 ${clientLabel}，若未自动弹出请手动复制链接导入`);
    window.location.href = importUrl;
  };

  return (
    <Card className="border-primary/30 bg-primary/[0.03] shadow-xs my-4">
      <CardContent className="p-4 sm:p-5 space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Rocket className="size-4" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm sm:text-base text-foreground">快速快捷配置</span>
                <Badge variant="outline" className="text-[11px] font-normal border-primary/40 text-primary">
                  已填入专属凭据
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                支持一键自动唤起软件并下载节点，零基础一键上手
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {importUrl ? (
              <Button
                size="sm"
                className="gap-1.5 shadow-xs font-semibold"
                onClick={handleOneClickImport}
              >
                <Download className="size-3.5" />
                <span>一键导入到 {clientLabel}</span>
              </Button>
            ) : null}
            <CopyButton
              value={variables.subUrl}
              label="复制专属订阅"
              className="h-8 gap-1.5 px-3 text-xs"
            />
          </div>
        </div>

        <div className="relative flex items-center rounded-lg border border-border/80 bg-background/80 px-3 py-2 text-xs font-mono text-muted-foreground shadow-2xs">
          <span className="truncate flex-1 select-all pr-8" title={variables.subUrl}>
            {variables.subUrl}
          </span>
          <div className="absolute right-2">
            <CopyButton value={variables.subUrl} className="h-6 w-6" />
          </div>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0" />
          <span>该链接包含您的加密连接密钥，切勿分享给他人，支持多客户端自动协商兼容</span>
        </div>
      </CardContent>
    </Card>
  );
}
