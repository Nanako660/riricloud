import { useState } from 'react';
import { KeyRound, RotateCcw } from 'lucide-react';
import { CopyButton } from '@/components/shared/copy-button';
import { ResponsiveDialog, ResponsiveDialogContent } from '@/components/shared/responsive-dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useNodeMutations, type AdminNode, type RotateNodeTokenResult } from '../use-nodes';
import { InstallCommandsPicker } from './install-commands-picker';

export function RotateTokenDialog({ node }: { node: AdminNode }) {
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
            <RotateCcw />轮换 Token
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><KeyRound className="h-4 w-4" />轮换 AgentToken？</AlertDialogTitle>
            <AlertDialogDescription>
              节点「{node.name}」的旧 Token 将立即失效，在线 Agent 会断开。轮换完成后，必须在目标主机重新写入新 Token 才能恢复连接。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
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
              {rotateToken.isPending ? '轮换中…' : '确认轮换'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ResponsiveDialog open={resultOpen} onOpenChange={closeResult}>
        <ResponsiveDialogContent size="compact">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><KeyRound className="h-4 w-4" />AgentToken 已轮换</DialogTitle>
            <DialogDescription>新 Token 只在本窗口显示一次。请立即复制并在目标主机重新安装或更新 Agent。</DialogDescription>
          </DialogHeader>
          {result ? (
            <div className="min-w-0 space-y-4">
              <div className="space-y-2">
                <Label>新 AgentToken</Label>
                <div className="flex min-w-0 items-start gap-2">
                  <code className="min-w-0 flex-1 break-all rounded-md border bg-muted/40 p-3 font-mono text-xs">{result.agentToken}</code>
                  <CopyButton value={result.agentToken} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>重新安装与启动命令</Label>
                <InstallCommandsPicker
                  key={result.nodeId}
                  commands={result.installCommands}
                  fallbackCommand={result.installCommand}
                  defaultMode={node.communicationMode === 'HTTP' ? 'http' : 'ws'}
                />
              </div>
              <p className="text-xs text-muted-foreground">关闭后主控不会再次返回这个明文 Token。</p>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => closeResult(false)}>完成</Button>
          </DialogFooter>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </>
  );
}
