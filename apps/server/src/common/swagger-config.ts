const TRUTHY_VALUES = new Set(['true', '1', 'yes', 'on']);
const FALSY_VALUES = new Set(['false', '0', 'no', 'off']);

export function parseBooleanFlag(value: string | undefined): boolean | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  if (TRUTHY_VALUES.has(normalized)) return true;
  if (FALSY_VALUES.has(normalized)) return false;
  return undefined;
}

export function shouldEnableSwagger(
  env: NodeJS.ProcessEnv = process.env,
  productionLike = env.NODE_ENV === 'production' || env.RIRICLOUD_ENV === 'production'
): boolean {
  const configuredValue = env.ENABLE_SWAGGER ?? env.RIRICLOUD_ENABLE_SWAGGER;
  const parsed = parseBooleanFlag(configuredValue);
  if (parsed !== undefined) {
    return parsed;
  }
  return !productionLike;
}
