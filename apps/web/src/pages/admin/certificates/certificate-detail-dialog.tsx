import * as React from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { CopyButton } from '@/components/shared/copy-button';
import { ResponsiveDialog, ResponsiveDialogContent } from '@/components/shared/responsive-dialog';
import { useCertificateDetail } from './use-certificates';

const statusLabels = {
  VALID: '有效',
  EXPIRING: '即将到期',
  EXPIRED: '已过期',
  NOT_YET_VALID: '尚未生效'
} as const;

function formatDate(value: string | Date) {
  return new Date(value).toLocaleDateString('zh-CN');
}

export function CertificateDetailDialog({ open, onOpenChange, certificateId }: { open: boolean; onOpenChange: (open: boolean) => void; certificateId: string | null }) {
  const detail = useCertificateDetail(certificateId, open);
  const [showKey, setShowKey] = React.useState(false);

  React.useEffect(() => {
    if (!open) setShowKey(false);
  }, [open]);

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent size="wide">
        <DialogHeader>
          <DialogTitle>{detail.data?.name ?? '证书详情'}</DialogTitle>
          <DialogDescription>查看证书元数据与已保存的 PEM 内容。</DialogDescription>
        </DialogHeader>
        {detail.isPending && <p className="text-sm text-muted-foreground">加载中…</p>}
        {detail.isError && <p className="text-sm text-destructive">证书详情加载失败，请稍后重试。</p>}
        {detail.data && <div className="space-y-4">
          <div className="grid gap-2 rounded-md border bg-muted/20 p-3 text-sm sm:grid-cols-2">
            <span>状态：{statusLabels[detail.data.status]}</span>
            <span>关联线路：{detail.data.lineCount}</span>
            <span>签发者：{detail.data.issuer}</span>
            <span>序列号：{detail.data.serialNumber}</span>
            <span>生效：{formatDate(detail.data.validFrom)}</span>
            <span>到期：{formatDate(detail.data.validTo)}</span>
            <span className="sm:col-span-2">SAN：{detail.data.sans.join('、')}</span>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2"><span className="text-sm font-medium">证书 PEM</span><CopyButton value={detail.data.certificatePem} /></div>
            <Textarea readOnly value={detail.data.certificatePem} className="min-h-44 font-mono text-xs" spellCheck={false} />
          </div>
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium">私钥 PEM</span>
              <div className="flex items-center gap-2">
                {showKey && <CopyButton value={detail.data.privateKeyPem} />}
                <Button type="button" variant="outline" size="sm" onClick={() => setShowKey((value) => !value)}>{showKey ? <EyeOff /> : <Eye />} {showKey ? '隐藏私钥' : '显示私钥'}</Button>
              </div>
            </div>
            <Textarea readOnly value={showKey ? detail.data.privateKeyPem : '私钥已隐藏'} className="min-h-36 font-mono text-xs" spellCheck={false} />
          </div>
        </div>}
        <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>关闭</Button></DialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
