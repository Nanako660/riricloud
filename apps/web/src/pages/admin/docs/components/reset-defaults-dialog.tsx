import { useTranslation } from 'react-i18next';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { RotateCcw } from 'lucide-react';

interface ResetDefaultsDialogProps {
  onConfirm: () => void;
  isPending: boolean;
}

export function ResetDefaultsDialog({ onConfirm, isPending }: ResetDefaultsDialogProps) {
  const { t } = useTranslation(['admin', 'common']);

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 text-xs text-amber-600 hover:text-amber-700 border-amber-500/30">
          <RotateCcw className="size-3.5" />
          <span>{t('admin:docs.resetDefaults')}</span>
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('admin:docs.reset.title')}</AlertDialogTitle>
          <AlertDialogDescription className="space-y-2 text-xs">
            <p>{t('admin:docs.reset.desc1')}</p>
            <p className="text-destructive font-medium">
              {t('admin:docs.reset.desc2')}
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>{t('common:actions.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={isPending}
            className="bg-amber-600 hover:bg-amber-700 text-white"
          >
            {isPending ? t('admin:docs.reset.resetting') : t('admin:docs.reset.confirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
