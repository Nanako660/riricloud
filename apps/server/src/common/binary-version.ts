// 二进制资源版本口径工具：统一 Agent/Sing-box 资源的版本展示与对账比较规则。

// 资源版本展示：AGENT 类资源 revision=1 时不追加 -rN 后缀（与二进制编译版本一致，
// 升级任务目标版本可与心跳 agentVersion 直接对齐）；revision>1 保留 -rN 区分重构建；
// SINGBOX 维持 `X-rN` 既有口径（定制内核重构建是常态）。
export function formatBinaryVersion(kind: string | null | undefined, upstreamVersion: string, revision: number): string {
  if ((kind ?? '').toUpperCase() === 'AGENT' && revision === 1) {
    return upstreamVersion;
  }
  return `${upstreamVersion}-r${revision}`;
}

// 升级版本对账归一化：剥离历史任务 payload 可能携带的 -rN 重构建后缀，仅比较基础版本。
// Agent 心跳上报的编译版本本身不含该后缀，运行时可观测版本只有基础版本。
export function normalizeBinaryVersion(version: string | null | undefined): string {
  return (version ?? '').replace(/-r\d+$/i, '');
}
