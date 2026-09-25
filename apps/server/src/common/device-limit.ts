export type DeviceLimitSource = 'USER' | 'PLAN' | 'UNLIMITED' | 'GLOBAL_OFF';

export interface EffectiveDeviceLimit {
  configuredDeviceLimit: number | null;
  effectiveDeviceLimit: number | null;
  deviceLimitSource: DeviceLimitSource;
  configuredDeviceLimitSource: Exclude<DeviceLimitSource, 'GLOBAL_OFF'>;
}

/** Resolve user override > subscription plan. A global disable only bypasses enforcement. */
export function resolveEffectiveDeviceLimit(input: {
  globalEnabled: boolean;
  userDeviceLimit?: number | null;
  planDeviceLimit?: number | null;
}): EffectiveDeviceLimit {
  const hasUserOverride = input.userDeviceLimit !== null && input.userDeviceLimit !== undefined;
  const configuredDeviceLimit = hasUserOverride
    ? (input.userDeviceLimit! > 0 ? input.userDeviceLimit! : null)
    : (input.planDeviceLimit != null && input.planDeviceLimit > 0 ? input.planDeviceLimit : null);
  const configuredDeviceLimitSource = hasUserOverride
    ? 'USER'
    : configuredDeviceLimit === null ? 'UNLIMITED' : 'PLAN';
  const globalEnabled = input.globalEnabled;
  return {
    configuredDeviceLimit,
    effectiveDeviceLimit: globalEnabled ? configuredDeviceLimit : null,
    deviceLimitSource: globalEnabled ? configuredDeviceLimitSource : 'GLOBAL_OFF',
    configuredDeviceLimitSource
  };
}
