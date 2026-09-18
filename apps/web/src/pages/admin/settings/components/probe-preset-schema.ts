import { z } from 'zod';
import i18n from '@/i18n/config';

export type ProbePresetType = 'tcp' | 'dns' | 'icmp';

export interface ProbePresetTarget {
  type: ProbePresetType;
  target: string;
  port?: number;
  timeoutMs?: number;
}

export const MAX_PROBE_PRESETS = 32;

export function createProbePresetFormSchema() {
  return z.object({
    type: z.enum(['tcp', 'dns', 'icmp']),
    target: z
      .string()
      .trim()
      .min(1, i18n.t('admin:settings.probePresetErrTargetReq'))
      .max(255, i18n.t('admin:settings.probePresetErrTargetMax')),
    port: z.string().trim(),
    timeoutMs: z.string().trim()
  }).superRefine((value, context) => {
    if (value.type === 'tcp' && !value.port) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['port'],
        message: i18n.t('admin:settings.probePresetErrPortReq')
      });
    }
    if (value.port && !isIntegerInRange(value.port, 1, 65535)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['port'],
        message: i18n.t('admin:settings.probePresetErrPortRange')
      });
    }
    if (value.timeoutMs && !isIntegerInRange(value.timeoutMs, 100, 10000)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['timeoutMs'],
        message: i18n.t('admin:settings.probePresetErrTimeoutRange')
      });
    }
  });
}

export function createProbePresetTargetsSchema() {
  return z
    .array(createProbePresetFormSchema())
    .max(
      MAX_PROBE_PRESETS,
      i18n.t('admin:settings.probePresetErrMaxTargets', { max: MAX_PROBE_PRESETS })
    );
}

export function createProbePresetEditorSchema() {
  return z.object({ probePresetTargets: createProbePresetTargetsSchema() });
}

export const probePresetFormSchema = createProbePresetFormSchema();
export const probePresetTargetsSchema = createProbePresetTargetsSchema();
export const probePresetEditorSchema = createProbePresetEditorSchema();

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
