import { useState } from 'react';
import {
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Trash2
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
    <div className="space-y-4">
      {/* 头部操作栏 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold tracking-tight">
            <KeyRound className="size-4 text-emerald-500" />
            凭据与白名单管理
            <span className="text-xs font-normal text-muted-foreground">
              ({keys.length}/{limit})
            </span>
          </h3>
          <p className="text-xs text-muted-foreground">
            为不同爬虫脚本、自动化任务或指纹浏览器分配独立凭据，支持单独绑定来源 IP 白名单与一键停用。
          </p>
        </div>
        <Button size="sm" className="gap-1.5 shrink-0" onClick={onCreate} disabled={keys.length >= limit}>
          <Plus className="size-4" />
          新建凭据
        </Button>
      </div>

      {/* 响应式凭据卡片网格 */}
      {isPending ? (
        <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-44 rounded-lg border bg-muted/20 animate-pulse" />
          ))}
        </div>
      ) : keys.length ? (
        <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
          {keys.map((item) => (
            <Card
              key={item.id}
              className="relative flex flex-col justify-between overflow-hidden border-border/80 bg-card/60 transition-all hover:bg-card hover:shadow-sm"
            >
              <CardHeader className="p-4 pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      {/* 发光状态指示微灯 */}
                      <span className="relative flex size-2 shrink-0">
                        {item.isActive ? (
                          <>
                            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                            <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
                          </>
                        ) : (
                          <span className="relative inline-flex size-2 rounded-full bg-muted-foreground/40" />
                        )}
                      </span>
                      <CardTitle className="truncate text-sm font-semibold" title={item.name}>
                        {item.name}
                      </CardTitle>
                      <Badge
                        variant={item.isActive ? 'default' : 'secondary'}
                        className="h-5 px-1.5 text-[10px] font-normal shrink-0"
                      >
                        {item.isActive ? '已启用' : '已停用'}
                      </Badge>
                    </div>

                    {/* 白名单状态标签 */}
                    <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      {item.whitelistIps.length ? (
                        <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                          <ShieldCheck className="size-3" />
                          已限制 {item.whitelistIps.length} 个 IP/网段
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          <ShieldAlert className="size-3 text-muted-foreground/70" />
                          不限来源 IP
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 快捷启用 Switch + 下拉菜单 */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Switch
                      checked={item.isActive}
                      disabled={updateKey.isPending}
                      aria-label={`切换 ${item.name} 启用状态`}
                      onCheckedChange={(checked) =>
                        updateKey.mutate({ id: item.id, name: item.name, isActive: checked })
                      }
                    />

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-7" aria-label="更多操作">
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem onSelect={() => onEdit(item)}>
                          <Pencil className="size-4 mr-2" />
                          编辑名称与白名单
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => rotatePassword.mutate(item.id)}>
                          <RefreshCw className="size-4 mr-2" />
                          轮换密码
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => rotateToken.mutate(item.id)}>
                          <RefreshCw className="size-4 mr-2" />
                          轮换拉取令牌
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onSelect={(event) => event.preventDefault()}
                            >
                              <Trash2 className="size-4 mr-2" />
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
              </CardHeader>

              <CardContent className="p-4 pt-0 space-y-2.5">
                {/* 紧凑等宽凭据胶囊 */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-2.5 py-1 text-xs transition-colors hover:bg-muted/50">
                    <span className="w-12 shrink-0 text-[11px] font-medium text-muted-foreground">用户名</span>
                    <code className="min-w-0 flex-1 truncate font-mono text-[11px] font-semibold text-foreground select-all">
                      {item.username}
                    </code>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-6 shrink-0 text-muted-foreground hover:text-foreground"
                      aria-label="复制用户名"
                      onClick={() => void copyText(item.username, '用户名')}
                    >
                      <Copy className="size-3" />
                    </Button>
                  </div>

                  <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-2.5 py-1 text-xs transition-colors hover:bg-muted/50">
                    <span className="w-12 shrink-0 text-[11px] font-medium text-muted-foreground">密码</span>
                    <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground select-all">
                      {revealed[item.id] ? item.password : '••••••••••••••••'}
                    </code>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-6 text-muted-foreground hover:text-foreground"
                        aria-label={revealed[item.id] ? '隐藏密码' : '显示密码'}
                        onClick={() => setRevealed((prev) => ({ ...prev, [item.id]: !prev[item.id] }))}
                      >
                        {revealed[item.id] ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-6 text-muted-foreground hover:text-foreground"
                        aria-label="复制密码"
                        onClick={() => void copyText(item.password, '密码')}
                      >
                        <Copy className="size-3" />
                      </Button>
                    </div>
                  </div>
                </div>

                {/* 白名单 IP 预览标签（如果有） */}
                {item.whitelistIps.length ? (
                  <div className="flex min-w-0 flex-wrap items-center gap-1 pt-0.5">
                    {item.whitelistIps.slice(0, 3).map((ip) => (
                      <Badge key={ip} variant="secondary" className="font-mono text-[10px] font-normal px-1.5 py-0">
                        {ip}
                      </Badge>
                    ))}
                    {item.whitelistIps.length > 3 ? (
                      <span className="text-[10px] text-muted-foreground">+{item.whitelistIps.length - 3}</span>
                    ) : null}
                  </div>
                ) : null}

                {/* 卡片微型底部：流量与活跃时间 */}
                <div className="flex items-center justify-between border-t border-border/50 pt-2 text-[11px] text-muted-foreground">
                  <span>已用 {formatBytes(item.trafficUsedBytes)}</span>
                  <span>活跃 {item.lastUsedAt ? formatDateTime(item.lastUsedAt) : '从未使用'}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="border-dashed bg-muted/10">
          <CardContent className="py-8">
            <EmptyState
              title="还没有直连代理凭据"
              description="创建第一条 Proxy Key 凭据后即可通过 SOCKS5 / HTTP 直连代理池访问网络。"
              action={
                <Button size="sm" onClick={onCreate}>
                  创建第一条凭据
                </Button>
              }
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
