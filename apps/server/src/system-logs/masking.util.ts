// 敏感信息不可逆脱敏工具（守卫项目安全红线，见 docs/PROJECT_CONSTRAINTS.md §4）

const SENSITIVE_KEY_PATTERN = /(password|token|secret|authorization|credential|cookie|privatekey|jwt|hash)/i;

/**
 * 对字符串内的 Bearer Token、密码字段进行不可逆掩码
 */
export function maskSensitiveString(input: string): string {
  if (!input || typeof input !== 'string') {
    return input;
  }

  // 1. 掩码 Authorization: Bearer <token>
  let result = input.replace(/(Bearer\s+)([A-Za-z0-9_.-]{8})[A-Za-z0-9_.-]*/gi, '$1$2***');

  // 2. 掩码常见的 URL Query 参数: ?token=xxx&password=xxx
  result = result.replace(/([?&](?:token|password|secret|key|ticket)=)([^&\s]+)/gi, '$1***');

  return result;
}

/**
 * 递归深克隆并脱敏 JSON 对象或元数据
 */
export function sanitizeLogMetadata<T = unknown>(data: T): T {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data === 'string') {
    return maskSensitiveString(data) as unknown as T;
  }

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeLogMetadata(item)) as unknown as T;
  }

  if (typeof data === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        if (typeof value === 'string') {
          if (/^Bearer\s+/i.test(value)) {
            sanitized[key] = maskSensitiveString(value);
          } else if (value.length > 8) {
            sanitized[key] = `${value.slice(0, 4)}***${value.slice(-2)}`;
          } else {
            sanitized[key] = '***';
          }
        } else {
          sanitized[key] = '***';
        }
      } else if (typeof value === 'object') {
        sanitized[key] = sanitizeLogMetadata(value);
      } else if (typeof value === 'string') {
        sanitized[key] = maskSensitiveString(value);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized as T;
  }

  return data;
}
