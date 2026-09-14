import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Test } from '@nestjs/testing';
import { BinariesInstallerService } from './installer.service';
import { BinariesService, type BinaryAsset } from './binaries.service';
import { SettingsService, DEFAULT_GITHUB_MIRRORS } from '../system/settings.service';

const currentAgentVersion = existsSync(resolve(__dirname, '../../../agent/VERSION'))
  ? readFileSync(resolve(__dirname, '../../../agent/VERSION'), 'utf8').trim()
  : '0.7.5';

describe('BinariesInstallerService', () => {
  let service: BinariesInstallerService;
  const findForNode = jest.fn();
  const buildDownloadUrl = jest.fn();
  const refresh = jest.fn();
  const getSettings = jest.fn();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        BinariesInstallerService,
        { provide: BinariesService, useValue: { findForNode, buildDownloadUrl, refresh } },
        { provide: SettingsService, useValue: { getSettings } }
      ]
    }).compile();
    service = moduleRef.get(BinariesInstallerService);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    refresh.mockResolvedValue(undefined);
    findForNode.mockReturnValue(undefined);
    buildDownloadUrl.mockImplementation((target: string, _token: string, base?: string) => `${base ?? 'https://panel.example.com'}/api/v1/downloads/binaries/${target}`);
    getSettings.mockResolvedValue({
      publicBaseUrl: 'https://panel.example.com',
      githubRepoUrl: 'https://github.com/Nanako660/riricloud',
      githubMirrorUrls: ['https://ghfast.top/', 'gh-proxy.com']
    });
  });

  it('POSIX 脚本内嵌版本/仓库/镜像与主控兜底地址，包含 4 阶段流程、sudo 提权与运维卡片', async () => {
    const script = await service.renderShellScript('linux-amd64', 'https://panel.example.com');
    expect(script).toContain(`RIRI_VERSION="${currentAgentVersion}"`);
    expect(script).toContain('RIRI_TARGET_ARCH="amd64"');
    expect(script).toContain(`RIRI_GITHUB_URL="https://github.com/Nanako660/riricloud/releases/download/agent-v${currentAgentVersion}/riri-agent_${currentAgentVersion}_linux_amd64.tar.gz"`);
    // 镜像以空格列表注入（缺 scheme 的条目补 https://），运行时按「尾斜杠补齐 + 拼 GitHub URL」join
    expect(script).toContain('RIRI_MIRRORS="https://ghfast.top/ https://gh-proxy.com"');
    expect(script).toContain('$mirror$RIRI_GITHUB_URL');
    expect(script).toContain('$mirror/$RIRI_GITHUB_URL');
    expect(script).toContain('RIRI_FALLBACK_URL="https://panel.example.com/api/v1/downloads/binaries/agent-linux-amd64"');
    expect(script).toContain('riri_sha256');
    expect(script).toContain('[1/4] 环境检查');
    expect(script).toContain('sudo');
    expect(script).toContain('curl -#');
    expect(script).toContain('[3/4] 部署二进制并检查既有服务');
    expect(script).toContain('systemctl stop riri-agent');
    expect(script).toContain('[4/4] 系统服务注册与健康检查');
    expect(script).toContain('RiriCloud Agent 安装就绪');
    // 渲染前必须刷新资产映射，保证嵌入 SHA 与磁盘当前产物一致
    expect(refresh).toHaveBeenCalled();
    expect(script).toContain('GITHUB_MIRRORS="$RIRI_MIRRORS"');
  });

  it('PowerShell 脚本使用 zip 资产、UAC 智能提权与平滑停机，输出运维卡片', async () => {
    const asset: Partial<BinaryAsset> = { sha256: 'a'.repeat(64), version: currentAgentVersion };
    findForNode.mockReturnValue(asset);
    const script = await service.renderPowershellScript('windows-amd64', 'https://panel.example.com');
    expect(script).toContain(`$RiriGithubUrl = "https://github.com/Nanako660/riricloud/releases/download/agent-v${currentAgentVersion}/riri-agent_${currentAgentVersion}_windows_amd64.zip"`);
    expect(script).toContain('$RiriTargetArch = "amd64"');
    expect(script).toContain('$RiriFallbackSha256 = "' + 'a'.repeat(64) + '"');
    expect(script).toContain('Get-FileHash');
    expect(script).toContain('$env:GITHUB_MIRRORS');
    expect(script).toContain('[1/4] 环境检查');
    expect(script).toContain('Start-Process');
    expect(script).toContain('-Verb RunAs');
    expect(script).toContain('-Elevated');
    expect(script).toContain('curl.exe -#');
    expect(script).toContain('Stop-Service -Name \'riri-agent\'');
    expect(script).toContain('[4/4] 系统服务注册与健康检查');
    expect(script).toContain('RiriCloud Agent 安装就绪');

    const macos = await service.renderShellScript('macos-arm64', 'https://panel.example.com');
    expect(macos).toContain(`riri-agent_${currentAgentVersion}_darwin_arm64.tar.gz`);
    expect(macos).toContain('RIRI_TARGET_ARCH="arm64"');
  });

  it('设置缺省时回退内置默认镜像', async () => {
    getSettings.mockResolvedValue({ publicBaseUrl: '', githubRepoUrl: '', githubMirrorUrls: [] });
    const script = await service.renderShellScript('linux-amd64', undefined);
    for (const mirror of DEFAULT_GITHUB_MIRRORS) {
      expect(script).toContain(mirror);
    }
    expect(script).toContain('RIRI_GITHUB_URL="https://github.com/Nanako660/riricloud/releases/download');
  });

  it('支持预编排参数：Shell 脚本内嵌预设 Master 与 Token', async () => {
    const script = await service.renderShellScript('linux-amd64', 'https://panel.example.com', {
      masterUrl: 'wss://panel.example.com/ws/agent',
      agentToken: 'test-token-123'
    });
    expect(script).toContain('RIRI_PRESET_MASTER="wss://panel.example.com/ws/agent"');
    expect(script).toContain('RIRI_PRESET_AGENT_TOKEN="test-token-123"');
  });

  it('renderWindowsInstallBat 输出自包含 CRLF 的 .bat 批处理脚本并集成自提权与 PowerShell 引擎', async () => {
    const bat = await service.renderWindowsInstallBat('windows-amd64', 'https://panel.example.com', {
      masterUrl: 'wss://panel.example.com/ws/agent',
      agentToken: 'test-token-456'
    });
    expect(bat).toContain('@echo off\r\n');
    expect(bat).toContain('chcp 65001 >nul\r\n');
    expect(bat).toContain('net session >nul 2>&1\r\n');
    expect(bat).toContain('Start-Process -FilePath \'%~f0\' -Verb RunAs');
    expect(bat).toContain(':POWERSHELL_START\r\n');
    expect(bat).toContain('$MasterUrl = \'wss://panel.example.com/ws/agent\'');
    expect(bat).toContain('$AgentToken = \'test-token-456\'');
  });
});
