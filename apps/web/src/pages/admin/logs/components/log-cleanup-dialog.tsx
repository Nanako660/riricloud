import * as React from 'react';
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
            清理系统历史日志
          </DialogTitle>
          <DialogDescription className="text-xs">
            清理操作将物理删除 SQLite 数据库中符合条件的日志记录，此操作不可逆。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 text-xs">
          <div className="space-y-1.5">
            <label className="font-medium text-foreground">清理策略模式</label>
            <Select value={strategy} onValueChange={(val) => setStrategy(val as 'days' | 'count')}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="days">按保留天数清理（删除指定天数前的旧日志）</SelectItem>
                <SelectItem value="count">按保留条数截断（仅保留最新 N 条记录）</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {strategy === 'days' ? (
            <div className="space-y-1.5">
              <label className="font-medium text-foreground">选择清理时间阈值</label>
              <Select value={days} onValueChange={setDays}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="3">清理 3 天前的全部日志</SelectItem>
                  <SelectItem value="7">清理 7 天前的全部日志（推荐）</SelectItem>
                  <SelectItem value="14">清理 14 天前的全部日志</SelectItem>
                  <SelectItem value="30">清理 30 天前的全部日志</SelectItem>
                  <SelectItem value="0">清空全部历史日志（重置数据库）</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-1.5">
              <label className="font-medium text-foreground">选择保留记录上限</label>
              <Select value={maxCount} onValueChange={setMaxCount}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10000">仅保留最新 10,000 条</SelectItem>
                  <SelectItem value="50000">仅保留最新 50,000 条（推荐）</SelectItem>
                  <SelectItem value="100000">仅保留最新 100,000 条</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-amber-800 dark:text-amber-300">
            <AlertTriangle className="size-4 shrink-0 mt-0.5" />
            <p className="text-[11px] leading-relaxed">
              提示：Master 服务端后台已有定时巡检自动淘汰超期日志；若非紧急排查或磁盘紧张，建议保留自动轮转即可。
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
            取消
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => void handleConfirm()}
            disabled={isLoading}
          >
            {isLoading ? '正在清理...' : '确认执行清理'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
