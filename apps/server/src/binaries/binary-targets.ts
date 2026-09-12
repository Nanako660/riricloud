// 二进制平台 target 的唯一事实来源：
// 与 scripts/build-agent.sh --all 的发布矩阵保持一致（agent/singbox × linux/macos/windows × amd64/arm64）。
// 新增平台时只需在此追加，DTO 校验、旧目录认领、旧版分发仓、前端下拉与筛选均从这里派生。
export const BINARY_KINDS = ['AGENT', 'SINGBOX'] as const;
export type ManagedBinaryKind = (typeof BINARY_KINDS)[number];

export const BINARY_TARGET_PLATFORMS = ['linux-amd64', 'linux-arm64', 'macos-amd64', 'macos-arm64', 'windows-amd64'] as const;
export type BinaryTargetPlatform = (typeof BINARY_TARGET_PLATFORMS)[number];

export const BINARY_TARGETS = [
  { kind: 'AGENT', target: 'agent-linux-amd64' },
  { kind: 'AGENT', target: 'agent-linux-arm64' },
  { kind: 'AGENT', target: 'agent-macos-amd64' },
  { kind: 'AGENT', target: 'agent-macos-arm64' },
  { kind: 'AGENT', target: 'agent-windows-amd64' },
  { kind: 'SINGBOX', target: 'singbox-linux-amd64' },
  { kind: 'SINGBOX', target: 'singbox-linux-arm64' },
  { kind: 'SINGBOX', target: 'singbox-macos-amd64' },
  { kind: 'SINGBOX', target: 'singbox-macos-arm64' },
  { kind: 'SINGBOX', target: 'singbox-windows-amd64' }
] as const;

export type BinaryTarget = (typeof BINARY_TARGETS)[number]['target'];

export const BINARY_TARGET_VALUES = BINARY_TARGETS.map((item) => item.target);
