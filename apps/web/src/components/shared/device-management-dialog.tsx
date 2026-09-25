import { useState } from 'react';
import { CopyButton } from '@/components/shared/copy-button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDateTime } from '@/lib/utils';
import type { DeviceManagement } from '@/pages/user/subscription/use-user-subscription';
import { useTranslation } from 'react-i18next';

interface DeviceManagementDialogProps {
  audience: 'admin' | 'user';
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  data?: DeviceManagement;
  isLoading: boolean;
  isError: boolean;
  onKickDevice: (ip: string) => void;
  onKickAllDevices: () => void;
  isKickingDevice: boolean;
  isKickingAll: boolean;
}

const sourceKeys = {
  USER: 'common:deviceManagement.sourceUser',
  PLAN: 'common:deviceManagement.sourcePlan',
  UNLIMITED: 'common:deviceManagement.sourceUnlimited',
  GLOBAL_OFF: 'common:deviceManagement.sourceGlobalOff'
} as const satisfies Record<DeviceManagement['deviceLimitSource'], string>;

export function DeviceManagementDialog({ audience, open, onOpenChange, title, data, isLoading, isError, onKickDevice, onKickAllDevices, isKickingDevice, isKickingAll }: DeviceManagementDialogProps) {
  const { t } = useTranslation(['common']);
  const [confirmKickAll, setConfirmKickAll] = useState(false);
  const source = data && audience === 'admin' ? t(sourceKeys[data.deviceLimitSource]) : '';
  const kickKey = audience === 'user' ? 'common:deviceManagement.userKick' : 'common:deviceManagement.kick';
  const kickAllKey = audience === 'user' ? 'common:deviceManagement.userKickAll' : 'common:deviceManagement.kickAll';
  const kickAllTitleKey = audience === 'user' ? 'common:deviceManagement.userKickAllTitle' : 'common:deviceManagement.kickAllTitle';
  const kickAllDescriptionKey = audience === 'user' ? 'common:deviceManagement.userKickAllDescription' : 'common:deviceManagement.kickAllDescription';
  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent size="wide">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {audience === 'admin' && <DialogDescription>{t('common:deviceManagement.description')}</DialogDescription>}
          </DialogHeader>
          {data && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/20 p-3 text-sm">
              <Badge variant="outline">{t('common:deviceManagement.count')}: {data.onlineDeviceCount}</Badge>
              {audience === 'admin' && <Badge variant="outline">{t('common:deviceManagement.configuredLimit')}: {data.configuredDeviceLimit ?? t('common:deviceManagement.unlimited')}</Badge>}
              <Badge variant={data.effectiveDeviceLimit !== null && data.onlineDeviceCount > data.effectiveDeviceLimit ? 'destructive' : 'secondary'}>
                {t('common:deviceManagement.effectiveLimit')}: {data.effectiveDeviceLimit ?? t('common:deviceManagement.unlimited')}
              </Badge>
              {audience === 'admin' && <span className="text-xs text-muted-foreground">{t('common:deviceManagement.source')}: {source}</span>}
            </div>
          )}
          <div className="max-h-[55vh] space-y-3 overflow-y-auto pr-1">
            {isLoading ? Array.from({ length: 2 }, (_, index) => <Skeleton key={index} className="h-28 w-full rounded-lg" />) : null}
            {isError && <p className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{t('common:status.failed')}</p>}
            {!isLoading && !isError && data?.devices.length === 0 && <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">{t('common:deviceManagement.noDevices')}</p>}
            {data?.devices.map((device) => (
              <section key={device.ip} className="space-y-3 rounded-lg border p-3 sm:p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <code className="break-all text-sm font-semibold">{device.ip}</code>
                      <CopyButton value={device.ip} label={t('common:deviceManagement.ip')} />
                    </div>
                    <p className="text-xs text-muted-foreground">{t('common:deviceManagement.connections', { count: device.connections })}</p>
                    <p className="text-xs text-muted-foreground">{t('common:deviceManagement.lastSeen', { time: formatDateTime(device.lastSeenAt * 1000) })}</p>
                  </div>
                  <Button type="button" size="sm" variant="destructive" disabled={isKickingDevice} onClick={() => onKickDevice(device.ip)}>
                    {t(kickKey)}
                  </Button>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {device.nodes.map((node) => (
                    <div key={node.nodeId + (node.lineId ?? '')} className="rounded-md bg-muted/40 px-3 py-2 text-xs">
                      <p className="font-medium">{t('common:deviceManagement.node')}: {node.nodeName}</p>
                      <p className="mt-1 text-muted-foreground">{t('common:deviceManagement.line')}: {node.lineName ?? t('common:deviceManagement.noLine')} · {t('common:deviceManagement.connections', { count: node.connections })}</p>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('actions.close')}</Button>
            <Button type="button" variant="destructive" disabled={!data?.onlineDeviceCount || isKickingAll} onClick={() => setConfirmKickAll(true)}>
              {isKickingAll ? t('common:deviceManagement.kicking') : t(kickAllKey)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={confirmKickAll} onOpenChange={setConfirmKickAll}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t(kickAllTitleKey)}</AlertDialogTitle>
            <AlertDialogDescription>{t(kickAllDescriptionKey)}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={isKickingAll} onClick={() => { onKickAllDevices(); setConfirmKickAll(false); }}>
              {t(kickAllKey)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
