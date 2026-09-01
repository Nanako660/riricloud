import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { PanelLeft } from 'lucide-react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

interface SidebarContextType {
  isMobile: boolean;
  open: boolean;
  openMobile: boolean;
  setOpen: (open: boolean) => void;
  setOpenMobile: (open: boolean) => void;
  toggleSidebar: () => void;
}

const SidebarContext = React.createContext<SidebarContextType | null>(null);

export function useSidebar() {
  const context = React.useContext(SidebarContext);
  if (!context) {
    throw new Error('useSidebar must be used within a SidebarProvider');
  }
  return context;
}

const SidebarProvider = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { defaultOpen?: boolean }
>(({ className, defaultOpen = true, children, ...props }, ref) => {
  const isMobile = useIsMobile();
  const [open, setOpen] = React.useState(defaultOpen);
  const [openMobile, setOpenMobile] = React.useState(false);
  const toggleSidebar = React.useCallback(() => {
    if (isMobile) {
      setOpenMobile((prev) => !prev);
    } else {
      setOpen((prev) => !prev);
    }
  }, [isMobile]);

  const value = React.useMemo(
    () => ({ isMobile, open, openMobile, setOpen, setOpenMobile, toggleSidebar }),
    [isMobile, open, openMobile, toggleSidebar]
  );

  return (
    <SidebarContext.Provider value={value}>
      <div
        ref={ref}
        className={cn('group/sidebar-wrapper flex min-h-svh w-full bg-sidebar', className)}
        {...props}
      >
        {children}
      </div>
    </SidebarContext.Provider>
  );
});
SidebarProvider.displayName = 'SidebarProvider';

interface SidebarProps extends React.HTMLAttributes<HTMLElement> {
  variant?: 'sidebar' | 'floating' | 'inset';
}

const Sidebar = React.forwardRef<HTMLElement, SidebarProps>(
  ({ className, children, variant = 'sidebar', ...props }, ref) => {
    const { isMobile, openMobile, setOpenMobile } = useSidebar();

    if (isMobile) {
      return (
        <Sheet open={openMobile} onOpenChange={setOpenMobile}>
          <SheetContent
            side="left"
            aria-label={props['aria-label']}
            className={cn('w-[18rem] max-w-[calc(100vw-3rem)] gap-0 p-0', className)}
          >
            {children}
          </SheetContent>
        </Sheet>
      );
    }

    return (
      <aside
        ref={ref}
        data-sidebar="sidebar"
        data-variant={variant}
        className={cn(
          'bg-sidebar text-sidebar-foreground hidden h-svh w-60 shrink-0 flex-col md:flex',
          variant === 'inset' ? 'border-r-0' : 'border-r border-sidebar-border',
          className
        )}
        {...props}
      >
        {children}
      </aside>
    );
  }
);
Sidebar.displayName = 'Sidebar';

const SidebarTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<typeof Button>
>(({ className, onClick, ...props }, ref) => {
  const { toggleSidebar } = useSidebar();
  return (
    <Button
      ref={ref}
      variant="ghost"
      size="icon"
      className={cn('h-8 w-8', className)}
      onClick={(event) => {
        onClick?.(event);
        toggleSidebar();
      }}
      {...props}
    >
      <PanelLeft className="h-4 w-4" />
      <span className="sr-only">切换侧边栏</span>
    </Button>
  );
});
SidebarTrigger.displayName = 'SidebarTrigger';

const SidebarHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} data-sidebar="header" className={cn('flex w-full shrink-0 flex-col gap-2 px-5 py-4', className)} {...props} />
  )
);
SidebarHeader.displayName = 'SidebarHeader';

const SidebarContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} data-sidebar="content" className={cn('flex min-h-0 flex-1 flex-col gap-2 overflow-auto px-3 py-2', className)} {...props} />
  )
);
SidebarContent.displayName = 'SidebarContent';

const SidebarFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} data-sidebar="footer" className={cn('flex w-full shrink-0 flex-col gap-2 px-5 py-4', className)} {...props} />
  )
);
SidebarFooter.displayName = 'SidebarFooter';

const SidebarInset = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-sidebar="inset"
      className={cn('relative flex min-w-0 flex-1 flex-col', className)}
      {...props}
    />
  )
);
SidebarInset.displayName = 'SidebarInset';

const SidebarGroup = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} data-sidebar="group" className={cn('relative flex w-full min-w-0 flex-col', className)} {...props} />
  )
);
SidebarGroup.displayName = 'SidebarGroup';

const SidebarGroupLabel = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} data-sidebar="group-label" className={cn('text-sidebar-foreground/65 flex h-8 shrink-0 items-center px-3 text-xs font-medium tracking-wider uppercase', className)} {...props} />
  )
);
SidebarGroupLabel.displayName = 'SidebarGroupLabel';

const SidebarMenu = React.forwardRef<HTMLUListElement, React.HTMLAttributes<HTMLUListElement>>(
  ({ className, ...props }, ref) => (
    <ul ref={ref} data-sidebar="menu" className={cn('flex w-full min-w-0 flex-col gap-1', className)} {...props} />
  )
);
SidebarMenu.displayName = 'SidebarMenu';

const SidebarMenuItem = React.forwardRef<HTMLLIElement, React.LiHTMLAttributes<HTMLLIElement>>(
  ({ className, ...props }, ref) => (
    <li ref={ref} data-sidebar="menu-item" className={cn('group/menu-item relative', className)} {...props} />
  )
);
SidebarMenuItem.displayName = 'SidebarMenuItem';

const sidebarMenuButtonVariants = cva(
  'flex w-full items-center gap-3 overflow-hidden rounded-md px-3 py-2 text-left text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sidebar-ring disabled:pointer-events-none disabled:opacity-50 [&>svg]:size-4 [&>svg]:shrink-0',
  {
    variants: {
      active: {
        true: 'bg-sidebar-accent text-sidebar-accent-foreground font-semibold shadow-xs',
        false: 'text-sidebar-foreground/75 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground'
      }
    },
    defaultVariants: { active: false }
  }
);

interface SidebarMenuButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof sidebarMenuButtonVariants> {
  asChild?: boolean;
}

const SidebarMenuButton = React.forwardRef<HTMLButtonElement, SidebarMenuButtonProps>(
  ({ asChild = false, active, className, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return <Comp ref={ref} data-active={active || undefined} className={cn(sidebarMenuButtonVariants({ active, className }))} {...props} />;
  }
);
SidebarMenuButton.displayName = 'SidebarMenuButton';

export {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger
};
