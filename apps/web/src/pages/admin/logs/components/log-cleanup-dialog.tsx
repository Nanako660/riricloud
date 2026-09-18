import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface LogCleanupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClean: (params: { retentionDays?: number; maxRecords?: number }) => Promise<void>;
  isLoading: boolean;
}

export function LogCleanupDialog({
  open,
  onOpenChange,
  onClean,
  isLoading
}: LogCleanupDialogProps) {
  const { t } = useTranslation(['admin', 'common']);
  const [strategy, setStrategy] = React.useState<'days' | 'count'>('days');
  const [days, setDays] = React.useState('7');
  const [maxCount, setMaxCount] = React.useState('50000');

  const handleConfirm = async () => {
    if (strategy === 'days') {
      await onClean({ retentionDays: Number(days) });
    } else {
      await onClean({ maxRecords: Number(maxCount) });
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <Trash2 className="size-4" />
            {t('admin:logs.cleanDialogTitle')}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {t('admin:logs.cleanDialogDesc')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 text-xs">
          <div className="space-y-1.5">
            <label className="font-medium text-foreground">{t('admin:logs.cleanStrategyLabel')}</label>
            <Select value={strategy} onValueChange={(val) => setStrategy(val as 'days' | 'count')}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="days">{t('admin:logs.cleanStrategyDays')}</SelectItem>
                <SelectItem value="count">{t('admin:logs.cleanStrategyCount')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {strategy === 'days' ? (
            <div className="space-y-1.5">
              <label className="font-medium text-foreground">{t('admin:logs.cleanDaysLabel')}</label>
              <Select value={days} onValueChange={setDays}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="3">{t('admin:logs.cleanDays3')}</SelectItem>
                  <SelectItem value="7">{t('admin:logs.cleanDays7')}</SelectItem>
                  <SelectItem value="14">{t('admin:logs.cleanDays14')}</SelectItem>
                  <SelectItem value="30">{t('admin:logs.cleanDays30')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-1.5">
              <label className="font-medium text-foreground">{t('admin:logs.cleanCountLabel')}</label>
              <Select value={maxCount} onValueChange={setMaxCount}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10000">{t('admin:logs.cleanCount10k')}</SelectItem>
                  <SelectItem value="50000">{t('admin:logs.cleanCount50k')}</SelectItem>
                  <SelectItem value="100000">{t('admin:logs.cleanCount100k')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-amber-800 dark:text-amber-300">
            <AlertTriangle className="size-4 shrink-0 mt-0.5" />
            <p className="text-[11px] leading-relaxed">
              {t('admin:logs.cleanNotice')}
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            {t('common:actions.cancel')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => void handleConfirm()}
            disabled={isLoading}
          >
            {isLoading ? t('admin:logs.cleaning') : t('admin:logs.cleanConfirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
