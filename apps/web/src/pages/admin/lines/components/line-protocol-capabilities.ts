import type { LineFormValues } from './line-form-schema';

const PROTOCOLS_WITH_SPECIFIC_FIELDS = new Set<LineFormValues['protocolType']>([
  'VLESS', 'VMESS', 'HYSTERIA2', 'TUIC', 'SHADOWSOCKS', 'NAIVE', 'SHADOWTLS',
  'MIXED', 'SOCKS', 'HTTP', 'DIRECT'
]);

export function hasProtocolSpecificFields(protocol: LineFormValues['protocolType']) {
  return PROTOCOLS_WITH_SPECIFIC_FIELDS.has(protocol);
}
