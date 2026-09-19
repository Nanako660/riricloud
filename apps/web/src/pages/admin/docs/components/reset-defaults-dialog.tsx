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
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 text-xs text-amber-600 hover:text-amber-700 border-amber-500/30">
          <RotateCcw className="size-3.5" />
          <span>恢复官方预设</span>
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>恢复官方预设新手教程？</AlertDialogTitle>
          <AlertDialogDescription className="space-y-2 text-xs">
            <p>
              此操作将重置系统默认的 5 篇官方新手教程（Windows、macOS、iOS、Android 及常见排错 FAQ）至出厂预置内容。
            </p>
            <p className="text-destructive font-medium">
              如果您曾修改过这些默认文章的文案，修改内容将被覆盖。您自行新建的其他自定义文档将不受影响。
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>取消</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={isPending}
            className="bg-amber-600 hover:bg-amber-700 text-white"
          >
            {isPending ? '正在重置…' : '确认恢复预设'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
