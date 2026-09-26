// 二进制平台 target 的唯一事实来源：
// 与 scripts/build-agent.sh --all 的发布矩阵保持一致（agent × linux/macos/windows × amd64/arm64）。
// Sing-box 内核已内嵌封装于 riri-agent 中，资源中心仅管理 Agent 二进制。
export const BINARY_KINDS = ['AGENT'] as const;
export type ManagedBinaryKind = (typeof BINARY_KINDS)[number];

export const BINARY_TARGET_PLATFORMS = ['linux-amd64', 'linux-arm64', 'macos-amd64', 'macos-arm64', 'windows-amd64'] as const;
export type BinaryTargetPlatform = (typeof BINARY_TARGET_PLATFORMS)[number];

export const BINARY_TARGETS = [
  { kind: 'AGENT', target: 'agent-linux-amd64' },
  { kind: 'AGENT', target: 'agent-linux-arm64' },
  { kind: 'AGENT', target: 'agent-macos-amd64' },
  { kind: 'AGENT', target: 'agent-macos-arm64' },
  { kind: 'AGENT', target: 'agent-windows-amd64' }
] as const;

export type BinaryTarget = (typeof BINARY_TARGETS)[number]['target'];

export const BINARY_TARGET_VALUES = BINARY_TARGETS.map((item) => item.target);

