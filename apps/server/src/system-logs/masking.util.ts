// 敏感信息不可逆脱敏工具（守卫项目安全红线，见 docs/PROJECT_CONSTRAINTS.md §4）

// ANSI CSI escape sequences are intentionally removed before persistence.
// eslint-disable-next-line no-control-regex
const ANSI_CONTROL_PATTERN = /\x1b\[[0-?]*[ -/]*[@-~]/g;
const SENSITIVE_KEY_PATTERN = /(password|passwd|pwd|token|secret|authorization|credential|cookie|privatekey|private.key|publickey|api[-_]?key|jwt|hash)/i;
const PEM_BLOCK_PATTERN = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/gi;
const SENSITIVE_ASSIGNMENT_PATTERN = /((?:password|passwd|pwd|token|secret|api[-_]?key|access[-_]?key|private[-_]?key|public[-_]?key|signing[-_]?key)\s*[=:]\s*)([^\s,;&]+)/gi;
const IPV4_PATTERN = /(?<![\d.])(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}(?![\d.])/g;
const IPV6_PATTERN = /(?<![\w:])(?:[0-9a-f]{1,4}:){2,}[0-9a-f:]{1,4}(?![\w:])/gi;
const DOMAIN_PATTERN = /(?<![@\w-])(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}(?![\w-])/gi;

/**
 * 对字符串内的 Bearer Token、密码字段进行不可逆掩码
 */
export function maskSensitiveString(input: string): string {
  if (!input || typeof input !== 'string') {
    return input;
  }

  // 1. 掩码 Authorization: Bearer <token>
  let result = input.replace(ANSI_CONTROL_PATTERN, '');
  result = result.replace(/(Bearer\s+)([A-Za-z0-9_.-]{8})[A-Za-z0-9_.-]*/gi, '$1$2***');

  // 2. 掩码常见的 URL Query 参数: ?token=xxx&password=xxx
  result = result.replace(/([?&](?:token|password|secret|key|ticket)=)([^&\s]+)/gi, '$1***');
  // 3. 掩码 PEM 私钥与常见 key=value 形式的凭据
  result = result.replace(PEM_BLOCK_PATTERN, '***PRIVATE_KEY***');
  result = result.replace(SENSITIVE_ASSIGNMENT_PATTERN, '$1***');
  // 4. 诊断日志可能包含连接目标；默认仅保留结构，不保留可识别的主机信息
  result = result.replace(IPV4_PATTERN, '[redacted-ip]');
  result = result.replace(IPV6_PATTERN, '[redacted-ip]');
  result = result.replace(DOMAIN_PATTERN, '[redacted-host]');

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
