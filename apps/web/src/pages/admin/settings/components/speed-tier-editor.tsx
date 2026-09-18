import { useFieldArray, useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Plus, RotateCcw, Trash2, Zap } from 'lucide-react';
import type { SettingsForm } from '../index';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FormControl, FormField, FormItem, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  DEFAULT_SPEED_TIERS,
  DEFAULT_SPEED_COLOR_MAP,
  SPEED_COLOR_OPTIONS,
  type SpeedColorKey
} from '@/lib/speed-tier';

const speedColorKeyMap: Record<SpeedColorKey, 'admin:settings.speedColor_blue' | 'admin:settings.speedColor_cyan' | 'admin:settings.speedColor_emerald' | 'admin:settings.speedColor_amber' | 'admin:settings.speedColor_violet' | 'admin:settings.speedColor_rose'> = {
  blue: 'admin:settings.speedColor_blue',
  cyan: 'admin:settings.speedColor_cyan',
  emerald: 'admin:settings.speedColor_emerald',
  amber: 'admin:settings.speedColor_amber',
  violet: 'admin:settings.speedColor_violet',
  rose: 'admin:settings.speedColor_rose'
};

export function SpeedTierEditor() {
  const { t } = useTranslation(['admin', 'common']);
  const { control, setValue } = useFormContext<SettingsForm>();
  const { fields, append, remove } = useFieldArray({
    control,
    name: 'speedLimitColorTiers'
  });

  const resetToDefault = () => {
    setValue('speedLimitColorTiers', [...DEFAULT_SPEED_TIERS], { shouldDirty: true, shouldValidate: true });
  };

  return (
    <div className="rounded-lg border bg-muted/20 p-4 space-y-4 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-0.5">
          <h4 className="text-sm font-semibold">{t('admin:settings.speedTierTitle')}</h4>
          <p className="text-xs text-muted-foreground">
            {t('admin:settings.speedTierDesc')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1 text-xs text-muted-foreground"
            onClick={resetToDefault}
          >
            <RotateCcw className="size-3.5" />
            {t('admin:settings.speedTierReset')}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1 text-xs"
            disabled={fields.length >= 8}
            onClick={() => append({ maxMbps: null, color: 'violet' })}
          >
            <Plus className="size-3.5" />
            {t('admin:settings.speedTierAdd')}
          </Button>
        </div>
      </div>

      <div className="space-y-2.5">
        {fields.map((field, index) => (
          <SpeedTierRow
            key={field.id}
            index={index}
            isOnlyOne={fields.length <= 1}
            onRemove={() => remove(index)}
          />
        ))}
      </div>
    </div>
  );
}

function SpeedTierRow({
  index,
  isOnlyOne,
  onRemove
}: {
  index: number;
  isOnlyOne: boolean;
  onRemove: () => void;
}) {
  const { t } = useTranslation(['admin', 'common']);
  const { control, watch } = useFormContext<SettingsForm>();
  const tier = watch(`speedLimitColorTiers.${index}`);
  const maxMbps = tier?.maxMbps;
  const color = tier?.color || 'blue';

  const previewText = maxMbps ? `${maxMbps}M` : t('admin:settings.speedTierHighest');
  const badgeClass = DEFAULT_SPEED_COLOR_MAP[color] || DEFAULT_SPEED_COLOR_MAP.blue;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border bg-card/60 p-2.5">
      <div className="flex items-center gap-2 flex-1 min-w-[200px]">
        <span className="text-xs text-muted-foreground shrink-0 font-mono w-14">
          {t('admin:settings.speedTierRowLabel', { index: index + 1 })}
        </span>
        <FormField
          control={control}
          name={`speedLimitColorTiers.${index}.maxMbps`}
          render={({ field }) => (
            <FormItem className="flex-1 space-y-0">
              <FormControl>
                <Input
                  type="number"
                  min={1}
                  placeholder={t('admin:settings.speedTierUnlimitedPlaceholder')}
                  className="h-8 text-xs"
                  value={field.value == null ? '' : field.value}
                  onChange={(e) => {
                    const val = e.target.value.trim();
                    field.onChange(val === '' ? null : Number(val));
                  }}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <span className="text-xs text-muted-foreground shrink-0">Mbps</span>
      </div>

      <div className="flex items-center gap-2 min-w-[140px]">
        <FormField
          control={control}
          name={`speedLimitColorTiers.${index}.color`}
          render={({ field }) => (
            <FormItem className="flex-1 space-y-0">
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder={t('admin:settings.speedTierColorPlaceholder')} />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {SPEED_COLOR_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value} className="text-xs">
                      <div className="flex items-center gap-2">
                        <span className={cn('size-2 rounded-full shrink-0', opt.dotClass)} />
                        <span>{t(speedColorKeyMap[opt.value])}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <span className="text-xs text-muted-foreground">{t('admin:settings.speedTierPreview')}</span>
        <Badge variant="outline" className={cn('gap-1 text-xs font-normal py-0.5', badgeClass)}>
          <Zap className="size-3" />
          {previewText}
        </Badge>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 text-muted-foreground hover:text-destructive shrink-0 ml-1"
          disabled={isOnlyOne}
          onClick={onRemove}
          title={t('admin:settings.speedTierDelete')}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
