import { CheckCircle2, HelpCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const steps = [
  ['1', '复制订阅链接', '在我的订阅中复制专属的通用多格式订阅链接。'],
  ['2', '导入客户端', '在 Clash Meta、Sing-box 或 Shadowrocket 中粘贴订阅链接。'],
  ['3', '选择线路并连接', '更新配置后选择延迟较低的可用线路开启代理。']
] as const;

export function ClientGuideCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <HelpCircle className="h-4 w-4" />客户端使用指引
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          {steps.map(([step, title, description]) => (
            <div key={step} className="space-y-1.5 rounded-lg border bg-muted/20 p-3.5">
              <div className="flex items-center gap-2 text-sm font-medium">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{step}</span>
                {title}
              </div>
              <p className="text-muted-foreground text-xs leading-relaxed">{description}</p>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 rounded-md bg-secondary/50 px-3 py-2 text-xs text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
          <span>公开可用的线路会由系统自动同步至客户端，无需手动填写服务器与端口。</span>
        </div>
      </CardContent>
    </Card>
  );
}
