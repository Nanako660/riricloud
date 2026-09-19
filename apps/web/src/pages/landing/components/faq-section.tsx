import { useTranslation } from 'react-i18next';
import { HelpCircle } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import type { LandingFaqItem } from '../types';

interface FaqSectionProps {
  faqs: LandingFaqItem[];
}

export function FaqSection({ faqs }: FaqSectionProps) {
  const { t } = useTranslation('landing');

  if (!faqs || faqs.length === 0) {
    return null;
  }

  return (
    <section id="faq" className="scroll-mt-16 border-t border-border/40 py-20 sm:py-28">
      <div className="mx-auto max-w-4xl px-4 sm:px-6">
        {/* Section Header */}
        <div className="text-center max-w-2xl mx-auto">
          <p className="text-xs font-bold uppercase tracking-widest text-primary flex items-center justify-center gap-1.5">
            <HelpCircle className="size-3.5" />
            <span>{t('faq.tag', { defaultValue: 'FREQUENTLY ASKED QUESTIONS' })}</span>
          </p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-4xl">
            {t('faq.heading', { defaultValue: '常见使用疑问解答' })}
          </h2>
          <p className="mt-3 text-sm sm:text-base text-muted-foreground leading-relaxed">
            {t('faq.subtitle', {
              defaultValue: '了解关于账号注册、客户端适配、订阅导入与网络保障的常见细节。'
            })}
          </p>
        </div>

        {/* Accordion FAQ list */}
        <div className="mt-12">
          <Accordion type="single" collapsible className="w-full space-y-3">
            {faqs.map((item) => (
              <AccordionItem
                key={item.id}
                value={item.id}
                className="rounded-lg border border-border/60 bg-card/60 px-4 transition-colors hover:border-border"
              >
                <AccordionTrigger className="text-left text-sm sm:text-base font-medium text-foreground py-4 hover:no-underline hover:text-primary">
                  {item.question}
                </AccordionTrigger>
                <AccordionContent className="text-xs sm:text-sm text-muted-foreground leading-relaxed pt-1 pb-4">
                  {item.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  );
}
