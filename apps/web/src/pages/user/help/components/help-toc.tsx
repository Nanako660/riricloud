import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { slugify } from '@/lib/slugify';
import { ListCollapse } from 'lucide-react';

interface TocItem {
  id: string;
  text: string;
  level: number;
}

interface HelpTocProps {
  content: string;
}

export function HelpToc({ content }: HelpTocProps) {
  const { t } = useTranslation('user');
  const [items, setItems] = useState<TocItem[]>([]);
  const [activeId, setActiveId] = useState<string>('');

  useEffect(() => {
    const lines = content.split('\n');
    const parsed: TocItem[] = [];

    for (const line of lines) {
      const match = line.match(/^(#{2,3})\s+(.+)$/);
      if (match) {
        const level = match[1].length;
        const text = match[2].trim().replace(/[*`_]/g, '');
        const id = slugify(text);
        if (text && id) {
          parsed.push({ id, text, level });
        }
      }
    }

    setItems(parsed);
  }, [content]);

  useEffect(() => {
    if (items.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
            break;
          }
        }
      },
      { rootMargin: '-80px 0% -60% 0%' }
    );

    for (const item of items) {
      const el = document.getElementById(item.id);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [items]);

  if (items.length === 0) return null;

  return (
    <div className="space-y-2 text-xs">
      <div className="flex items-center gap-1.5 font-semibold text-foreground/80 px-2 py-1">
        <ListCollapse className="size-3.5 text-primary" />
        <span>{t('help.tocTitle')}</span>
      </div>
      <nav className="space-y-0.5 border-l border-border/60 pl-2">
        {items.map((item) => {
          const isActive = activeId === item.id;
          return (
            <a
              key={item.id}
              href={`#${item.id}`}
              onClick={(e) => {
                e.preventDefault();
                const el = document.getElementById(item.id);
                if (el) {
                  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  setActiveId(item.id);
                }
              }}
              className={`block truncate py-1 text-xs transition-colors rounded-sm px-1.5 ${
                item.level === 3 ? 'ml-2 text-muted-foreground/75' : ''
              } ${
                isActive
                  ? 'font-medium text-primary bg-primary/10 border-l-2 border-primary -ml-[9px] pl-[7px]'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {item.text}
            </a>
          );
        })}
      </nav>
    </div>
  );
}
