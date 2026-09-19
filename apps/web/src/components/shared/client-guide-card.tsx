import { ArrowRight, CheckCircle2, HelpCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
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
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <HelpCircle className="h-4 w-4" />{t('user:clientGuide.title')}
        </CardTitle>
        <Button variant="ghost" size="sm" asChild className="text-xs gap-1 h-8 text-primary hover:text-primary">
          <Link to="/help">
            <span>{t('user:clientGuide.viewFullDocs', { defaultValue: '查看完整图文教程' })}</span>
            <ArrowRight className="size-3.5" />
          </Link>
        </Button>
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

