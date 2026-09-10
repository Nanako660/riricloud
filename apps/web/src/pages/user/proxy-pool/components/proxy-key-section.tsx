import { useState } from 'react';
import { Copy, Eye, EyeOff, KeyRound, MoreHorizontal, Pencil, Plus, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
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
import { EmptyState } from '@/components/shared/empty-state';
import { formatBytes, formatDateTime } from '@/lib/utils';
import { type ProxyKey, useProxyPoolMutations } from '../use-proxy-pool';

interface ProxyKeySectionProps {
  keys: ProxyKey[];
  limit: number;
  isPending: boolean;
  onCreate: () => void;
  onEdit: (key: ProxyKey) => void;
}

// 复制任意文本到剪贴板（无裸 button，统一走 Button 组件）
async function copyText(value: string, label: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(`${label}已复制`);
  } catch {
    toast.error('复制失败，请手动选择复制');
  }
}

export function ProxyKeySection({ keys, limit, isPending, onCreate, onEdit }: ProxyKeySectionProps) {
  const { deleteKey, updateKey, rotatePassword, rotateToken } = useProxyPoolMutations();
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});

  return (
    <Card>
      <CardHeader className="flex flex-col items-start justify-between gap-3 pb-4 sm:flex-row sm:items-center">
        <div className="min-w-0 space-y-0.5">
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="size-4" />
            直连代理凭据（{keys.length}/{limit}）
          </CardTitle>
          <CardDescription>
            每条凭据拥有独立的 pk_ 用户名与密码，支持单独绑定来源 IP 白名单与一键停用。
          </CardDescription>
        </div>
        <Button size="sm" className="w-full gap-1.5 sm:w-auto" onClick={onCreate} disabled={keys.length >= limit}>
          <Plus className="size-4" />
          新建凭据
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {isPending ? (
          <p className="py-6 text-center text-sm text-muted-foreground animate-pulse">加载中…</p>
        ) : keys.length ? (
          keys.map((item) => (
            <div key={item.id} className="rounded-lg border bg-muted/20 p-3.5 transition-colors hover:bg-muted/40">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium">{item.name}</span>
                    <Badge variant={item.isActive ? 'default' : 'secondary'} className="shrink-0">
                      {item.isActive ? '启用中' : '已停用'}
                    </Badge>
                    {item.whitelistIps.length ? (
                      <Badge variant="outline" className="shrink-0 gap-1">
                        <ShieldCheck className="size-3" />
                        {item.whitelistIps.length} 条白名单
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="shrink-0 text-muted-foreground">
                        不限来源
                      </Badge>
                    )}
                  </div>

                  <div className="space-y-1.5 text-xs">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="w-14 shrink-0 text-muted-foreground">用户名</span>
                      <code className="min-w-0 flex-1 truncate rounded border bg-background px-2 py-1 font-mono">{item.username}</code>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-7 shrink-0"
                        aria-label="复制用户名"
                        onClick={() => void copyText(item.username, '用户名')}
                      >
                        <Copy className="size-3.5" />
                      </Button>
                    </div>
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="w-14 shrink-0 text-muted-foreground">密码</span>
                      <code className="min-w-0 flex-1 truncate rounded border bg-background px-2 py-1 font-mono">
                        {revealed[item.id] ? item.password : '•'.repeat(18)}
                      </code>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-7 shrink-0"
                        aria-label={revealed[item.id] ? '隐藏密码' : '显示密码'}
                        onClick={() => setRevealed((prev) => ({ ...prev, [item.id]: !prev[item.id] }))}
                      >
                        {revealed[item.id] ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-7 shrink-0"
                        aria-label="复制密码"
                        onClick={() => void copyText(item.password, '密码')}
                      >
                        <Copy className="size-3.5" />
                      </Button>
                    </div>
                    {item.whitelistIps.length ? (
                      <div className="flex min-w-0 flex-wrap items-center gap-1 pt-0.5">
                        <span className="w-14 shrink-0 text-muted-foreground">白名单</span>
                        {item.whitelistIps.map((ip) => (
                          <Badge key={ip} variant="secondary" className="font-mono text-[11px] font-normal">
                            {ip}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <p className="text-xs text-muted-foreground">
                    已用流量 {formatBytes(item.trafficUsedBytes)} · 最近使用 {item.lastUsedAt ? formatDateTime(item.lastUsedAt) : '从未使用'}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2 lg:pt-0.5">
                  <div className="flex items-center gap-2 rounded-md border px-2.5 py-1.5">
                    <span className="text-xs text-muted-foreground">启用</span>
                    <Switch
                      checked={item.isActive}
                      disabled={updateKey.isPending}
                      aria-label={`切换 ${item.name} 启用状态`}
                      onCheckedChange={(checked) => updateKey.mutate({ id: item.id, name: item.name, isActive: checked })}
                    />
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="icon" className="size-8" aria-label="更多操作">
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem onSelect={() => onEdit(item)}>
                        <Pencil className="size-4" />
                        编辑名称与白名单
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => rotatePassword.mutate(item.id)}>
                        <RefreshCw className="size-4" />
                        轮换密码
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => rotateToken.mutate(item.id)}>
                        <RefreshCw className="size-4" />
                        轮换拉取令牌
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onSelect={(event) => event.preventDefault()}
                          >
                            <Trash2 className="size-4" />
                            删除凭据
                          </DropdownMenuItem>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>删除「{item.name}」？</AlertDialogTitle>
                            <AlertDialogDescription>
                              删除后该凭据立即失效，所有节点配置会在数秒内重下发完成吊销，此操作不可撤销。
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>取消</AlertDialogCancel>
                            <AlertDialogAction variant="destructive" onClick={() => deleteKey.mutate(item.id)}>
                              确认删除
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </div>
          ))
        ) : (
          <EmptyState
            title="还没有直连代理凭据"
            description="创建第一条 Proxy Key 后即可通过 SOCKS5 / HTTP 直连代理池访问网络。"
          />
        )}
      </CardContent>
    </Card>
  );
}
