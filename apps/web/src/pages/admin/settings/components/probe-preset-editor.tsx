import { Fragment, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useFieldArray, useForm, useFormContext, useWatch } from 'react-hook-form';
import { Plus, Settings2, Trash2 } from 'lucide-react';
import type { SettingsForm } from '../index';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  EMPTY_PROBE_PRESET,
  MAX_PROBE_PRESETS,
  probePresetEditorSchema,
  type ProbePresetEditorValues,
  type ProbePresetFormValue,
  type ProbePresetType
} from './probe-preset-schema';

export function ProbePresetEditor() {
  const { control, setValue } = useFormContext<SettingsForm>();
  const value = useWatch({ control, name: 'probePresetTargets' }) ?? [];

  return (
    <div className="space-y-3 md:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">默认探针目标</p>
          <p className="text-[0.8rem] text-muted-foreground">配置后会作为节点探针弹窗的快速预设，列表顺序会保留。</p>
        </div>
        <ProbePresetDialog
          value={value}
          onApply={(nextValue) => setValue('probePresetTargets', nextValue, { shouldDirty: true, shouldValidate: true })}
        />
      </div>
    </div>
  );
}

function ProbePresetDialog({ value, onApply }: { value: ProbePresetFormValue[]; onApply: (value: ProbePresetFormValue[]) => void }) {
  const [open, setOpen] = useState(false);
  const form = useForm<ProbePresetEditorValues>({
    resolver: zodResolver(probePresetEditorSchema),
    defaultValues: { probePresetTargets: [] }
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'probePresetTargets' });

  const openEditor = () => {
    form.reset({ probePresetTargets: value });
    setOpen(true);
  };
  const apply = form.handleSubmit((values) => {
    onApply(values.probePresetTargets);
    setOpen(false);
  });

  return (
    <>
      <div className="flex items-center gap-3">
        <span className="text-xs tabular-nums text-muted-foreground">{value.length} / {MAX_PROBE_PRESETS} 项</span>
        <Button type="button" variant="outline" size="sm" onClick={openEditor}><Settings2 />管理探针目标</Button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="wide">
          <DialogHeader>
            <DialogTitle>管理默认探针目标</DialogTitle>
            <DialogDescription>配置节点探针弹窗中的快速预设。最多 {MAX_PROBE_PRESETS} 项，取消关闭不会修改当前设置。</DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form className="space-y-6" onSubmit={apply}>
              {fields.length ? (
                <div className="space-y-6">
                  {fields.map((field, index) => <Fragment key={field.id}>{index > 0 ? <Separator /> : null}<ProbePresetRow index={index} onRemove={() => remove(index)} /></Fragment>)}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">暂无自定义探针目标，节点探针弹窗将使用内置快速预设。</p>
              )}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Button type="button" variant="outline" size="sm" disabled={fields.length >= MAX_PROBE_PRESETS} onClick={() => append({ ...EMPTY_PROBE_PRESET })}><Plus />添加探针目标</Button>
                <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>取消</Button><Button type="submit">应用</Button></DialogFooter>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ProbePresetRow({ index, onRemove }: { index: number; onRemove: () => void }) {
  const { control, getValues, setValue } = useFormContext<ProbePresetEditorValues>();
  const type = useWatch({ control, name: `probePresetTargets.${index}.type` });

  const changeType = (nextType: ProbePresetType) => {
    setValue(`probePresetTargets.${index}.type`, nextType, { shouldDirty: true, shouldValidate: true });
    if (nextType === 'tcp') {
      const currentPort = getValues(`probePresetTargets.${index}.port`);
      if (!currentPort) setValue(`probePresetTargets.${index}.port`, '443', { shouldDirty: true, shouldValidate: true });
      return;
    }
    setValue(`probePresetTargets.${index}.port`, '', { shouldDirty: true, shouldValidate: true });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium">目标 {index + 1}</p>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button type="button" variant="ghost" size="icon" aria-label={`删除目标 ${index + 1}`} onClick={onRemove}><Trash2 /></Button>
          </TooltipTrigger>
          <TooltipContent>删除此目标</TooltipContent>
        </Tooltip>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <FormField control={control} name={`probePresetTargets.${index}.type`} render={({ field }) => <FormItem><FormLabel>探针类型</FormLabel><Select value={field.value} onValueChange={(value) => changeType(value as ProbePresetType)}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent><SelectItem value="tcp">TCP 连接</SelectItem><SelectItem value="dns">DNS 解析</SelectItem><SelectItem value="icmp">ICMP Ping</SelectItem></SelectContent></Select><FormMessage /></FormItem>} />
        <FormField control={control} name={`probePresetTargets.${index}.target`} render={({ field }) => <FormItem><FormLabel>目标地址</FormLabel><FormControl><Input placeholder={type === 'icmp' ? '例如 1.1.1.1' : '例如 example.com'} {...field} /></FormControl><FormMessage /></FormItem>} />
        {type === 'tcp' ? <FormField control={control} name={`probePresetTargets.${index}.port`} render={({ field }) => <FormItem><FormLabel>端口</FormLabel><FormControl><Input type="number" min={1} max={65535} placeholder="443" {...field} /></FormControl><FormMessage /></FormItem>} /> : null}
        <FormField control={control} name={`probePresetTargets.${index}.timeoutMs`} render={({ field }) => <FormItem><FormLabel>超时（毫秒）</FormLabel><FormControl><Input type="number" min={100} max={10000} placeholder="5000" {...field} /></FormControl><FormMessage /></FormItem>} />
      </div>
    </div>
  );
}
