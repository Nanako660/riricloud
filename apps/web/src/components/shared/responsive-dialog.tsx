import * as React from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

type ResponsiveDialogProps = React.ComponentProps<typeof Dialog>;

export function ResponsiveDialog({ children, ...props }: ResponsiveDialogProps) {
  const isMobile = useIsMobile();

  return isMobile ? <Sheet {...props}>{children}</Sheet> : <Dialog {...props}>{children}</Dialog>;
}

type ResponsiveDialogContentProps = Omit<React.ComponentProps<typeof DialogContent>, 'size'> & {
  size?: 'default' | 'compact' | 'wide';
};

export function ResponsiveDialogContent({ className, size, ...props }: ResponsiveDialogContentProps) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <SheetContent
        side="right"
        className={cn('h-[100dvh] w-full max-w-none overflow-y-auto rounded-none p-4 sm:p-6', className)}
        {...props}
      />
    );
  }

  return <DialogContent size={size} className={className} {...props} />;
}
