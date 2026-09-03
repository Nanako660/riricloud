import { useEffect, useMemo, useState } from 'react';
import { Megaphone, X } from 'lucide-react';
import { usePublicSettings } from '@/lib/public-settings';
import { MarkdownText } from '@/components/shared/markdown-text';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export function AnnouncementCard() {
  const settings = usePublicSettings().data;
  const announcement = settings?.siteAnnouncement?.trim() ?? '';
  const storageKey = useMemo(() => announcement ? `riricloud:announcement:${announcement}` : '', [announcement]);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setDismissed(storageKey ? window.localStorage.getItem(storageKey) === 'dismissed' : false);
  }, [storageKey]);

  if (!announcement || dismissed) return null;

  return (
    <Card className="border-primary/30 bg-primary/[0.04]">
      <CardContent className="flex items-start gap-3 p-4">
        <Megaphone className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1"><MarkdownText content={announcement} /></div>
        <Button
          variant="ghost"
          size="icon"
          className="-mr-2 -mt-2 shrink-0"
          aria-label="收起公告"
          onClick={() => {
            window.localStorage.setItem(storageKey, 'dismissed');
            setDismissed(true);
          }}
        >
          <X />
        </Button>
      </CardContent>
    </Card>
  );
}
