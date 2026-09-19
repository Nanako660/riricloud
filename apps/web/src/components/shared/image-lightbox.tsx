import { useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { X } from 'lucide-react';

interface ImageLightboxProps {
  src: string;
  alt?: string;
  className?: string;
}

export function ImageLightbox({ src, alt, className }: ImageLightboxProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <img
        src={src}
        alt={alt || '教程配图'}
        className={`cursor-zoom-in rounded-lg border border-border/60 transition-all hover:opacity-90 ${className || ''}`}
        onClick={() => setOpen(true)}
        loading="lazy"
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-w-4xl p-2 sm:p-4 bg-background/95 backdrop-blur border-border/80"
          aria-describedby={undefined}
        >
          <DialogTitle className="sr-only">{alt || '图片放大预览'}</DialogTitle>
          <div className="relative flex flex-col items-center justify-center">
            <button
              type="button"
              className="absolute -top-2 -right-2 z-10 rounded-full bg-muted/80 p-1.5 text-muted-foreground hover:text-foreground transition"
              onClick={() => setOpen(false)}
              aria-label="关闭预览"
            >
              <X className="size-4" />
            </button>
            <img
              src={src}
              alt={alt || '大图'}
              className="max-h-[80vh] w-auto max-w-full rounded-md object-contain shadow-2xl"
            />
            {alt ? (
              <p className="mt-2 text-center text-xs text-muted-foreground">{alt}</p>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
