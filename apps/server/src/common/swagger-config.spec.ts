import { parseBooleanFlag, shouldEnableSwagger } from './swagger-config';

describe('swagger-config', () => {
  describe('parseBooleanFlag', () => {
    it('parses truthy values correctly', () => {
      expect(parseBooleanFlag('true')).toBe(true);
      expect(parseBooleanFlag('TRUE')).toBe(true);
      expect(parseBooleanFlag(' 1 ')).toBe(true);
      expect(parseBooleanFlag('yes')).toBe(true);
      expect(parseBooleanFlag('ON')).toBe(true);
    });

    it('parses falsy values correctly', () => {
      expect(parseBooleanFlag('false')).toBe(false);
      expect(parseBooleanFlag('FALSE')).toBe(false);
      expect(parseBooleanFlag(' 0 ')).toBe(false);
      expect(parseBooleanFlag('no')).toBe(false);
      expect(parseBooleanFlag('off')).toBe(false);
    });

    it('returns undefined for invalid or undefined values', () => {
      expect(parseBooleanFlag(undefined)).toBeUndefined();
      expect(parseBooleanFlag('')).toBeUndefined();
      expect(parseBooleanFlag('unknown')).toBeUndefined();
      expect(parseBooleanFlag('2')).toBeUndefined();
    });
  });

  describe('shouldEnableSwagger', () => {
    it('defaults to true in non-production development environments', () => {
      expect(shouldEnableSwagger({}, false)).toBe(true);
      expect(shouldEnableSwagger({ NODE_ENV: 'development' })).toBe(true);
      expect(shouldEnableSwagger({ NODE_ENV: 'test' })).toBe(true);
    });

    it('defaults to false in production-like environments', () => {
      expect(shouldEnableSwagger({}, true)).toBe(false);
      expect(shouldEnableSwagger({ NODE_ENV: 'production' })).toBe(false);
      expect(shouldEnableSwagger({ RIRICLOUD_ENV: 'production' })).toBe(false);
    });

    it('enables swagger in production if ENABLE_SWAGGER is set to true', () => {
      expect(shouldEnableSwagger({ NODE_ENV: 'production', ENABLE_SWAGGER: 'true' })).toBe(true);
      expect(shouldEnableSwagger({ NODE_ENV: 'production', ENABLE_SWAGGER: '1' })).toBe(true);
      expect(shouldEnableSwagger({ NODE_ENV: 'production', ENABLE_SWAGGER: 'yes' })).toBe(true);
      expect(shouldEnableSwagger({ NODE_ENV: 'production', ENABLE_SWAGGER: 'on' })).toBe(true);
    });

    it('disables swagger in development if ENABLE_SWAGGER is set to false', () => {
      expect(shouldEnableSwagger({ NODE_ENV: 'development', ENABLE_SWAGGER: 'false' })).toBe(false);
      expect(shouldEnableSwagger({ NODE_ENV: 'development', ENABLE_SWAGGER: '0' })).toBe(false);
      expect(shouldEnableSwagger({ NODE_ENV: 'development', ENABLE_SWAGGER: 'no' })).toBe(false);
      expect(shouldEnableSwagger({ NODE_ENV: 'development', ENABLE_SWAGGER: 'off' })).toBe(false);
    });

    it('supports RIRICLOUD_ENABLE_SWAGGER fallback when ENABLE_SWAGGER is not provided', () => {
      expect(
        shouldEnableSwagger({
          NODE_ENV: 'production',
          RIRICLOUD_ENABLE_SWAGGER: 'true'
        })
      ).toBe(true);
      expect(
        shouldEnableSwagger({
          NODE_ENV: 'development',
          RIRICLOUD_ENABLE_SWAGGER: 'false'
        })
      ).toBe(false);
    });

    it('prefers ENABLE_SWAGGER over RIRICLOUD_ENABLE_SWAGGER when both are configured', () => {
      expect(
        shouldEnableSwagger({
          NODE_ENV: 'production',
          ENABLE_SWAGGER: 'false',
          RIRICLOUD_ENABLE_SWAGGER: 'true'
        })
      ).toBe(false);
      expect(
        shouldEnableSwagger({
          NODE_ENV: 'production',
          ENABLE_SWAGGER: 'true',
          RIRICLOUD_ENABLE_SWAGGER: 'false'
        })
      ).toBe(true);
    });

    it('falls back to environment default when configured value is invalid', () => {
      expect(
        shouldEnableSwagger({
          NODE_ENV: 'production',
          ENABLE_SWAGGER: 'invalid_value'
        })
      ).toBe(false);
      expect(
        shouldEnableSwagger({
          NODE_ENV: 'development',
          ENABLE_SWAGGER: 'invalid_value'
        })
      ).toBe(true);
    });
  });
});
