import { Injectable, Optional } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SettingsService, DEFAULT_GITHUB_MIRRORS } from '../system/settings.service';
import { BinariesService, type BinaryTarget } from './binaries.service';

export type InstallerPlatform = {
  // 主控内置目标平台（agent-linux-amd64 等），用于解析回退下载与 sha256
  platform: string;
};

export type PresetInstallerOptions = {
  agentToken?: string;
  masterUrl?: string;
  mode?: 'ws' | 'http';
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
  async renderShellScript(platform: string, requestBaseUrl?: string, preset?: PresetInstallerOptions): Promise<string> {
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
      .replaceAll('__RIRI_ASSET__', `riri-agent_${options.agentVersion}_${options.releaseOs}_${options.releaseArch}.tar.gz`)
      .replaceAll('__RIRI_TARGET_ARCH__', options.releaseArch)
      .replaceAll('__RIRI_PRESET_MASTER__', preset?.masterUrl ?? '')
      .replaceAll('__RIRI_PRESET_AGENT_TOKEN__', preset?.agentToken ?? '');
    return body;
  }

  // 渲染 Windows PowerShell 安装脚本：逻辑与 POSIX 版一致。
  async renderPowershellScript(platform: string, requestBaseUrl?: string, preset?: PresetInstallerOptions): Promise<string> {
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
      .replaceAll('__RIRI_ASSET__', asset)
      .replaceAll('__RIRI_TARGET_ARCH__', options.releaseArch)
      .replaceAll('__RIRI_PRESET_MASTER__', preset?.masterUrl ?? '')
      .replaceAll('__RIRI_PRESET_AGENT_TOKEN__', preset?.agentToken ?? '');
    return body;
  }

  // 渲染 Windows 双击与 CMD/PowerShell 跨终端通用 .bat 安装脚本
  async renderWindowsInstallBat(platform: string, requestBaseUrl?: string, preset?: PresetInstallerOptions): Promise<string> {
    const psScript = await this.renderPowershellScript(platform, requestBaseUrl, preset);
    const rawBat = `@echo off
chcp 65001 >nul
title RiriCloud Agent 安装向导
echo [RiriCloud] 正在启动安装向导...

:: [1] 检测管理员权限，未提权则自动唤起 UAC
net session >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [RiriCloud] 检测到当前非管理员权限，正在唤起 UAC 提权...
    powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b %ERRORLEVEL%
)

:: [2] 执行内嵌 PowerShell 自动化安装引擎
set "RIRI_BAT_FILE=%~f0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$content = [string]((Get-Content -LiteralPath $env:RIRI_BAT_FILE -Raw -Encoding UTF8) -replace '(?s)^.*?:POWERSHELL_START\\r?\\n',''); & ([ScriptBlock]::Create($content))"
set PS_EXIT=%ERRORLEVEL%

if %PS_EXIT% neq 0 (
    echo [错误] 安装过程中出现异常，退出代码: %PS_EXIT%
    pause
    exit /b %PS_EXIT%
)
exit /b 0

:POWERSHELL_START
${psScript}
`;
    return rawBat.replace(/\r?\n/g, '\r\n');
  }

  private async resolveRenderOptions(platform: string, requestBaseUrl?: string): Promise<RenderOptions> {
    // 先刷新资产映射再取 SHA：dev 模式下 artifacts 产物会被后续构建替换，
    // 使用服务器启动时的快照会导致嵌入 SHA 与实际下发文件不一致（实机冒烟发现）。
    await this.binaries.refresh();
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
RIRI_TARGET_ARCH="__RIRI_TARGET_ARCH__"
RIRI_PRESET_MASTER="__RIRI_PRESET_MASTER__"
RIRI_PRESET_AGENT_TOKEN="__RIRI_PRESET_AGENT_TOKEN__"

RIRI_MASTER="$RIRI_PRESET_MASTER"
for arg in "$@"; do
  case "$arg" in
    --master=*) RIRI_MASTER="\${arg#--master=}" ;;
  esac
done
if [ -z "$RIRI_MASTER" ]; then
  echo "[riri-agent] 缺少 --master 参数" >&2
  exit 1
fi

RIRI_AGENT_TOKEN="\${RIRI_AGENT_TOKEN:-$RIRI_PRESET_AGENT_TOKEN}"
if [ -z "\${RIRI_AGENT_TOKEN:-}" ]; then
  echo "[riri-agent] 缺少 AgentToken（请通过安装命令读取输入）" >&2
  exit 1
fi

# ============================================================
# [1/4] 环境检查：root 权限/sudo 提权、架构匹配与基础命令检查
# ============================================================
if [ "$(id -u)" -ne 0 ]; then
  if command -v sudo >/dev/null 2>&1; then
    echo "[riri-agent] [1/4] 环境检查：注册系统服务需要 root 权限，正在通过 sudo 提权重新执行..."
    if [ -n "\${0:-}" ] && [ -f "$0" ]; then
      exec sudo RIRI_AGENT_TOKEN="$RIRI_AGENT_TOKEN" sh "$0" "$@"
    else
      echo "[riri-agent] 错误：无法获取脚本文件路径进行 sudo 提权，请以 root 身份或使用 'sudo sh ...' 重试" >&2
      exit 1
    fi
  else
    echo "[riri-agent] 错误：注册系统服务需要 root 权限，且系统中未检测到 sudo。请以 root 身份运行此脚本" >&2
    exit 1
  fi
fi

UNAME_M=$(uname -m)
case "$UNAME_M" in
  x86_64|amd64) SYS_ARCH="amd64" ;;
  aarch64|arm64) SYS_ARCH="arm64" ;;
  *) SYS_ARCH="$UNAME_M" ;;
esac
if [ "$SYS_ARCH" != "$RIRI_TARGET_ARCH" ]; then
  echo "[riri-agent] 警告：当前系统架构 ($SYS_ARCH) 与安装包目标架构 ($RIRI_TARGET_ARCH) 不一致，可能无法正常运行" >&2
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "[riri-agent] 错误：缺少 curl 命令，请先安装 curl" >&2
  exit 1
fi
if ! command -v tar >/dev/null 2>&1; then
  echo "[riri-agent] 错误：缺少 tar 命令，请先安装 tar" >&2
  exit 1
fi

riri_sha256() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | awk '{print $1}';
  else shasum -a 256 "$1" | awk '{print $1}'; fi
}

echo "[riri-agent] [1/4] 环境检查通过 (root 权限: 是, 系统架构: $SYS_ARCH, 目标架构: $RIRI_TARGET_ARCH)"

# ============================================================
# [2/4] 镜像测速与下载：多源测速择优，可视化进度条
# ============================================================
echo "[riri-agent] [2/4] 开始镜像测速与下载..."
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
    echo "[riri-agent]   测速可用：$cost  $url"
    if [ -z "$BEST_TIME" ] || awk "BEGIN{exit !($cost < $BEST_TIME)}" 2>/dev/null; then
      BEST_URL="$url"
      BEST_TIME="$cost"
    fi
  fi
done

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

if [ -n "$BEST_URL" ]; then
  echo "[riri-agent] 选择最佳下载源：$BEST_URL"
  echo "[riri-agent] 正在下载 $RIRI_ASSET ..."
  curl -# -fL --retry 2 -o "$WORK/$RIRI_ASSET" "$BEST_URL" || { echo "[riri-agent] 下载失败" >&2; exit 1; }
  CHECK_URL="\${BEST_URL%/*}/checksums.txt"
  if curl -fsSL --retry 2 -o "$WORK/checksums.txt" "$CHECK_URL" 2>/dev/null; then
    EXPECTED=$(awk -v name="$RIRI_ASSET" '$2 == name || $2 == "*"name {print $1}' "$WORK/checksums.txt" | head -n 1)
    if [ -n "$EXPECTED" ]; then
      ACTUAL=$(riri_sha256 "$WORK/$RIRI_ASSET")
      if [ "$ACTUAL" != "$EXPECTED" ]; then
        echo "[riri-agent] SHA-256 校验失败 (预期: $EXPECTED, 实际: $ACTUAL)，已终止安装" >&2
        exit 1
      fi
      echo "[riri-agent] SHA-256 校验通过"
    else
      echo "[riri-agent] checksums.txt 中未找到 $RIRI_ASSET，跳过文件校验"
    fi
  else
    echo "[riri-agent] checksums.txt 获取跳过，继续安装"
  fi
  echo "[riri-agent] 正在解压软件包..."
  tar -xzf "$WORK/$RIRI_ASSET" -C "$WORK" || { echo "[riri-agent] 解压失败" >&2; exit 1; }
  BIN="$WORK/riri-agent"
else
  echo "[riri-agent] GitHub 直连与镜像均不可用，回退主控内置下载"
  curl -# -fL --retry 2 -H "X-Agent-Token: $RIRI_AGENT_TOKEN" -o "$WORK/riri-agent" "$RIRI_FALLBACK_URL" || { echo "[riri-agent] 主控下载失败" >&2; exit 1; }
  BIN="$WORK/riri-agent"
  if [ -n "$RIRI_FALLBACK_SHA256" ]; then
    ACTUAL=$(riri_sha256 "$BIN")
    if [ "$ACTUAL" != "$RIRI_FALLBACK_SHA256" ]; then
      echo "[riri-agent] 主控二进制 SHA-256 校验失败，已终止安装" >&2
      exit 1
    fi
    echo "[riri-agent] 主控二进制 SHA-256 校验通过"
  fi
fi

# ============================================================
# [3/4] 二进制校验与部署：平滑停机更新与文件放置
# ============================================================
echo "[riri-agent] [3/4] 部署二进制并检查既有服务..."
if command -v systemctl >/dev/null 2>&1 && systemctl is-active --quiet riri-agent 2>/dev/null; then
  echo "[riri-agent] 检测到现有 riri-agent 服务正在运行，正在平滑停止以更新程序文件..."
  systemctl stop riri-agent 2>/dev/null || true
fi

mkdir -p /usr/local/bin
if command -v install >/dev/null 2>&1; then
  install -m 0755 "$BIN" /usr/local/bin/riri-agent || { echo "[riri-agent] 写入 /usr/local/bin 失败" >&2; exit 1; }
else
  cp -f "$BIN" /usr/local/bin/riri-agent && chmod 0755 /usr/local/bin/riri-agent || { echo "[riri-agent] 写入 /usr/local/bin 失败" >&2; exit 1; }
fi
echo "[riri-agent] 程序文件已部署至：/usr/local/bin/riri-agent"

# ============================================================
# [4/4] 服务注册与健康检查：注册自启服务、状态查询与运维卡片
# ============================================================
echo "[riri-agent] [4/4] 系统服务注册与健康检查..."
echo "[riri-agent] 正在注册并启动系统服务..."
GITHUB_MIRRORS="$RIRI_MIRRORS" /usr/local/bin/riri-agent install --token="$RIRI_AGENT_TOKEN" --master="$RIRI_MASTER" || { echo "[riri-agent] 服务注册执行失败" >&2; exit 1; }

echo "[riri-agent] 等待服务初始化与主控连接 (2秒)..."
sleep 2

SVC_STATUS="running"
if command -v systemctl >/dev/null 2>&1; then
  if systemctl is-active --quiet riri-agent 2>/dev/null; then
    SVC_STATUS="active (running)"
  elif systemctl is-failed --quiet riri-agent 2>/dev/null; then
    SVC_STATUS="failed"
  fi
fi

echo ""
echo "============================================================"
echo "                 RiriCloud Agent 安装就绪                   "
echo "============================================================"
echo "  版本:           v$RIRI_VERSION ($SYS_ARCH)"
echo "  服务状态:       $SVC_STATUS (开机自启服务: riri-agent)"
echo "  主控连接:       $RIRI_MASTER"
echo "  程序路径:       /usr/local/bin/riri-agent"
echo "  配置文件:       /etc/riri-agent/config.yaml"
echo "  运行日志:       /var/lib/riri-agent/agent.log"
echo "------------------------------------------------------------"
echo "  常用运维命令:"
echo "    - 查看状态:   /usr/local/bin/riri-agent status"
echo "    - 运行诊断:   /usr/local/bin/riri-agent doctor"
echo "    - 查看日志:   /usr/local/bin/riri-agent logs -f"
echo "    - 重启服务:   /usr/local/bin/riri-agent restart"
echo "    - 注销卸载:   /usr/local/bin/riri-agent uninstall --purge"
echo "============================================================"
echo ""
`;

const POWERSHELL_INSTALLER_TEMPLATE = `
# RiriCloud Agent 安装脚本（由主控按平台/镜像设置渲染；逻辑见 apps/server/src/binaries/installer.service.ts）
param(
  [string]$MasterUrl = '__RIRI_PRESET_MASTER__',
  [string]$AgentToken = '__RIRI_PRESET_AGENT_TOKEN__',
  [string]$InstallDir = $(Join-Path $env:ProgramFiles 'RiriCloud'),
  [switch]$NoService,
  [switch]$Elevated
)
$ErrorActionPreference = 'Stop'

$RiriVersion = "__RIRI_VERSION__"
$RiriGithubUrl = "__RIRI_GITHUB_URL__"
$RiriMirrors = "__RIRI_MIRRORS__"
$RiriFallbackUrl = "__RIRI_FALLBACK_URL__"
$RiriFallbackSha256 = "__RIRI_FALLBACK_SHA256__"
$RiriAsset = "__RIRI_ASSET__"
$RiriTargetArch = "__RIRI_TARGET_ARCH__"

if (-not $AgentToken) { Write-Error "[riri-agent] 缺少 AgentToken"; exit 1 }
if (-not $MasterUrl) { Write-Error "[riri-agent] 缺少 --master 参数"; exit 1 }

# ============================================================
# [1/4] 环境检查：权限自检、智能 UAC 提权与架构验证
# ============================================================
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin -and -not $NoService) {
  if ($Elevated) {
    Write-Error "[riri-agent] 错误：已尝试管理员提权，但仍缺少管理员权限。请以管理员身份启动 PowerShell 后重试。"
    exit 1
  }
  $isInteractive = [Environment]::UserInteractive -and -not [Console]::IsInputRedirected
  if ($isInteractive) {
    Write-Host "[riri-agent] [1/4] 环境检查：注册系统服务需要管理员权限，正在唤起 UAC 提权..." -ForegroundColor Yellow
    $scriptPath = $PSCommandPath
    if (-not $scriptPath) {
      $scriptPath = $MyInvocation.MyCommand.Definition
    }
    if (-not $scriptPath) {
      $scriptPath = $MyInvocation.MyCommand.Path
    }
    if ($scriptPath -and (Test-Path $scriptPath)) {
      $psExe = try { (Get-Process -Id $PID).Path } catch { 'powershell.exe' }
      if (-not $psExe) { $psExe = 'powershell.exe' }
      $elevateArgs = "-NoProfile -ExecutionPolicy Bypass -File \`"$scriptPath\`" -MasterUrl \`"$MasterUrl\`" -AgentToken \`"$AgentToken\`" -InstallDir \`"$InstallDir\`" -Elevated"
      try {
        Write-Host "[riri-agent] 已拉起管理员权限安装窗口，等待安装完成..." -ForegroundColor Cyan
        $proc = Start-Process -FilePath $psExe -ArgumentList $elevateArgs -Verb RunAs -PassThru -Wait
        if ($proc.ExitCode -eq 0) {
          Write-Host "[riri-agent] 管理员窗口安装完成。" -ForegroundColor Green
          exit 0
        } else {
          Write-Error "[riri-agent] 管理员窗口安装未成功完成 (退出代码: $($proc.ExitCode))。"
          exit $proc.ExitCode
        }
      } catch {
        Write-Error "[riri-agent] UAC 提权被取消或失败：$($_.Exception.Message)。请以管理员身份启动 PowerShell 后重试。"
        exit 1
      }
    } else {
      Write-Error "[riri-agent] 错误：未找到安装脚本路径，无法自动提权。请以管理员身份启动 PowerShell 后重新执行命令。"
      exit 1
    }
  } else {
    Write-Error "[riri-agent] 错误：注册 Windows 系统服务需要管理员权限且当前为非交互式环境。请以管理员身份启动 PowerShell 重试。"
    exit 1
  }
}

$sysArch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } else { 'amd64' }
if ($sysArch -ne $RiriTargetArch) {
  Write-Warning "[riri-agent] 当前系统架构 ($sysArch) 与安装包目标架构 ($RiriTargetArch) 不一致，可能无法正常运行。"
}
$hasCurl = (Get-Command curl.exe -ErrorAction SilentlyContinue) -ne $null
Write-Host "[riri-agent] [1/4] 环境检查通过 (管理员权限: $(if ($isAdmin) { '是' } else { '否' }), 系统架构: $sysArch, 目标架构: $RiriTargetArch)" -ForegroundColor Cyan

# ============================================================
# [2/4] 镜像测速与下载：多源测速择优，可视化进度条
# ============================================================
Write-Host "[riri-agent] [2/4] 开始镜像测速与下载..." -ForegroundColor Cyan

function Test-RiriSpeed([string]$Url) {
  if ($hasCurl) {
    $output = & curl.exe -L -s -o NUL --max-time 6 -r 0-131071 -w '%{http_code} %{time_total}' $Url 2>$null
    if ($LASTEXITCODE -ne 0 -or -not $output) { return $null }
    $parts = "$output".Trim().Split(' ')
    if ($parts[0] -ne '200' -and $parts[0] -ne '206') { return $null }
    return [double]$parts[1]
  }
  return $null
}

$candidates = @($RiriGithubUrl)
foreach ($mirror in ($RiriMirrors.Split(',') | Where-Object { $_ })) {
  $candidates += if ($mirror.EndsWith('/')) { $mirror + $RiriGithubUrl } else { $mirror + '/' + $RiriGithubUrl }
}
$bestUrl = ''
$bestTime = $null
foreach ($url in $candidates) {
  $cost = Test-RiriSpeed $url
  if ($null -ne $cost) {
    Write-Host ("[riri-agent]   测速可用: " + [math]::Round($cost, 3) + "s  " + $url)
    if ($null -eq $bestTime -or $cost -lt $bestTime) { $bestUrl = $url; $bestTime = $cost }
  }
}

$work = Join-Path $env:TEMP ("riri-agent-install-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force $work | Out-Null
$binary = Join-Path $work 'riri-agent.exe'

try {
  if ($bestUrl) {
    Write-Host "[riri-agent] 选择最佳下载源: $bestUrl" -ForegroundColor Green
    Write-Host "[riri-agent] 正在下载 $RiriAsset ..."
    $archive = Join-Path $work $RiriAsset
    if ($hasCurl) {
      & curl.exe -# -fL --retry 2 -o $archive $bestUrl
      if ($LASTEXITCODE -ne 0) { Write-Error "[riri-agent] 下载失败"; exit 1 }
    } else {
      Invoke-WebRequest -Uri $bestUrl -OutFile $archive -UseBasicParsing
    }
    $checksumUrl = $bestUrl.Substring(0, $bestUrl.LastIndexOf('/') + 1) + 'checksums.txt'
    $checksumFile = Join-Path $work 'checksums.txt'
    if ($hasCurl) {
      & curl.exe -fsSL --retry 2 -o $checksumFile $checksumUrl 2>$null
    } else {
      Invoke-WebRequest -Uri $checksumUrl -OutFile $checksumFile -UseBasicParsing -ErrorAction SilentlyContinue
    }
    if (Test-Path $checksumFile) {
      $expected = (Select-String -Path $checksumFile -Pattern ([regex]::Escape($RiriAsset)) | Select-Object -First 1).Line
      if ($expected) {
        $expectedSha = $expected.Trim().Split(' ')[0].ToLower()
        $actualSha = (Get-FileHash -Algorithm SHA256 $archive).Hash.ToLower()
        if ($actualSha -ne $expectedSha) {
          Write-Error "[riri-agent] SHA-256 校验失败 (预期: $expectedSha, 实际: $actualSha)，已终止安装"
          exit 1
        }
        Write-Host "[riri-agent] SHA-256 校验通过" -ForegroundColor Green
      } else {
        Write-Host "[riri-agent] checksums.txt 中未找到 $RiriAsset，跳过文件校验" -ForegroundColor Yellow
      }
    } else {
      Write-Host "[riri-agent] checksums.txt 获取跳过，继续安装" -ForegroundColor Yellow
    }
    Write-Host "[riri-agent] 正在解压软件包..."
    Expand-Archive -Path $archive -DestinationPath $work -Force
  } else {
    Write-Host "[riri-agent] GitHub 直连与镜像均不可用，回退主控内置下载" -ForegroundColor Yellow
    $headers = @{ 'X-Agent-Token' = $AgentToken }
    if ($hasCurl) {
      & curl.exe -# -fL --retry 2 -H "X-Agent-Token: $AgentToken" -o $binary $RiriFallbackUrl
      if ($LASTEXITCODE -ne 0) { Write-Error "[riri-agent] 主控下载失败"; exit 1 }
    } else {
      Invoke-WebRequest -Uri $RiriFallbackUrl -Headers $headers -OutFile $binary -UseBasicParsing
    }
    if ($RiriFallbackSha256) {
      $actualSha = (Get-FileHash -Algorithm SHA256 $binary).Hash.ToLower()
      if ($actualSha -ne $RiriFallbackSha256.ToLower()) {
        Write-Error "[riri-agent] 主控二进制 SHA-256 校验失败，已终止安装"
        exit 1
      }
      Write-Host "[riri-agent] 主控二进制 SHA-256 校验通过" -ForegroundColor Green
    }
  }

  # ============================================================
  # [3/4] 二进制校验与部署：平滑停机更新，避免 Windows 进程文件锁
  # ============================================================
  Write-Host "[riri-agent] [3/4] 部署二进制并检查既有服务..." -ForegroundColor Cyan
  $targetDir = $InstallDir
  New-Item -ItemType Directory -Force $targetDir | Out-Null
  $exe = Join-Path $targetDir 'riri-agent.exe'

  $svc = Get-Service -Name 'riri-agent' -ErrorAction SilentlyContinue
  if ($svc -and $svc.Status -eq 'Running') {
    Write-Host "[riri-agent] 检测到现有服务正在运行，正在平滑停止以更新程序文件..." -ForegroundColor Yellow
    Stop-Service -Name 'riri-agent' -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
  }

  Move-Item -Force $binary $exe
  Write-Host "[riri-agent] 程序文件已部署至: $exe" -ForegroundColor Green

  # ============================================================
  # [4/4] 服务注册与健康检查：注册自启服务、状态查询与运维卡片
  # ============================================================
  Write-Host "[riri-agent] [4/4] 系统服务注册与健康检查..." -ForegroundColor Cyan
  if (-not $NoService) {
    Write-Host "[riri-agent] 正在注册并启动系统服务..."
    $env:GITHUB_MIRRORS = $RiriMirrors
    & $exe install --token="$AgentToken" --master=$MasterUrl
    if ($LASTEXITCODE -ne 0) {
      Write-Error "[riri-agent] 服务注册执行失败 (退出代码: $LASTEXITCODE)"
      exit $LASTEXITCODE
    }

    Write-Host "[riri-agent] 等待服务初始化与主控连接 (3秒)..."
    Start-Sleep -Seconds 3

    $svcCheck = Get-Service -Name 'riri-agent' -ErrorAction SilentlyContinue
    $svcStatus = if ($svcCheck) { $svcCheck.Status.ToString() } else { "Unknown" }

    $configDir = if ($env:ProgramData) { Join-Path $env:ProgramData 'RiriCloud' } else { Join-Path $env:TEMP 'RiriCloud' }
    $cfgPath = Join-Path $configDir 'config.yaml'
    $logPath = Join-Path $configDir 'agent.log'

    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Green
    Write-Host "                 RiriCloud Agent 安装就绪                   " -ForegroundColor Green
    Write-Host "============================================================" -ForegroundColor Green
    Write-Host ("  版本:           v$RiriVersion ($sysArch)")
    Write-Host ("  服务状态:       $svcStatus (开机自启服务: riri-agent)")
    Write-Host ("  主控连接:       $MasterUrl")
    Write-Host ("  程序路径:       $exe")
    Write-Host ("  配置文件:       $cfgPath")
    Write-Host ("  运行日志:       $logPath")
    Write-Host "------------------------------------------------------------"
    Write-Host "  常用运维命令:"
    Write-Host ("    - 查看状态:   & \`"$exe\`" status")
    Write-Host ("    - 运行诊断:   & \`"$exe\`" doctor")
    Write-Host ("    - 查看日志:   Get-Content \`"$logPath\`" -Tail 50 -Wait")
    Write-Host ("    - 重启服务:   Restart-Service riri-agent")
    Write-Host ("    - 注销卸载:   & \`"$exe\`" uninstall --purge")
    Write-Host "============================================================" -ForegroundColor Green
    Write-Host ""
  } else {
    Write-Host "[riri-agent] 免安装模式：程序已就绪至 $exe" -ForegroundColor Green
    Write-Host "[riri-agent] 可执行 '& \`"$exe\`" run' 启动 Agent。"
  }
} finally {
  Remove-Item -Recurse -Force $work -ErrorAction SilentlyContinue
  if ($Elevated) {
    Write-Host ""
    Read-Host "按回车键退出此管理员安装窗口..."
  }
}
`;
