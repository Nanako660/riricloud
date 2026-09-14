import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { existsSync, readFileSync } from 'node:fs';
import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { gunzipSync } from 'node:zlib';
import archiver from 'archiver';
import AdmZip from 'adm-zip';
import { BinariesService, type BinaryTarget, normalizeOsArch } from './binaries.service';
import { SettingsService, DEFAULT_GITHUB_MIRRORS } from '../system/settings.service';
import { fetchSafeRemoteBuffer } from '../common/safe-remote-fetch';
import { appendPublicPath, resolvePublicBaseUrl, toWebSocketBaseUrl } from '../common/public-url';

export type OfflinePackagePlatform = 'windows-amd64' | 'linux-amd64' | 'linux-arm64' | 'darwin-amd64' | 'darwin-arm64';

export interface OfflinePackageNode {
  id: string;
  name: string;
  agentToken: string;
  communicationMode?: string | null;
  pollIntervalSecs?: number | null;
  reachability?: string | null;
  serverHost?: string | null;
  osArch?: string | null;
}

export interface OfflinePackageResult {
  stream: Readable;
  filename: string;
  mimeType: string;
}

const SUPPORTED_OFFLINE_PLATFORMS: OfflinePackagePlatform[] = [
  'windows-amd64',
  'linux-amd64',
  'linux-arm64',
  'darwin-amd64',
  'darwin-arm64'
];

@Injectable()
export class OfflinePackageService {
  private readonly logger = new Logger(OfflinePackageService.name);

  constructor(
    private readonly binaries: BinariesService,
    @Optional() private readonly settingsService?: SettingsService
  ) {}

  /**
   * 规范化并校验目标平台
   */
  normalizePlatform(rawPlatform?: string): OfflinePackagePlatform {
    const raw = (rawPlatform || '').toLowerCase().trim();
    if (raw.startsWith('win') || raw.includes('windows')) return 'windows-amd64';
    if (raw.includes('darwin') || raw.includes('mac')) {
      return raw.includes('arm') || raw.includes('aarch64') ? 'darwin-arm64' : 'darwin-amd64';
    }
    if (raw.includes('linux')) {
      return raw.includes('arm') || raw.includes('aarch64') ? 'linux-arm64' : 'linux-amd64';
    }
    const direct = normalizeOsArch(raw);
    if (direct && SUPPORTED_OFFLINE_PLATFORMS.includes(direct as OfflinePackagePlatform)) {
      return direct as OfflinePackagePlatform;
    }
    // 默认回退 linux-amd64
    return 'linux-amd64';
  }

  /**
   * 确保指定平台的 Agent 二进制就绪（本地优先，缺失时拉取 GitHub 归档包解压提取并缓存）
   */
  async ensureAgentBinary(platform: OfflinePackagePlatform): Promise<{ path: string; filename: string }> {
    await this.binaries.refresh();
    const isWindows = platform === 'windows-amd64';
    const binaryFilename = isWindows ? 'riri-agent.exe' : 'riri-agent';
    const target = `agent-${platform}` as BinaryTarget;

    // 1. 主控已注册的资产优先
    const asset = this.binaries.findForNode('agent', platform);
    if (asset && existsSync(asset.path)) {
      return { path: asset.path, filename: binaryFilename };
    }

    // 2. 本地开发与构建目录探测
    const localCandidates = [
      resolve(process.cwd(), 'artifacts', 'binaries', 'agent', platform, binaryFilename),
      resolve(process.cwd(), '..', '..', 'artifacts', 'binaries', 'agent', platform, binaryFilename),
      resolve(process.cwd(), 'binaries', 'agent', platform, binaryFilename),
      resolve(process.cwd(), 'data', 'binaries', 'custom', `${target}${isWindows ? '.exe' : ''}`)
    ];
    for (const candidate of localCandidates) {
      if (existsSync(candidate)) {
        return { path: candidate, filename: binaryFilename };
      }
    }

    // 3. 远程自动拉取对应版本的 Agent Release 归档并提取二进制
    this.logger.log(`本地缺少 ${platform} 的 Agent 二进制，开始自远程 GitHub/镜像拉取...`);
    const fetchedPath = await this.fetchAndExtractRemoteBinary(platform);
    if (fetchedPath) {
      await this.binaries.refresh();
      return { path: fetchedPath, filename: binaryFilename };
    }

    throw new NotFoundException(
      `未找到 ${platform} 平台的 Agent 二进制程序，请在主控端放置对应的 riri-agent 或检查网络连接`
    );
  }

  /**
   * 从 GitHub Release 或镜像拉取官方归档包并提取二进制
   */
  private async fetchAndExtractRemoteBinary(
    platform: OfflinePackagePlatform
  ): Promise<string | null> {
    const isWindows = platform === 'windows-amd64';
    const [targetOs, targetArch] = platform.split('-');
    const releaseOs = targetOs === 'macos' ? 'darwin' : targetOs;
    const agentVersion = this.readBundledAgentVersion() || '0.4.14';
    const extension = isWindows ? 'zip' : 'tar.gz';
    const archiveName = `riri-agent_${agentVersion}_${releaseOs}_${targetArch}.${extension}`;
    const releasePath = `releases/download/agent-v${agentVersion}/${archiveName}`;

    const settings = await this.settingsService?.getSettings();
    const repoUrl = settings?.githubRepoUrl?.trim() || 'https://github.com/Nanako660/riricloud';
    const defaultUrl = `${repoUrl.replace(/\/+$/, '')}/${releasePath}`;
    const mirrors = settings?.githubMirrorUrls?.length ? settings.githubMirrorUrls : [...DEFAULT_GITHUB_MIRRORS];

    const candidateUrls = [
      defaultUrl,
      ...mirrors.map((m) => `${m.replace(/\/+$/, '')}/${defaultUrl}`)
    ];

    const dataDir = process.env.RIRICLOUD_DATA_DIR
      ? resolve(process.env.RIRICLOUD_DATA_DIR)
      : resolve(process.cwd(), 'data');
    const customDir = resolve(dataDir, 'binaries', 'custom');
    await mkdir(customDir, { recursive: true });
    const targetFilePath = join(customDir, `riri-agent-${platform}-${agentVersion}${isWindows ? '.exe' : ''}`);

    for (const url of candidateUrls) {
      try {
        this.logger.log(`正在尝试下载 Agent 归档包: ${url}`);
        const buffer = await fetchSafeRemoteBuffer(url, { maxBytes: 80 * 1024 * 1024 });

        if (isWindows) {
          const zip = new AdmZip(buffer);
          const entry = zip.getEntry('riri-agent.exe') || zip.getEntries().find((e) => e.entryName.endsWith('riri-agent.exe'));
          if (entry) {
            await writeFile(targetFilePath, entry.getData());
            this.logger.log(`成功解压 Windows 二进制到: ${targetFilePath}`);
            return targetFilePath;
          }
        } else {
          // 解压 tar.gz
          const decompressedTar = gunzipSync(buffer);
          const binaryBuffer = this.extractFileFromTar(decompressedTar, 'riri-agent');
          if (binaryBuffer) {
            await writeFile(targetFilePath, binaryBuffer);
            await chmod(targetFilePath, 0o755);
            this.logger.log(`成功解压 POSIX 二进制到: ${targetFilePath}`);
            return targetFilePath;
          }
        }
      } catch (err) {
        this.logger.warn(`从 ${url} 获取 Agent 归档失败: ${err}`);
      }
    }

    return null;
  }

  /**
   * 纯 JS 轻量 Tar 提取器：提取指定文件名的二进制 Buffer
   */
  private extractFileFromTar(tarBuffer: Buffer, targetFilename: string): Buffer | null {
    let offset = 0;
    while (offset < tarBuffer.length - 512) {
      const header = tarBuffer.subarray(offset, offset + 512);
      // 空块检测
      if (header.every((b) => b === 0)) break;

      // 提取文件名 (前 100 字节)
      let name = header.subarray(0, 100).toString('utf8').replace(/\0/g, '').trim();
      const slashIdx = name.lastIndexOf('/');
      if (slashIdx >= 0) name = name.substring(slashIdx + 1);

      // 提取文件大小 (8 字节八进制，位于 offset 124~135)
      const sizeStr = header.subarray(124, 136).toString('utf8').replace(/\0/g, '').trim();
      const fileSize = parseInt(sizeStr, 8) || 0;

      offset += 512;
      if (name === targetFilename && fileSize > 0 && offset + fileSize <= tarBuffer.length) {
        return tarBuffer.subarray(offset, offset + fileSize);
      }
      // 512 字节边界对齐
      offset += Math.ceil(fileSize / 512) * 512;
    }
    return null;
  }

  /**
   * 读取捆绑的 Agent 版本
   */
  private readBundledAgentVersion(): string {
    const candidates = [
      resolve(process.cwd(), '..', 'agent', 'VERSION'),
      resolve(process.cwd(), 'apps', 'agent', 'VERSION'),
      resolve(process.cwd(), 'binaries', 'AGENT_VERSION'),
      resolve(process.cwd(), 'AGENT_VERSION')
    ];
    for (const c of candidates) {
      try {
        if (existsSync(c)) return readFileSync(c, 'utf8').trim();
      } catch {
        // ignore
      }
    }
    return '';
  }

  /**
   * 生成配置 YAML
   */
  renderConfigYaml(node: OfflinePackageNode, publicBaseUrl?: string): string {
    const baseUrl = publicBaseUrl ?? resolvePublicBaseUrl();
    const isHttp = node.communicationMode === 'HTTP';
    const masterUrl = isHttp
      ? baseUrl
      : appendPublicPath(toWebSocketBaseUrl(baseUrl), 'ws/agent');

    return `# =========================================================
# RiriCloud Agent 自动生成离线配置文件
# 节点 ID: ${node.id}
# 节点名称: ${node.name}
# 网络类型: ${node.reachability || 'PUBLIC'}
# =========================================================

masterUrl: "${masterUrl}"
agentToken: "${node.agentToken}"
mode: "${isHttp ? 'http' : 'ws'}"
heartbeatSecs: 15
pollIntervalSecs: ${node.pollIntervalSecs || 15}
singboxBinPath: ""
singboxConfPath: ""
`;
  }

  /**
   * 渲染 Windows 离线安装 PowerShell 脚本
   */
  renderWindowsInstallPs1(node: OfflinePackageNode): string {
    return `# =========================================================
# RiriCloud Agent 4 阶段全离线 Windows 安装脚本
# 节点: ${node.name} (${node.id})
# =========================================================

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host "   RiriCloud Edge Agent 离线自动化安装向导 (Windows)     " -ForegroundColor Cyan
Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host ""

# [1/4] 环境与权限检查
Write-Host "[1/4] 环境检查与管理员权限检测..." -ForegroundColor Yellow
$currentIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($currentIdentity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "[提示] 当前非管理员权限，正在唤起 UAC 授权窗口..." -ForegroundColor Cyan
    $scriptPath = $MyInvocation.MyCommand.Path
    if (-not $scriptPath) {
        $scriptPath = Join-Path $PSScriptRoot "install.ps1"
    }
    Start-Process -FilePath "powershell.exe" -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File '${'$'}scriptPath'" -Verb RunAs
    exit 0
}
Write-Host "  -> 管理员权限验证通过" -ForegroundColor Green

# 检查架构
$arch = $env:PROCESSOR_ARCHITECTURE
if ($arch -ne 'AMD64' -and $arch -ne 'ARM64') {
    Write-Host "[警告] 当前系统架构为 $arch，推荐在 64 位系统运行。" -ForegroundColor Yellow
}

# [2/4] 离线文件完整性自检
Write-Host "[2/4] 离线安装介质校验..." -ForegroundColor Yellow
$scriptDir = $PSScriptRoot
if (-not $scriptDir) { $scriptDir = (Get-Location).Path }

$agentExeSource = Join-Path $scriptDir "riri-agent.exe"
$configYamlSource = Join-Path $scriptDir "config.yaml"

if (-not (Test-Path $agentExeSource)) {
    Write-Host "[错误] 缺失核心程序: $agentExeSource" -ForegroundColor Red
    Write-Host "请确保解压后的目录包含 riri-agent.exe。" -ForegroundColor Red
    Read-Host "按回车退出"
    exit 1
}
if (-not (Test-Path $configYamlSource)) {
    Write-Host "[错误] 缺失配置文件: $configYamlSource" -ForegroundColor Red
    Read-Host "按回车退出"
    exit 1
}
$exeSize = (Get-Item $agentExeSource).Length
Write-Host "  -> riri-agent.exe 就绪 (大小: $([math]::Round($exeSize/1MB, 2)) MB)" -ForegroundColor Green
Write-Host "  -> config.yaml 预置配置就绪" -ForegroundColor Green

# [3/4] 部署文件落盘
Write-Host "[3/4] 二进制落盘与配置部署..." -ForegroundColor Yellow
$installDir = "C:\\Program Files\\RiriCloud"
$dataDir = "C:\\ProgramData\\RiriCloud"

if (-not (Test-Path $installDir)) {
    New-Item -Path $installDir -ItemType Directory -Force | Out-Null
}
if (-not (Test-Path $dataDir)) {
    New-Item -Path $dataDir -ItemType Directory -Force | Out-Null
}

$destExe = Join-Path $installDir "riri-agent.exe"
$destConfig = Join-Path $dataDir "config.yaml"

# 优雅停止已有服务以防文件被占用锁死
$existingService = Get-Service -Name "riri-agent" -ErrorAction SilentlyContinue
if ($existingService -and $existingService.Status -eq 'Running') {
    Write-Host "  -> 发现正在运行的旧版服务，正在安全停止..." -ForegroundColor Gray
    Stop-Service -Name "riri-agent" -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
}

Copy-Item -Path $agentExeSource -Destination $destExe -Force
Copy-Item -Path $configYamlSource -Destination $destConfig -Force
Write-Host "  -> 程序已安装至: $destExe" -ForegroundColor Green
Write-Host "  -> 配置已落盘至: $destConfig" -ForegroundColor Green

# [4/4] 注册系统服务并拉起
Write-Host "[4/4] 注册 Windows 系统自启服务与健康检查..." -ForegroundColor Yellow

# 调用 agent CLI 注册自启服务
& "$destExe" service install --config "$destConfig" 2>$null
if ($LASTEXITCODE -ne 0) {
    # 尝试覆盖安装
    & "$destExe" service uninstall 2>$null
    & "$destExe" service install --config "$destConfig"
}

# 启动服务
Start-Service -Name "riri-agent" -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

$service = Get-Service -Name "riri-agent" -ErrorAction SilentlyContinue
$status = if ($service) { $service.Status } else { "未注册" }

Write-Host ""
Write-Host "=========================================================" -ForegroundColor Green
Write-Host "            RiriCloud Agent 离线安装成功!                " -ForegroundColor Green
Write-Host "=========================================================" -ForegroundColor Green
Write-Host " 服务名称 : riri-agent" -ForegroundColor White
Write-Host " 运行状态 : $status" -ForegroundColor $(if ($status -eq 'Running') { 'Green' } else { 'Yellow' })
Write-Host " 执行程序 : $destExe" -ForegroundColor White
Write-Host " 配置文件 : $destConfig" -ForegroundColor White
Write-Host " 运行日志 : $dataDir\\agent.log" -ForegroundColor White
Write-Host "=========================================================" -ForegroundColor Green
Write-Host ""
Write-Host "提示: 可在主控面板查看节点是否已变为在线状态。" -ForegroundColor Cyan
Write-Host ""
Read-Host "按回车键完成安装并关闭窗口"
`;
  }

  /**
   * 渲染 Windows 双击批处理
   */
  renderWindowsInstallBat(): string {
    return `@echo off
chcp 65001 >nul
title RiriCloud Agent 离线安装向导
echo [RiriCloud] 正在启动离线安装向导...
powershell -NoProfile -ExecutionPolicy Bypass -Command "& { Start-Process PowerShell -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File ""%~dp0install.ps1""' -Verb RunAs }"
if %ERRORLEVEL% neq 0 (
    echo [错误] 启动 PowerShell 提权失败，错误码: %ERRORLEVEL%
    pause
)
`;
  }

  /**
   * 渲染 Windows 卸载批处理
   */
  renderWindowsUninstallBat(): string {
    return `@echo off
chcp 65001 >nul
title RiriCloud Agent 卸载程序
echo [RiriCloud] 正在停止并注销服务...
powershell -NoProfile -ExecutionPolicy Bypass -Command "& { Start-Process PowerShell -ArgumentList '-NoProfile -ExecutionPolicy Bypass -Command ""Stop-Service -Name riri-agent -Force -ErrorAction SilentlyContinue; if (Get-Service -Name riri-agent -ErrorAction SilentlyContinue) { sc.exe delete riri-agent }; Write-Host ''[RiriCloud] Agent 服务已成功卸载并注销'' -ForegroundColor Green; Start-Sleep -Seconds 2""' -Verb RunAs }"
`;
  }

  /**
   * 渲染 POSIX 离线安装 Shell 脚本 (Linux / macOS)
   */
  renderPosixInstallSh(node: OfflinePackageNode): string {
    return `#!/usr/bin/env sh
# =========================================================
# RiriCloud Agent 4 阶段全离线 Shell 安装脚本
# 节点: ${node.name} (${node.id})
# =========================================================
set -e

# [1/4] 环境检查与权限自动流转
echo "==> [1/4] 环境检查与权限校验..."
if [ "$(id -u)" -ne 0 ]; then
  if command -v sudo >/dev/null 2>&1; then
    echo "  -> 检测到非 root 用户，自动切换为 sudo 模式..."
    exec sudo sh "$0" "$@"
  else
    echo "[错误] 离线安装需要 root 权限，请切换到 root 用户后再执行。" >&2
    exit 1
  fi
fi

# [2/4] 离线文件完整性自检
echo "==> [2/4] 检查离线安装介质..."
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SOURCE_BIN="$SCRIPT_DIR/riri-agent"
SOURCE_CONF="$SCRIPT_DIR/config.yaml"

if [ ! -f "$SOURCE_BIN" ]; then
  echo "[错误] 缺少可执行文件: $SOURCE_BIN" >&2
  exit 1
fi
if [ ! -f "$SOURCE_CONF" ]; then
  echo "[错误] 缺少配置文件: $SOURCE_CONF" >&2
  exit 1
fi

chmod +x "$SOURCE_BIN"
echo "  -> 离线介质检验通过"

# [3/4] 部署文件落盘
echo "==> [3/4] 二进制与配置部署落盘..."
INSTALL_BIN="/usr/local/bin/riri-agent"
CONF_DIR="/etc/riricloud"
DEST_CONF="$CONF_DIR/config.yaml"

# 优雅停机以防文件占用
if command -v systemctl >/dev/null 2>&1 && systemctl is-active --quiet riri-agent; then
  echo "  -> 正在停止已有 systemd 服务..."
  systemctl stop riri-agent || true
fi

mkdir -p /usr/local/bin "$CONF_DIR" /var/lib/riri-agent
cp -f "$SOURCE_BIN" "$INSTALL_BIN"
chmod 0755 "$INSTALL_BIN"

cp -f "$SOURCE_CONF" "$DEST_CONF"
chmod 0600 "$DEST_CONF"

echo "  -> 程序已安装至: $INSTALL_BIN"
echo "  -> 配置已落盘至: $DEST_CONF"

# [4/4] 注册系统自启服务并拉起
echo "==> [4/4] 注册自启服务与健康检查..."
"$INSTALL_BIN" service install --config "$DEST_CONF" || true

if command -v systemctl >/dev/null 2>&1; then
  systemctl daemon-reload || true
  systemctl enable riri-agent || true
  systemctl restart riri-agent || true
elif command -v service >/dev/null 2>&1; then
  service riri-agent restart || true
fi

echo ""
echo "========================================================="
echo "           RiriCloud Agent 离线安装成功!                 "
echo "========================================================="
echo " 执行程序 : $INSTALL_BIN"
echo " 配置文件 : $DEST_CONF"
echo " 工作目录 : /var/lib/riri-agent"
echo " 日志路径 : /var/lib/riri-agent/agent.log"
echo "========================================================="
echo "提示: 可在主控面板检查该节点状态是否已上线。"
`;
  }

  /**
   * 渲染 POSIX 卸载脚本
   */
  renderPosixUninstallSh(): string {
    return `#!/usr/bin/env sh
set -e
if [ "$(id -u)" -ne 0 ]; then
  if command -v sudo >/dev/null 2>&1; then
    exec sudo sh "$0" "$@"
  else
    echo "需要 root 权限执行卸载" >&2
    exit 1
  fi
fi

echo "正在停止并卸载 RiriCloud Agent..."
if command -v /usr/local/bin/riri-agent >/dev/null 2>&1; then
  /usr/local/bin/riri-agent service uninstall || true
fi

if command -v systemctl >/dev/null 2>&1; then
  systemctl stop riri-agent 2>/dev/null || true
  systemctl disable riri-agent 2>/dev/null || true
  rm -f /etc/systemd/system/riri-agent.service
  systemctl daemon-reload || true
fi

rm -f /usr/local/bin/riri-agent
echo "Agent 卸载完成。"
`;
  }

  /**
   * 渲染说明文本
   */
  renderReadmeText(node: OfflinePackageNode, platform: OfflinePackagePlatform): string {
    const isWin = platform === 'windows-amd64';
    return `=========================================================
RiriCloud Agent 离线安装包
=========================================================
节点名称: ${node.name}
节点 ID: ${node.id}
目标平台: ${platform}
网络类型: ${node.reachability || 'PUBLIC'}

【使用方法】
${
  isWin
    ? `1. 将本压缩包解压至目标机器的任意目录；
2. 鼠标右键以管理员身份运行 [install.bat]（或双击按提示授权 UAC）；
3. 安装完成后程序将自动注册为 Windows 系统服务 (riri-agent) 并在后台持续运行；
4. 若需卸载，运行 [uninstall.bat] 即可。`
    : `1. 将本压缩包上传至目标服务器解压：
   tar -xzf riri-agent-offline-*.tar.gz
   cd riri-agent-offline-*
2. 执行一键安装脚本（需要 root 或 sudo 权限）：
   sudo sh install.sh
3. 安装脚本会自动完成环境校验、落盘并注册开机自启 systemd 服务；
4. 若需卸载，执行: sudo sh uninstall.sh`
}

【运维支持】
官方文档: https://github.com/Nanako660/riricloud
`;
  }

  /**
   * 核心打包：组装并在内存流式压缩生成离线包
   */
  async generateOfflinePackageStream(
    node: OfflinePackageNode,
    rawPlatform?: string,
    publicBaseUrl?: string
  ): Promise<OfflinePackageResult> {
    const platform = this.normalizePlatform(rawPlatform);
    const isWindows = platform === 'windows-amd64';
    const { path: binaryPath, filename: binaryFilename } = await this.ensureAgentBinary(platform);

    const safeNodeName = (node.name || 'node').replace(/[^a-zA-Z0-9_\u4e00-\u9fa5-]/g, '_');
    const ext = isWindows ? 'zip' : 'tar.gz';
    const archiveFilename = `riri-agent-offline-${safeNodeName}-${platform}.${ext}`;
    const mimeType = isWindows ? 'application/zip' : 'application/gzip';

    const configYaml = this.renderConfigYaml(node, publicBaseUrl);
    const readme = this.renderReadmeText(node, platform);

    if (isWindows) {
      const archive = archiver('zip', { zlib: { level: 6 } });
      archive.file(binaryPath, { name: binaryFilename });
      archive.append(configYaml, { name: 'config.yaml' });
      archive.append(this.renderWindowsInstallPs1(node), { name: 'install.ps1' });
      archive.append(this.renderWindowsInstallBat(), { name: 'install.bat' });
      archive.append(this.renderWindowsUninstallBat(), { name: 'uninstall.bat' });
      archive.append(readme, { name: 'README.txt' });
      void archive.finalize();
      return { stream: archive, filename: archiveFilename, mimeType };
    } else {
      const archive = archiver('tar', { gzip: true, gzipOptions: { level: 6 } });
      archive.file(binaryPath, { name: binaryFilename, mode: 0o755 });
      archive.append(configYaml, { name: 'config.yaml', mode: 0o600 });
      archive.append(this.renderPosixInstallSh(node), { name: 'install.sh', mode: 0o755 });
      archive.append(this.renderPosixUninstallSh(), { name: 'uninstall.sh', mode: 0o755 });
      archive.append(readme, { name: 'README.txt', mode: 0o644 });
      void archive.finalize();
      return { stream: archive, filename: archiveFilename, mimeType };
    }
  }
}
