import { useState } from 'react';
import { ExternalLink, Headphones, Mail, MessageCircle, MessageSquare } from 'lucide-react';
import { type PublicSystemSettings } from '@/lib/public-settings';
import { hasSupportContacts } from '@/lib/support';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/shared/copy-button';


export function SupportDialog({
  settings,
  trigger
}: {
  settings?: Partial<PublicSystemSettings> | null;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  if (!hasSupportContacts(settings)) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm" className="gap-2">
            <Headphones className="size-4" />
            <span>联系客服</span>
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Headphones className="size-5 text-primary" />
            联系客服与技术支持
          </DialogTitle>
          <DialogDescription>
            遇到节点配置、订阅异常或需要咨询，请通过官方支持渠道联系：
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {settings?.supportTelegramUrl?.trim() && (
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-md bg-[#229ED9]/10 text-[#229ED9]">
                  <MessageCircle className="size-5" />
                </div>
                <div>
                  <p className="text-sm font-medium">Telegram 客服 / 群组</p>
                  <p className="text-xs text-muted-foreground">实时交流与问题反馈</p>
                </div>
              </div>
              <Button asChild size="sm" variant="outline">
                <a href={settings.supportTelegramUrl.trim()} target="_blank" rel="noreferrer">
                  前往 <ExternalLink className="size-3.5" />
                </a>
              </Button>
            </div>
          )}

          {settings?.supportDiscordUrl?.trim() && (
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-md bg-[#5865F2]/10 text-[#5865F2]">
                  <MessageSquare className="size-5" />
                </div>
                <div>
                  <p className="text-sm font-medium">Discord 社区</p>
                  <p className="text-xs text-muted-foreground">技术答疑与公告推送</p>
                </div>
              </div>
              <Button asChild size="sm" variant="outline">
                <a href={settings.supportDiscordUrl.trim()} target="_blank" rel="noreferrer">
                  加入 <ExternalLink className="size-3.5" />
                </a>
              </Button>
            </div>
          )}

          {settings?.supportEmail?.trim() && (
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Mail className="size-5" />
                </div>
                <div>
                  <p className="text-sm font-medium">客服邮箱</p>
                  <p className="text-xs text-muted-foreground">{settings.supportEmail.trim()}</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <CopyButton value={settings.supportEmail.trim()} />
                <Button asChild size="sm" variant="outline">
                  <a href={`mailto:${settings.supportEmail.trim()}`}>发送</a>
                </Button>
              </div>
            </div>
          )}

          {settings?.supportCustomUrl?.trim() && (
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-md bg-muted text-foreground">
                  <ExternalLink className="size-5" />
                </div>
                <div>
                  <p className="text-sm font-medium">帮助与支持中心</p>
                  <p className="text-xs text-muted-foreground">工单系统或外部文档</p>
                </div>
              </div>
              <Button asChild size="sm" variant="outline">
                <a href={settings.supportCustomUrl.trim()} target="_blank" rel="noreferrer">
                  访问 <ExternalLink className="size-3.5" />
                </a>
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function SupportContactsInline({
  settings,
  className
}: {
  settings?: Partial<PublicSystemSettings> | null;
  className?: string;
}) {
  if (!hasSupportContacts(settings)) return null;

  return (
    <div className={`flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground ${className ?? ''}`}>
      {settings?.supportTelegramUrl?.trim() && (
        <a
          href={settings.supportTelegramUrl.trim()}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 hover:text-foreground hover:underline underline-offset-4"
        >
          <MessageCircle className="size-3.5" />
          <span>Telegram</span>
        </a>
      )}
      {settings?.supportDiscordUrl?.trim() && (
        <a
          href={settings.supportDiscordUrl.trim()}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 hover:text-foreground hover:underline underline-offset-4"
        >
          <MessageSquare className="size-3.5" />
          <span>Discord</span>
        </a>
      )}
      {settings?.supportEmail?.trim() && (
        <a
          href={`mailto:${settings.supportEmail.trim()}`}
          className="inline-flex items-center gap-1 hover:text-foreground hover:underline underline-offset-4"
        >
          <Mail className="size-3.5" />
          <span>{settings.supportEmail.trim()}</span>
        </a>
      )}
      {settings?.supportCustomUrl?.trim() && (
        <a
          href={settings.supportCustomUrl.trim()}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 hover:text-foreground hover:underline underline-offset-4"
        >
          <ExternalLink className="size-3.5" />
          <span>帮助支持</span>
        </a>
      )}
    </div>
  );
}
