import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
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
  action: string;
  onOpenChange: (open: boolean) => void;
  onVerified: (payload: CaptchaPayload) => void;
}

export function CaptchaDialog({ open, mode, siteKey, action, onOpenChange, onVerified }: CaptchaDialogProps) {
  const { t } = useTranslation(['auth', 'common', 'errors']);
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
      setError(t('errors:business.captchaUnavailable'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (open && mode === 'LOCAL') void loadLocal();
  }, [loadLocal, mode, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="compact">
        <DialogHeader>
          <DialogTitle>{t('auth:captcha.title')}</DialogTitle>
          <DialogDescription>
            {t('auth:captcha.required')}
          </DialogDescription>
        </DialogHeader>
        {mode === 'LOCAL' ? (
          <div className="space-y-3">
            <div className="flex min-h-14 items-center justify-center rounded-md border bg-muted/20 p-2" aria-label={t('auth:captcha.title')}>
              {local ? <div dangerouslySetInnerHTML={{ __html: local.svg }} /> : <span className="text-sm text-muted-foreground">{loading ? t('common:actions.loading') : t('common:status.unknown')}</span>}
            </div>
            <div className="flex gap-2">
              <Input value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder={t('auth:captcha.placeholder')} autoComplete="off" />
              <Button type="button" variant="outline" size="icon" onClick={() => void loadLocal()} disabled={loading} aria-label={t('auth:captcha.clickToRefresh')} title={t('auth:captcha.clickToRefresh')}><RefreshCw className={loading ? 'animate-spin' : ''} /></Button>
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <DialogFooter>
              <Button type="button" onClick={() => { if (local && answer.trim()) { onVerified({ captchaToken: local.captchaToken, captchaAnswer: answer }); onOpenChange(false); } }} disabled={!local || !answer.trim() || loading}>
                <ShieldCheck className="mr-1.5 size-4" />{t('common:actions.confirm')}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <TurnstileWidget siteKey={siteKey} action={action} onToken={(turnstileToken) => { onVerified({ turnstileToken }); onOpenChange(false); }} />
        )}
      </DialogContent>
    </Dialog>
  );
}

interface CaptchaInlineProps {
  mode: CaptchaMode;
  siteKey: string;
  action: string;
  onChange: (payload: CaptchaPayload | null) => void;
}

export function CaptchaInline({ mode, siteKey, action, onChange }: CaptchaInlineProps) {
  const { t } = useTranslation(['auth', 'common']);
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
  if (mode === 'TURNSTILE') return <TurnstileWidget siteKey={siteKey} action={action} onToken={(turnstileToken) => onChange({ turnstileToken })} />;

  return (
    <div className="space-y-2 rounded-lg border p-3 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{t('auth:captcha.title')}</p>
        <Button type="button" variant="ghost" size="icon" onClick={() => void loadLocal()} disabled={loading} aria-label={t('auth:captcha.clickToRefresh')} title={t('auth:captcha.clickToRefresh')}><RefreshCw className={loading ? 'animate-spin' : ''} /></Button>
      </div>
      <div className="flex min-h-14 items-center justify-center rounded-md bg-muted/20 p-2">
        {local ? <div dangerouslySetInnerHTML={{ __html: local.svg }} /> : <span className="text-sm text-muted-foreground">{loading ? t('common:actions.loading') : t('common:status.failed')}</span>}
      </div>
      <Input value={answer} onChange={(event) => { const value = event.target.value; setAnswer(value); onChange(local && value.trim() ? { captchaToken: local.captchaToken, captchaAnswer: value } : null); }} placeholder={t('auth:captcha.placeholder')} autoComplete="off" />
    </div>
  );
}

interface TurnstileWidgetProps {
  siteKey: string;
  action: string;
  onToken: (token: string) => void;
}

function TurnstileWidget({ siteKey, action, onToken }: TurnstileWidgetProps) {
  const { t } = useTranslation(['auth', 'errors']);
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!siteKey || !containerRef.current) {
      setError(t('errors:business.captchaUnavailable'));
      return;
    }
    let widgetId: string | undefined;
    let disposed = false;
    const render = () => {
      if (disposed || !containerRef.current || !window.turnstile) return;
      widgetId = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        action,
        callback: onToken,
        'expired-callback': () => setError(t('errors:business.captchaExpired')),
        'error-callback': () => setError(t('errors:business.captchaFailed'))
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
  }, [action, onToken, siteKey, t]);

  return <div className="space-y-2"><div ref={containerRef} className="min-h-[65px]" />{error ? <p className="text-sm text-destructive">{error}</p> : <p className="text-xs text-muted-foreground">{t('auth:captcha.turnstileWaiting')}</p>}</div>;
}

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: { sitekey: string; action: string; callback: (token: string) => void; 'expired-callback': () => void; 'error-callback': () => void }) => string;
      remove: (widgetId: string) => void;
    };
  }
}
