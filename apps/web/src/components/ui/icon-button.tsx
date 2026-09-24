import * as React from 'react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export interface IconButtonProps extends ButtonProps {
  'aria-label': string;
  tooltip?: React.ReactNode;
  tooltipSide?: 'top' | 'right' | 'bottom' | 'left';
  tooltipClassName?: string;
}

const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    {
      'aria-label': ariaLabel,
      title,
      tooltip,
      tooltipSide = 'top',
      tooltipClassName,
      asChild = false,
      type,
      size = 'icon',
      ...props
    },
    ref
  ) => {
    const tooltipContent = tooltip ?? title ?? ariaLabel;
    const button = (
      <Button
        {...props}
        ref={ref}
        asChild={asChild}
        size={size}
        type={type ?? (asChild ? undefined : 'button')}
        aria-label={ariaLabel}
      />
    );

    return (
      <Tooltip>
        <TooltipTrigger asChild>
          {props.disabled ? <span className="inline-flex">{button}</span> : button}
        </TooltipTrigger>
        <TooltipContent side={tooltipSide} className={tooltipClassName}>
          {tooltipContent}
        </TooltipContent>
      </Tooltip>
    );
  }
);

IconButton.displayName = 'IconButton';

export { IconButton };
