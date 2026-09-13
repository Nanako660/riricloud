import { Injectable, Optional } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SettingsService, DEFAULT_GITHUB_MIRRORS } from '../system/settings.service';
import { BinariesService, type BinaryTarget } from './binaries.service';

export type InstallerPlatform = {
  // 主控内置目标平台（agent-linux-amd64 等），用于解析回退下载与 sha256
  platform: string;
};

type RenderOptions = {
  // GitHub Release 的 os/arch 命名（darwin 与主控 macos 目标不同名）
  releaseOs: 'linux' | 'darwin' | 'windows';
  releaseArch: 'amd64' | 'arm64';
  agentVersion: string;
  githubRepoUrl: string;
  mirrors: string[];
  fallbackUrl: string;
  fallbackSha256: string;
};

const MAX_SPEEDTEST_CANDIDATES = 10;

// GitHub Release 下载 URL：agent-v<Tag>/riri-agent_<ver>_<os>_<arch>.<ext>（见 scripts/release.sh 资产命名）
function releaseAssetPath(agentVersion: string, releaseOs: string, releaseArch: string): string {
  const extension = releaseOs === 'windows' ? 'zip' : 'tar.gz';
  return `releases/download/agent-v${agentVersion}/riri-agent_${agentVersion}_${releaseOs}_${releaseArch}.${extension}`;
}

function normalizeMirrorList(mirrors: string[]): string[] {
  const normalized = mirrors
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => (item.includes('://') ? item : `https://${item}`));
  const deduped = Array.from(new Set(normalized));
  const list = deduped.length ? deduped : [...DEFAULT_GITHUB_MIRRORS];
  return list.slice(0, MAX_SPEEDTEST_CANDIDATES - 1);
}

@Injectable()
export class BinariesInstallerService {
  constructor(
    private readonly binaries: BinariesService,
    @Optional() private readonly settingsService?: SettingsService
  ) {}

  // 渲染 POSIX 安装脚本：GitHub Release 优先（直连 + 镜像测速择优），主控内置二进制兜底。
  async renderShellScript(platform: string, requestBaseUrl?: string): Promise<string> {
    const options = await this.resolveRenderOptions(platform, requestBaseUrl);
    const assetPath = releaseAssetPath(options.agentVersion, options.releaseOs, options.releaseArch);
    const githubUrl = `${options.githubRepoUrl.replace(/\/+$/, '')}/${assetPath}`;
    const mirrors = normalizeMirrorList(options.mirrors);
    const body = POSIX_INSTALLER_TEMPLATE
      .replaceAll('__RIRI_VERSION__', options.agentVersion)
      .replaceAll('__RIRI_GITHUB_URL__', githubUrl)
      .replaceAll('__RIRI_MIRRORS__', mirrors.join(' '))
      .replaceAll('__RIRI_FALLBACK_URL__', options.fallbackUrl)
      .replaceAll('__RIRI_FALLBACK_SHA256__', options.fallbackSha256)
      .replaceAll('__RIRI_ASSET__', `riri-agent_${options.agentVersion}_${options.releaseOs}_${options.releaseArch}.tar.gz`);
    return body;
  }

  // 渲染 Windows PowerShell 安装脚本：逻辑与 POSIX 版一致。
  async renderPowershellScript(platform: string, requestBaseUrl?: string): Promise<string> {
    const options = await this.resolveRenderOptions(platform, requestBaseUrl);
    const assetPath = releaseAssetPath(options.agentVersion, options.releaseOs, options.releaseArch);
    const githubUrl = `${options.githubRepoUrl.replace(/\/+$/, '')}/${assetPath}`;
    const mirrors = normalizeMirrorList(options.mirrors);
    const asset = `riri-agent_${options.agentVersion}_${options.releaseOs}_${options.releaseArch}.zip`;
    const body = POWERSHELL_INSTALLER_TEMPLATE
      .replaceAll('__RIRI_VERSION__', options.agentVersion)
      .replaceAll('__RIRI_GITHUB_URL__', githubUrl)
      .replaceAll('__RIRI_MIRRORS__', mirrors.join(','))
      .replaceAll('__RIRI_FALLBACK_URL__', options.fallbackUrl)
      .replaceAll('__RIRI_FALLBACK_SHA256__', options.fallbackSha256)
      .replaceAll('__RIRI_ASSET__', asset);
    return body;
  }

  private async resolveRenderOptions(platform: string, requestBaseUrl?: string): Promise<RenderOptions> {
    const settings = await this.settingsService?.getSettings();
    const asset = this.binaries.findForNode('agent', platform);
    // GitHub Release 的 os 命名与主控目标不同名：macos → darwin
    const [targetOs, targetArch] = platform.split('-');
    const releaseOs = targetOs === 'macos' ? 'darwin' : (targetOs as 'linux' | 'darwin' | 'windows');
    const fallbackUrl = this.binaries.buildDownloadUrl(`agent-${platform}` as BinaryTarget, '', requestBaseUrl);
    return {
      releaseOs,
      releaseArch: (targetArch === 'arm64' ? 'arm64' : 'amd64') as 'amd64' | 'arm64',
      agentVersion: this.readAgentVersion() || asset?.version || '0.0.0',
      githubRepoUrl: settings?.githubRepoUrl?.trim() || 'https://github.com/Nanako660/riricloud',
      mirrors: settings?.githubMirrorUrls?.length ? settings.githubMirrorUrls : [...DEFAULT_GITHUB_MIRRORS],
      fallbackUrl,
      fallbackSha256: asset?.sha256 ?? ''
    };
  }

  private readAgentVersion(): string {
    return readBundledAgentVersion();
  }
}

// 读取主控捆绑的 Agent 版本（构建流水线写入 binaries/AGENT_VERSION；开发态读 apps/agent/VERSION）。
// 与 SystemService.readAgentVersion 同源；独立实现避免跨模块暴露内部状态。
function readBundledAgentVersion(): string {
  const candidates = [
    join(process.cwd(), '..', 'agent', 'VERSION'),
    join(process.cwd(), 'apps', 'agent', 'VERSION'),
    join(process.cwd(), 'binaries', 'AGENT_VERSION'),
    join(process.cwd(), 'AGENT_VERSION')
  ];
  for (const candidate of candidates) {
    try {
      const value = readFileSync(candidate, 'utf8').trim();
      if (value) return value;
    } catch {
      // 尝试下一个候选路径
    }
  }
  try {
    const manifest = JSON.parse(readFileSync(join(process.cwd(), 'binaries', 'manifest.json'), 'utf8')) as {
      resources?: Array<{ kind?: string; upstreamVersion?: string }>;
    };
    const agent = manifest.resources?.find((item) => item.kind === 'AGENT');
    if (typeof agent?.upstreamVersion === 'string' && agent.upstreamVersion.trim()) return agent.upstreamVersion.trim();
  } catch {
    // 尝试环境变量
  }
  return process.env.RIRICLOUD_AGENT_VERSION ?? process.env.AGENT_VERSION ?? '';
}

const POSIX_INSTALLER_TEMPLATE = `#!/bin/sh
# RiriCloud Agent 安装脚本（由主控按平台/镜像设置渲染；逻辑见 apps/server/src/binaries/installer.service.ts）
# 下载顺序：GitHub Release 直连/镜像测速择优 -> 主控内置二进制兜底
set -u

RIRI_VERSION="__RIRI_VERSION__"
RIRI_GITHUB_URL="__RIRI_GITHUB_URL__"
RIRI_MIRRORS="__RIRI_MIRRORS__"
RIRI_FALLBACK_URL="__RIRI_FALLBACK_URL__"
RIRI_FALLBACK_SHA256="__RIRI_FALLBACK_SHA256__"
RIRI_ASSET="__RIRI_ASSET__"

RIRI_MASTER=""
for arg in "$@"; do
  case "$arg" in
    --master=*) RIRI_MASTER="\${arg#--master=}" ;;
  esac
done
if [ -z "$RIRI_MASTER" ]; then
  echo "[riri-agent] 缺少 --master 参数" >&2
  exit 1
fi
if [ -z "$RIRI_AGENT_TOKEN" ]; then
  echo "[riri-agent] 缺少 AgentToken（请通过安装命令读取输入）" >&2
  exit 1
fi

riri_sha256() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | awk '{print $1}';
  else shasum -a 256 "$1" | awk '{print $1}'; fi
}

CANDIDATES="$RIRI_GITHUB_URL"
for mirror in $RIRI_MIRRORS; do
  case "$mirror" in
    */) CANDIDATES="$CANDIDATES $mirror$RIRI_GITHUB_URL" ;;
    *) CANDIDATES="$CANDIDATES $mirror/$RIRI_GITHUB_URL" ;;
  esac
done

BEST_URL=""
BEST_TIME=""
for url in $CANDIDATES; do
  meta=$(curl -L -s -o /dev/null --max-time 6 -r 0-131071 -w '%{http_code} %{time_total}' "$url" 2>/dev/null || true)
  code=\${meta%% *}
  cost=\${meta#* }
  if [ "$code" = "200" ] || [ "$code" = "206" ]; then
    echo "[riri-agent] 测速可用：$cost  $url"
    if [ -z "$BEST_TIME" ] || awk "BEGIN{exit !($cost < $BEST_TIME)}" 2>/dev/null; then
      BEST_URL="$url"
      BEST_TIME="$cost"
    fi
  fi
done

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

if [ -n "$BEST_URL" ]; then
  echo "[riri-agent] 选择下载源：$BEST_URL"
  curl -fsSL --retry 2 -o "$WORK/$RIRI_ASSET" "$BEST_URL" || { echo "[riri-agent] 下载失败" >&2; exit 1; }
  CHECK_URL="\${BEST_URL%/*}/checksums.txt"
  if curl -fsSL --retry 2 -o "$WORK/checksums.txt" "$CHECK_URL" 2>/dev/null; then
    EXPECTED=$(awk -v name="$RIRI_ASSET" '$2 == name || $2 == "*"name {print $1}' "$WORK/checksums.txt" | head -n 1)
    if [ -n "$EXPECTED" ]; then
      ACTUAL=$(riri_sha256 "$WORK/$RIRI_ASSET")
      if [ "$ACTUAL" != "$EXPECTED" ]; then
        echo "[riri-agent] SHA-256 校验失败，已终止安装" >&2
        exit 1
      fi
      echo "[riri-agent] SHA-256 校验通过"
    else
      echo "[riri-agent] checksums.txt 中未找到 $RIRI_ASSET，跳过校验"
    fi
  else
    echo "[riri-agent] checksums.txt 下载失败，跳过校验"
  fi
  tar -xzf "$WORK/$RIRI_ASSET" -C "$WORK" || { echo "[riri-agent] 解压失败" >&2; exit 1; }
  BIN="$WORK/riri-agent"
else
  echo "[riri-agent] GitHub 直连与镜像均不可用，回退主控内置下载"
  curl -fsSL --retry 2 -H "X-Agent-Token: $RIRI_AGENT_TOKEN" -o "$WORK/riri-agent" "$RIRI_FALLBACK_URL" || { echo "[riri-agent] 主控下载失败" >&2; exit 1; }
  BIN="$WORK/riri-agent"
  if [ -n "$RIRI_FALLBACK_SHA256" ]; then
    ACTUAL=$(riri_sha256 "$BIN")
    if [ "$ACTUAL" != "$RIRI_FALLBACK_SHA256" ]; then
      echo "[riri-agent] 主控二进制 SHA-256 校验失败，已终止安装" >&2
      exit 1
    fi
  fi
fi

mkdir -p /usr/local/bin
install -m 0755 "$BIN" /usr/local/bin/riri-agent

echo "[riri-agent] 开始注册系统服务..."
GITHUB_MIRRORS="$RIRI_MIRRORS" /usr/local/bin/riri-agent install --token="$RIRI_AGENT_TOKEN" --master="$RIRI_MASTER"
`;

const POWERSHELL_INSTALLER_TEMPLATE = `
# RiriCloud Agent 安装脚本（由主控按平台/镜像设置渲染；逻辑见 apps/server/src/binaries/installer.service.ts）
param(
  [Parameter(Mandatory = $true)][string]$MasterUrl,
  [Parameter(Mandatory = $true)][string]$AgentToken
)
$ErrorActionPreference = 'Stop'

$RiriVersion = "__RIRI_VERSION__"
$RiriGithubUrl = "__RIRI_GITHUB_URL__"
$RiriMirrors = "__RIRI_MIRRORS__"
$RiriFallbackUrl = "__RIRI_FALLBACK_URL__"
$RiriFallbackSha256 = "__RIRI_FALLBACK_SHA256__"
$RiriAsset = "__RIRI_ASSET__"

if (-not $AgentToken) { Write-Error "[riri-agent] 缺少 AgentToken"; exit 1 }
if (-not $MasterUrl) { Write-Error "[riri-agent] 缺少 --master 参数"; exit 1 }

function Test-RiriSpeed([string]$Url) {
  $output = & curl.exe -L -s -o NUL --max-time 6 -r 0-131071 -w '%{http_code} %{time_total}' $Url 2>$null
  if ($LASTEXITCODE -ne 0 -or -not $output) { return $null }
  $parts = "$output".Trim().Split(' ')
  if ($parts[0] -ne '200' -and $parts[0] -ne '206') { return $null }
  return [double]$parts[1]
}

$candidates = @($RiriGithubUrl) + ($RiriMirrors.Split(',') | Where-Object { $_ })
$bestUrl = ''
$bestTime = $null
foreach ($mirror in $candidates) {
  $url = if ($mirror.EndsWith('/')) { $mirror + $RiriGithubUrl } else { $mirror + '/' + $RiriGithubUrl }
  $cost = Test-RiriSpeed $url
  if ($null -ne $cost) {
    Write-Host ("[riri-agent] 测速可用：" + $cost + "s  " + $url)
    if ($null -eq $bestTime -or $cost -lt $bestTime) { $bestUrl = $url; $bestTime = $cost }
  }
}

$work = Join-Path $env:TEMP ("riri-agent-install-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force $work | Out-Null
$binary = Join-Path $work 'riri-agent.exe'

try {
  if ($bestUrl) {
    Write-Host "[riri-agent] 选择下载源：$bestUrl"
    $archive = Join-Path $work $RiriAsset
    & curl.exe -fsSL --retry 2 -o $archive $bestUrl
    if ($LASTEXITCODE -ne 0) { Write-Error "[riri-agent] 下载失败"; exit 1 }
    $checksumUrl = $bestUrl.Substring(0, $bestUrl.LastIndexOf('/') + 1) + 'checksums.txt'
    $checksumFile = Join-Path $work 'checksums.txt'
    & curl.exe -fsSL --retry 2 -o $checksumFile $checksumUrl
    if ($LASTEXITCODE -eq 0 -and (Test-Path $checksumFile)) {
      $expected = (Select-String -Path $checksumFile -Pattern ([regex]::Escape($RiriAsset)) | Select-Object -First 1).Line
      if ($expected) {
        $expectedSha = $expected.Trim().Split(' ')[0]
        $actualSha = (Get-FileHash -Algorithm SHA256 $archive).Hash.ToLower()
        if ($actualSha -ne $expectedSha) { Write-Error "[riri-agent] SHA-256 校验失败，已终止安装"; exit 1 }
        Write-Host "[riri-agent] SHA-256 校验通过"
      }
    }
    Expand-Archive -Path $archive -DestinationPath $work -Force
  } else {
    Write-Host "[riri-agent] GitHub 直连与镜像均不可用，回退主控内置下载"
    $headers = @{ 'X-Agent-Token' = $AgentToken }
    Invoke-WebRequest -Uri $RiriFallbackUrl -Headers $headers -OutFile $binary -UseBasicParsing
    if ($RiriFallbackSha256) {
      $actualSha = (Get-FileHash -Algorithm SHA256 $binary).Hash.ToLower()
      if ($actualSha -ne $RiriFallbackSha256) { Write-Error "[riri-agent] 主控二进制 SHA-256 校验失败，已终止安装"; exit 1 }
    }
  }

  $installDir = Join-Path $env:ProgramFiles 'RiriCloud'
  New-Item -ItemType Directory -Force $installDir | Out-Null
  $exe = Join-Path $installDir 'riri-agent.exe'
  Move-Item -Force $binary $exe

  Write-Host "[riri-agent] 开始注册系统服务..."
  $env:GITHUB_MIRRORS = $RiriMirrors
  & $exe install --token="$AgentToken" --master=$MasterUrl
} finally {
  Remove-Item -Recurse -Force $work -ErrorAction SilentlyContinue
}
`;
