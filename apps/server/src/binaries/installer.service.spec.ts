import { Test } from '@nestjs/testing';
import { BinariesInstallerService } from './installer.service';
import { BinariesService, type BinaryAsset } from './binaries.service';
import { SettingsService, DEFAULT_GITHUB_MIRRORS } from '../system/settings.service';

describe('BinariesInstallerService', () => {
  let service: BinariesInstallerService;
  const findForNode = jest.fn();
  const buildDownloadUrl = jest.fn();
  const getSettings = jest.fn();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        BinariesInstallerService,
        { provide: BinariesService, useValue: { findForNode, buildDownloadUrl } },
        { provide: SettingsService, useValue: { getSettings } }
      ]
    }).compile();
    service = moduleRef.get(BinariesInstallerService);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    findForNode.mockReturnValue(undefined);
    buildDownloadUrl.mockImplementation((target: string, _token: string, base?: string) => `${base ?? 'https://panel.example.com'}/api/v1/downloads/binaries/${target}`);
    getSettings.mockResolvedValue({
      publicBaseUrl: 'https://panel.example.com',
      githubRepoUrl: 'https://github.com/Nanako660/riricloud',
      githubMirrorUrls: ['https://ghfast.top/', 'gh-proxy.com']
    });
  });

  it('POSIX 脚本内嵌版本/仓库/镜像与主控兜底地址，镜像 join 规范化尾斜杠', async () => {
    const script = await service.renderShellScript('linux-amd64', 'https://panel.example.com');
    expect(script).toContain('RIRI_VERSION="0.7.3"');
    expect(script).toContain('RIRI_GITHUB_URL="https://github.com/Nanako660/riricloud/releases/download/agent-v0.7.3/riri-agent_0.7.3_linux_amd64.tar.gz"');
    // 镜像以空格列表注入（缺 scheme 的条目补 https://），运行时按「尾斜杠补齐 + 拼 GitHub URL」join
    expect(script).toContain('RIRI_MIRRORS="https://ghfast.top/ https://gh-proxy.com"');
    expect(script).toContain('$mirror$RIRI_GITHUB_URL');
    expect(script).toContain('$mirror/$RIRI_GITHUB_URL');
    expect(script).toContain('RIRI_FALLBACK_URL="https://panel.example.com/api/v1/downloads/binaries/agent-linux-amd64"');
    expect(script).toContain('riri_sha256');
    expect(script).toContain('GITHUB_MIRRORS="$RIRI_MIRRORS"');
  });

  it('PowerShell 脚本使用 zip 资产与 darwin 平台映射，主控资产 sha 作为兜底校验', async () => {
    const asset: Partial<BinaryAsset> = { sha256: 'a'.repeat(64), version: '0.7.3' };
    findForNode.mockReturnValue(asset);
    const script = await service.renderPowershellScript('windows-amd64', 'https://panel.example.com');
    expect(script).toContain('$RiriGithubUrl = "https://github.com/Nanako660/riricloud/releases/download/agent-v0.7.3/riri-agent_0.7.3_windows_amd64.zip"');
    expect(script).toContain('$RiriFallbackSha256 = "' + 'a'.repeat(64) + '"');
    expect(script).toContain('Get-FileHash');
    expect(script).toContain('$env:GITHUB_MIRRORS');

    const macos = await service.renderShellScript('macos-arm64', 'https://panel.example.com');
    expect(macos).toContain('riri-agent_0.7.3_darwin_arm64.tar.gz');
  });

  it('设置缺省时回退内置默认镜像', async () => {
    getSettings.mockResolvedValue({ publicBaseUrl: '', githubRepoUrl: '', githubMirrorUrls: [] });
    const script = await service.renderShellScript('linux-amd64', undefined);
    for (const mirror of DEFAULT_GITHUB_MIRRORS) {
      expect(script).toContain(mirror);
    }
    expect(script).toContain('RIRI_GITHUB_URL="https://github.com/Nanako660/riricloud/releases/download');
  });
});
