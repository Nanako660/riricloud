import { useState } from 'react';
import { KeyRound, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { CopyButton } from '@/components/shared/copy-button';
import { ResponsiveDialog, ResponsiveDialogContent } from '@/components/shared/responsive-dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useNodeMutations, type AdminNode, type RotateNodeTokenResult } from '../use-nodes';
import { InstallCommandsPicker } from './install-commands-picker';

export function RotateTokenDialog({ node }: { node: AdminNode }) {
  const { t } = useTranslation(['admin', 'common']);
  const { rotateToken } = useNodeMutations();
  const [result, setResult] = useState<RotateNodeTokenResult | null>(null);
  const [resultOpen, setResultOpen] = useState(false);

  const closeResult = (open: boolean) => {
    setResultOpen(open);
    if (!open) {
      setResult(null);
    }
  };

  return (
    <>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button type="button" variant="outline" size="sm" disabled={rotateToken.isPending}>
            <RotateCcw />{t('admin:nodes.confirmRotate')}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <KeyRound className="h-4 w-4" />
              {t('admin:nodes.rotateTokenTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('admin:nodes.rotateTokenDesc', { name: node.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common:actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={rotateToken.isPending}
              onClick={() => rotateToken.mutate({ id: node.id }, {
                onSuccess: (data) => {
                  setResult(data);
                  setResultOpen(true);
                }
              })}
            >
              {rotateToken.isPending ? t('admin:nodes.rotating') : t('admin:nodes.confirmRotate')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ResponsiveDialog open={resultOpen} onOpenChange={closeResult}>
        <ResponsiveDialogContent size="compact">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-4 w-4" />
              {t('admin:nodes.rotatedTitle')}
            </DialogTitle>
            <DialogDescription>{t('admin:nodes.rotatedDesc')}</DialogDescription>
          </DialogHeader>
          {result ? (
            <div className="min-w-0 space-y-4">
              <div className="space-y-2">
                <Label>{t('admin:nodes.newToken')}</Label>
                <div className="flex min-w-0 items-start gap-2">
                  <code className="min-w-0 flex-1 break-all rounded-md border bg-muted/40 p-3 font-mono text-xs">{result.agentToken}</code>
                  <CopyButton value={result.agentToken} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t('admin:nodes.reinstallCmd')}</Label>
                <InstallCommandsPicker
                  key={result.nodeId}
                  commands={result.installCommands}
                  fallbackCommand={result.installCommand}
                  defaultMode={node.communicationMode === 'HTTP' ? 'http' : 'ws'}
                  nodeOsArch={node.osArch}
                  nodeId={node.id}
                />
              </div>
              <p className="text-xs text-muted-foreground">{t('admin:nodes.tokenWarning')}</p>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => closeResult(false)}>{t('common:actions.finish')}</Button>
          </DialogFooter>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </>
  );
}
