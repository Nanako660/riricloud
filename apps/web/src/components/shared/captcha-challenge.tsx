import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw, ShieldCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

export type CaptchaMode = 'OFF' | 'LOCAL' | 'TURNSTILE';

export interface CaptchaPayload {
  captchaToken?: string;
  captchaAnswer?: string;
  turnstileToken?: string;
}

interface LocalChallenge {
  svg: string;
  captchaToken: string;
  expiresAt: string;
}

interface CaptchaDialogProps {
  open: boolean;
  mode: CaptchaMode;
  siteKey: string;
  onOpenChange: (open: boolean) => void;
  onVerified: (payload: CaptchaPayload) => void;
}

export function CaptchaDialog({ open, mode, siteKey, onOpenChange, onVerified }: CaptchaDialogProps) {
  const [local, setLocal] = useState<LocalChallenge | null>(null);
  const [answer, setAnswer] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadLocal = useCallback(async () => {
    setLoading(true);
    setError('');
    setAnswer('');
    try {
      setLocal((await api.get<LocalChallenge>('/captcha/local')).data);
    } catch {
      setError('验证码加载失败，请刷新重试');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && mode === 'LOCAL') void loadLocal();
  }, [loadLocal, mode, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="compact">
        <DialogHeader>
          <DialogTitle>完成人机验证</DialogTitle>
          <DialogDescription>验证通过后才会发送邮件验证码。</DialogDescription>
        </DialogHeader>
        {mode === 'LOCAL' ? (
          <div className="space-y-3">
            <div className="flex min-h-14 items-center justify-center rounded-md border bg-muted/20 p-2" aria-label="本地图形验证码">
              {local ? <div dangerouslySetInnerHTML={{ __html: local.svg }} /> : <span className="text-sm text-muted-foreground">{loading ? '加载中…' : '暂无验证码'}</span>}
            </div>
            <div className="flex gap-2">
              <Input value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="输入图形验证码" autoComplete="off" />
              <Button type="button" variant="outline" size="icon" onClick={() => void loadLocal()} disabled={loading} aria-label="刷新验证码" title="刷新验证码"><RefreshCw className={loading ? 'animate-spin' : ''} /></Button>
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <DialogFooter>
              <Button type="button" onClick={() => { if (local && answer.trim()) { onVerified({ captchaToken: local.captchaToken, captchaAnswer: answer }); onOpenChange(false); } }} disabled={!local || !answer.trim() || loading}>
                <ShieldCheck />验证并继续
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <TurnstileWidget siteKey={siteKey} onToken={(turnstileToken) => { onVerified({ turnstileToken }); onOpenChange(false); }} />
        )}
      </DialogContent>
    </Dialog>
  );
}

interface CaptchaInlineProps {
  mode: CaptchaMode;
  siteKey: string;
  onChange: (payload: CaptchaPayload | null) => void;
}

export function CaptchaInline({ mode, siteKey, onChange }: CaptchaInlineProps) {
  const [local, setLocal] = useState<LocalChallenge | null>(null);
  const [answer, setAnswer] = useState('');
  const [loading, setLoading] = useState(false);

  const loadLocal = useCallback(async () => {
    setLoading(true);
    setAnswer('');
    onChange(null);
    try {
      setLocal((await api.get<LocalChallenge>('/captcha/local')).data);
    } finally {
      setLoading(false);
    }
  }, [onChange]);

  useEffect(() => {
    if (mode === 'LOCAL') void loadLocal();
    if (mode === 'OFF') onChange(null);
  }, [loadLocal, mode, onChange]);

  if (mode === 'OFF') return null;
  if (mode === 'TURNSTILE') return <TurnstileWidget siteKey={siteKey} onToken={(turnstileToken) => onChange({ turnstileToken })} />;

  return (
    <div className="space-y-2 rounded-lg border p-3 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">人机验证</p>
        <Button type="button" variant="ghost" size="icon" onClick={() => void loadLocal()} disabled={loading} aria-label="刷新验证码" title="刷新验证码"><RefreshCw className={loading ? 'animate-spin' : ''} /></Button>
      </div>
      <div className="flex min-h-14 items-center justify-center rounded-md bg-muted/20 p-2">
        {local ? <div dangerouslySetInnerHTML={{ __html: local.svg }} /> : <span className="text-sm text-muted-foreground">{loading ? '加载中…' : '验证码加载失败'}</span>}
      </div>
      <Input value={answer} onChange={(event) => { const value = event.target.value; setAnswer(value); onChange(local && value.trim() ? { captchaToken: local.captchaToken, captchaAnswer: value } : null); }} placeholder="输入图形验证码" autoComplete="off" />
    </div>
  );
}

interface TurnstileWidgetProps {
  siteKey: string;
  onToken: (token: string) => void;
}

function TurnstileWidget({ siteKey, onToken }: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!siteKey || !containerRef.current) {
      setError('管理员尚未配置 Turnstile Site Key');
      return;
    }
    let widgetId: string | undefined;
    let disposed = false;
    const render = () => {
      if (disposed || !containerRef.current || !window.turnstile) return;
      widgetId = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        callback: onToken,
        'expired-callback': () => setError('验证已过期，请重新验证'),
        'error-callback': () => setError('Turnstile 加载失败，请检查网络')
      });
    };
    const existing = document.getElementById('riricloud-turnstile-script') as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', render, { once: true });
      render();
    } else {
      const script = document.createElement('script');
      script.id = 'riricloud-turnstile-script';
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      script.addEventListener('load', render, { once: true });
      document.head.appendChild(script);
    }
    return () => {
      disposed = true;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [onToken, siteKey]);

  return <div className="space-y-2"><div ref={containerRef} className="min-h-[65px]" />{error ? <p className="text-sm text-destructive">{error}</p> : <p className="text-xs text-muted-foreground">由 Cloudflare 提供无感人机验证。</p>}</div>;
}

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: { sitekey: string; callback: (token: string) => void; 'expired-callback': () => void; 'error-callback': () => void }) => string;
      remove: (widgetId: string) => void;
    };
  }
}
