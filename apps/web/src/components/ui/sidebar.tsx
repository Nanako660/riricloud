import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const SidebarProvider = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn('group/sidebar-wrapper flex min-h-svh w-full', className)} {...props} />
);
SidebarProvider.displayName = 'SidebarProvider';

const Sidebar = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>(
  ({ className, ...props }, ref) => <aside ref={ref} data-sidebar="sidebar" className={cn('bg-sidebar text-sidebar-foreground hidden h-svh w-60 shrink-0 flex-col border-r border-sidebar-border md:flex', className)} {...props} />
);
Sidebar.displayName = 'Sidebar';

const SidebarHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} data-sidebar="header" className={cn('flex w-full shrink-0 flex-col gap-2 px-5 py-4', className)} {...props} />
);
SidebarHeader.displayName = 'SidebarHeader';

const SidebarContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} data-sidebar="content" className={cn('flex min-h-0 flex-1 flex-col gap-2 overflow-auto px-3 py-2', className)} {...props} />
);
SidebarContent.displayName = 'SidebarContent';

const SidebarFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} data-sidebar="footer" className={cn('flex w-full shrink-0 flex-col gap-2 px-5 py-4', className)} {...props} />
);
SidebarFooter.displayName = 'SidebarFooter';

const SidebarInset = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} data-sidebar="inset" className={cn('bg-background flex min-w-0 flex-1 flex-col', className)} {...props} />
);
SidebarInset.displayName = 'SidebarInset';

const SidebarGroup = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} data-sidebar="group" className={cn('relative flex w-full min-w-0 flex-col', className)} {...props} />
);
SidebarGroup.displayName = 'SidebarGroup';

const SidebarGroupLabel = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} data-sidebar="group-label" className={cn('text-sidebar-foreground/65 flex h-8 shrink-0 items-center px-3 text-xs font-medium', className)} {...props} />
);
SidebarGroupLabel.displayName = 'SidebarGroupLabel';

const SidebarMenu = React.forwardRef<HTMLUListElement, React.HTMLAttributes<HTMLUListElement>>(
  ({ className, ...props }, ref) => <ul ref={ref} data-sidebar="menu" className={cn('flex w-full min-w-0 flex-col gap-1', className)} {...props} />
);
SidebarMenu.displayName = 'SidebarMenu';

const SidebarMenuItem = React.forwardRef<HTMLLIElement, React.LiHTMLAttributes<HTMLLIElement>>(
  ({ className, ...props }, ref) => <li ref={ref} data-sidebar="menu-item" className={cn('group/menu-item relative', className)} {...props} />
);
SidebarMenuItem.displayName = 'SidebarMenuItem';

const sidebarMenuButtonVariants = cva(
  'flex w-full items-center gap-3 overflow-hidden rounded-md px-3 py-2 text-left text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sidebar-ring disabled:pointer-events-none disabled:opacity-50 [&>svg]:size-4 [&>svg]:shrink-0',
  {
    variants: {
      active: {
        true: 'bg-sidebar-accent text-sidebar-accent-foreground',
        false: 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
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
  SidebarProvider
};
