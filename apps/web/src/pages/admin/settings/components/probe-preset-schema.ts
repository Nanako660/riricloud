import { z } from 'zod';

export type ProbePresetType = 'tcp' | 'dns' | 'icmp';

export interface ProbePresetTarget {
  type: ProbePresetType;
  target: string;
  port?: number;
  timeoutMs?: number;
}

export const MAX_PROBE_PRESETS = 32;

export const probePresetFormSchema = z.object({
  type: z.enum(['tcp', 'dns', 'icmp']),
  target: z.string().trim().min(1, '请输入目标地址').max(255, '目标地址不能超过 255 个字符'),
  port: z.string().trim(),
  timeoutMs: z.string().trim()
}).superRefine((value, context) => {
  if (value.type === 'tcp' && !value.port) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['port'], message: 'TCP 探针必须填写端口' });
  }
  if (value.port && !isIntegerInRange(value.port, 1, 65535)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['port'], message: '端口范围为 1-65535' });
  }
  if (value.timeoutMs && !isIntegerInRange(value.timeoutMs, 100, 10000)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['timeoutMs'], message: '超时范围为 100-10000 毫秒' });
  }
});

export const probePresetTargetsSchema = z.array(probePresetFormSchema).max(MAX_PROBE_PRESETS, `最多配置 ${MAX_PROBE_PRESETS} 个探针目标`);

export const probePresetEditorSchema = z.object({ probePresetTargets: probePresetTargetsSchema });

export type ProbePresetFormValue = z.infer<typeof probePresetFormSchema>;
export type ProbePresetEditorValues = z.infer<typeof probePresetEditorSchema>;

export const EMPTY_PROBE_PRESET: ProbePresetFormValue = {
  type: 'tcp',
  target: '',
  port: '443',
  timeoutMs: '5000'
};

export function toProbePresetFormValue(target: ProbePresetTarget): ProbePresetFormValue {
  return {
    type: target.type,
    target: target.target,
    port: target.port == null ? '' : String(target.port),
    timeoutMs: target.timeoutMs == null ? '' : String(target.timeoutMs)
  };
}

export function toProbePresetTarget(value: ProbePresetFormValue): ProbePresetTarget {
  return {
    type: value.type,
    target: value.target.trim(),
    ...(value.type === 'tcp' && value.port ? { port: Number(value.port) } : {}),
    ...(value.timeoutMs ? { timeoutMs: Number(value.timeoutMs) } : {})
  };
}

function isIntegerInRange(value: string, min: number, max: number) {
  return /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) >= min && Number(value) <= max;
}
