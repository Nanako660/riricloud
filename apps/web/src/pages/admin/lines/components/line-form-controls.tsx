import { Plus, Trash2 } from 'lucide-react';
import { useFieldArray, type FieldPath, type UseFormReturn } from 'react-hook-form';
import type { InputHTMLAttributes, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import type { LineFormValues } from './line-form-schema';

type FieldName = FieldPath<LineFormValues>;

interface BaseFieldProps {
  form: UseFormReturn<LineFormValues>;
  name: FieldName;
  label: string;
  description?: string;
  placeholder?: string;
  disabled?: boolean;
  inputProps?: InputHTMLAttributes<HTMLInputElement>;
}

export function TextField({ form, name, label, description, placeholder, disabled, inputProps, type = 'text' }: BaseFieldProps & { type?: string }) {
  return (
    <FormField control={form.control} name={name} render={({ field }) => (
      <FormItem>
        <FormLabel>{label}</FormLabel>
        <FormControl><Input type={type} placeholder={placeholder} disabled={disabled} {...field} {...inputProps} value={field.value == null ? '' : String(field.value)} /></FormControl>
        {description && <FormDescription>{description}</FormDescription>}
        <FormMessage />
      </FormItem>
    )} />
  );
}

export function NumberField({ min, max, step, ...props }: BaseFieldProps & { min?: number; max?: number; step?: number }) {
  return <TextField {...props} type="number" inputProps={{ min, max, step }} />;
}

export function SelectField({ form, name, label, options, description, disabled, onValueChange }: BaseFieldProps & { options: Array<{ value: string; label: string }>; onValueChange?: (value: string) => void }) {
  return (
    <FormField control={form.control} name={name} render={({ field }) => (
      <FormItem>
        <FormLabel>{label}</FormLabel>
        <Select value={String(field.value ?? '')} onValueChange={(value) => { field.onChange(value); onValueChange?.(value); }} disabled={disabled}>
          <FormControl><SelectTrigger><SelectValue placeholder="请选择" /></SelectTrigger></FormControl>
          <SelectContent>{options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
        </Select>
        {description && <FormDescription>{description}</FormDescription>}
        <FormMessage />
      </FormItem>
    )} />
  );
}

export function SwitchField({ form, name, label, description }: Pick<BaseFieldProps, 'form' | 'name' | 'label' | 'description'>) {
  return (
    <FormField control={form.control} name={name} render={({ field }) => (
      <FormItem className="flex items-center justify-between gap-4">
        <div><FormLabel>{label}</FormLabel>{description && <FormDescription>{description}</FormDescription>}</div>
        <FormControl><Switch checked={Boolean(field.value)} onCheckedChange={field.onChange} /></FormControl>
      </FormItem>
    )} />
  );
}

type HeaderFieldName = 'wsHeaders' | 'httpHeaders';

export function HeaderEditor({ form, name, label }: { form: UseFormReturn<LineFormValues>; name: HeaderFieldName; label: string }) {
  const { fields, append, remove } = useFieldArray({ control: form.control, name });
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div><p className="text-sm font-medium">{label}</p><p className="text-xs text-muted-foreground">请求头会按键值对写入传输配置。</p></div>
        <Button type="button" size="sm" variant="outline" onClick={() => append({ key: '', value: '' })}><Plus />添加</Button>
      </div>
      {fields.length === 0 && <p className="text-xs text-muted-foreground">暂无自定义请求头</p>}
      {fields.map((field, index) => (
        <div key={field.id} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <Input aria-label={`${label}键 ${index + 1}`} placeholder="键" {...form.register(`${name}.${index}.key` as const)} />
          <Input aria-label={`${label}值 ${index + 1}`} placeholder="值" {...form.register(`${name}.${index}.value` as const)} />
          <Button type="button" size="icon" variant="ghost" aria-label={`删除${label}${index + 1}`} onClick={() => remove(index)}><Trash2 /></Button>
        </div>
      ))}
    </div>
  );
}

export function FieldGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-3 md:grid-cols-2">{children}</div>;
}
