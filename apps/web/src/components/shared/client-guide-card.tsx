import { CheckCircle2, HelpCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function ClientGuideCard() {
  const { t } = useTranslation(['user', 'common']);

  const steps = [
    { step: '1', title: t('user:clientGuide.step1Title'), desc: t('user:clientGuide.step1Desc') },
    { step: '2', title: t('user:clientGuide.step2Title'), desc: t('user:clientGuide.step2Desc') },
    { step: '3', title: t('user:clientGuide.step3Title'), desc: t('user:clientGuide.step3Desc') }
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <HelpCircle className="h-4 w-4" />{t('user:clientGuide.title')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          {steps.map(({ step, title, desc }) => (
            <div key={step} className="space-y-1.5 rounded-lg border bg-muted/20 p-3.5">
              <div className="flex items-center gap-2 text-sm font-medium">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{step}</span>
                {title}
              </div>
              <p className="text-muted-foreground text-xs leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 rounded-md bg-secondary/50 px-3 py-2 text-xs text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
          <span>{t('user:clientGuide.footerTip')}</span>
        </div>
      </CardContent>
    </Card>
  );
}

