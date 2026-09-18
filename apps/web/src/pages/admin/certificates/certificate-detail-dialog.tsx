import * as React from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { CopyButton } from '@/components/shared/copy-button';
import { ResponsiveDialog, ResponsiveDialogContent } from '@/components/shared/responsive-dialog';
import { formatDate } from '@/lib/utils';
import { useCertificateDetail, type ApiCertificate } from './use-certificates';

export function CertificateDetailDialog({ open, onOpenChange, certificateId }: { open: boolean; onOpenChange: (open: boolean) => void; certificateId: string | null }) {
  const { t } = useTranslation(['admin', 'common']);
  const detail = useCertificateDetail(certificateId, open);
  const [showKey, setShowKey] = React.useState(false);

  const statusLabels: Record<ApiCertificate['status'], string> = {
    VALID: t('admin:certificates.statusValid'),
    EXPIRING: t('admin:certificates.statusExpiring'),
    EXPIRED: t('admin:certificates.statusExpired'),
    NOT_YET_VALID: t('admin:certificates.statusNotYetValid')
  };

  React.useEffect(() => {
    if (!open) setShowKey(false);
  }, [open]);

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent size="wide">
        <DialogHeader>
          <DialogTitle>{detail.data?.name ?? t('admin:certificates.certDetail')}</DialogTitle>
          <DialogDescription>{t('admin:certificates.detailDesc')}</DialogDescription>
        </DialogHeader>
        {detail.isPending && <p className="text-sm text-muted-foreground">{t('common:actions.loading')}</p>}
        {detail.isError && <p className="text-sm text-destructive">{t('admin:certificates.loadFailed')}</p>}
        {detail.data && <div className="space-y-4">
          <div className="grid gap-2 rounded-md border bg-muted/20 p-3 text-sm sm:grid-cols-2">
            <span>{t('admin:certificates.labelStatus')}{statusLabels[detail.data.status]}</span>
            <span>{t('admin:certificates.labelLines')}{detail.data.lineCount}</span>
            <span>{t('admin:certificates.labelIssuer')}{detail.data.issuer}</span>
            <span>{t('admin:certificates.labelSerial')}{detail.data.serialNumber}</span>
            <span>{t('admin:certificates.labelValidFrom')}{formatDate(detail.data.validFrom)}</span>
            <span>{t('admin:certificates.labelValidTo')}{formatDate(detail.data.validTo)}</span>
            <span className="sm:col-span-2">{t('admin:certificates.labelSans')}{detail.data.sans.join(', ')}</span>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2"><span className="text-sm font-medium">{t('admin:certificates.labelCertPem')}</span><CopyButton value={detail.data.certificatePem} /></div>
            <Textarea readOnly value={detail.data.certificatePem} className="min-h-44 font-mono text-xs" spellCheck={false} />
          </div>
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium">{t('admin:certificates.labelKeyPem')}</span>
              <div className="flex items-center gap-2">
                {showKey && <CopyButton value={detail.data.privateKeyPem} />}
                <Button type="button" variant="outline" size="sm" onClick={() => setShowKey((value) => !value)}>{showKey ? <EyeOff /> : <Eye />} {showKey ? t('admin:certificates.hideKey') : t('admin:certificates.showKey')}</Button>
              </div>
            </div>
            <Textarea readOnly value={showKey ? detail.data.privateKeyPem : t('admin:certificates.keyHidden')} className="min-h-36 font-mono text-xs" spellCheck={false} />
          </div>
        </div>}
        <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('common:actions.close')}</Button></DialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
