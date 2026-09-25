import { resolveEffectiveDeviceLimit } from './device-limit';

describe('resolveEffectiveDeviceLimit', () => {
  it('uses plan limit when user follows plan', () => {
    expect(resolveEffectiveDeviceLimit({ globalEnabled: true, userDeviceLimit: null, planDeviceLimit: 3 })).toMatchObject({
      configuredDeviceLimit: 3, effectiveDeviceLimit: 3, deviceLimitSource: 'PLAN'
    });
  });

  it('uses positive user override before plan', () => {
    expect(resolveEffectiveDeviceLimit({ globalEnabled: true, userDeviceLimit: 2, planDeviceLimit: 5 })).toMatchObject({
      configuredDeviceLimit: 2, effectiveDeviceLimit: 2, deviceLimitSource: 'USER'
    });
  });

  it('supports explicit unlimited override and unlimited plan', () => {
    expect(resolveEffectiveDeviceLimit({ globalEnabled: true, userDeviceLimit: 0, planDeviceLimit: 5 }).effectiveDeviceLimit).toBeNull();
    expect(resolveEffectiveDeviceLimit({ globalEnabled: true, userDeviceLimit: null, planDeviceLimit: 0 }).configuredDeviceLimitSource).toBe('UNLIMITED');
  });

  it('preserves configured limit for display while global enforcement is disabled', () => {
    expect(resolveEffectiveDeviceLimit({ globalEnabled: false, userDeviceLimit: null, planDeviceLimit: 4 })).toEqual({
      configuredDeviceLimit: 4,
      effectiveDeviceLimit: null,
      deviceLimitSource: 'GLOBAL_OFF',
      configuredDeviceLimitSource: 'PLAN'
    });
  });
});
