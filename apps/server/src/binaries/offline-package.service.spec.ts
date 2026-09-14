import { Test, TestingModule } from '@nestjs/testing';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { OfflinePackageService, type OfflinePackageNode } from './offline-package.service';
import { BinariesService } from './binaries.service';
import { SettingsService } from '../system/settings.service';

describe('OfflinePackageService', () => {
  let service: OfflinePackageService;
  const dummyBinPath = join(process.cwd(), 'temp-dummy-agent.exe');

  beforeAll(() => {
    writeFileSync(dummyBinPath, 'mock-binary-content');
  });

  afterAll(() => {
    if (existsSync(dummyBinPath)) {
      unlinkSync(dummyBinPath);
    }
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OfflinePackageService,
        {
          provide: BinariesService,
          useValue: {
            refresh: jest.fn().mockResolvedValue(undefined),
            findForNode: jest.fn().mockReturnValue({ path: dummyBinPath, filename: 'riri-agent.exe' })
          }
        },
        {
          provide: SettingsService,
          useValue: {
            getSettings: jest.fn().mockResolvedValue({
              githubRepoUrl: 'https://github.com/Nanako660/riricloud',
              githubMirrorUrls: []
            })
          }
        }
      ]
    }).compile();

    service = module.get<OfflinePackageService>(OfflinePackageService);
  });

  it('规范化平台参数', () => {
    expect(service.normalizePlatform('windows-amd64')).toBe('windows-amd64');
    expect(service.normalizePlatform('win')).toBe('windows-amd64');
    expect(service.normalizePlatform('darwin-arm64')).toBe('darwin-arm64');
    expect(service.normalizePlatform('mac-arm64')).toBe('darwin-arm64');
    expect(service.normalizePlatform('linux-arm64')).toBe('linux-arm64');
    expect(service.normalizePlatform('unknown-arch')).toBe('linux-amd64');
  });

  it('正确渲染预置 config.yaml', () => {
    const node: OfflinePackageNode = {
      id: 'node-123',
      name: '东京 NAT 节点',
      agentToken: 'token-xyz-123',
      communicationMode: 'WS',
      pollIntervalSecs: 20,
      reachability: 'NAT'
    };
    const yaml = service.renderConfigYaml(node, 'https://panel.example.com');
    expect(yaml).toContain('masterUrl: "wss://panel.example.com/ws/agent"');
    expect(yaml).toContain('agentToken: "token-xyz-123"');
    expect(yaml).toContain('mode: "ws"');
    expect(yaml).toContain('pollIntervalSecs: 20');
  });

  it('HTTP 模式生成正确的 masterUrl', () => {
    const node: OfflinePackageNode = {
      id: 'node-http',
      name: 'HTTP 节点',
      agentToken: 'token-http',
      communicationMode: 'HTTP',
      pollIntervalSecs: 30
    };
    const yaml = service.renderConfigYaml(node, 'https://panel.example.com');
    expect(yaml).toContain('masterUrl: "https://panel.example.com"');
    expect(yaml).toContain('mode: "http"');
  });

  it('生成包含 4 阶段的 Windows 安装脚本', () => {
    const node: OfflinePackageNode = {
      id: 'node-win',
      name: 'Win 节点',
      agentToken: 'token-win'
    };
    const ps1 = service.renderWindowsInstallPs1(node);
    expect(ps1).toContain('[1/4] 环境检查与管理员权限检测');
    expect(ps1).toContain('[2/4] 离线安装介质校验');
    expect(ps1).toContain('[3/4] 二进制落盘与配置部署');
    expect(ps1).toContain('[4/4] 注册 Windows 系统自启服务与健康检查');
    expect(ps1).toContain('riri-agent.exe');
    expect(ps1).toContain('config.yaml');
  });

  it('生成包含 4 阶段的 Linux 安装脚本', () => {
    const node: OfflinePackageNode = {
      id: 'node-linux',
      name: 'Linux 节点',
      agentToken: 'token-linux'
    };
    const sh = service.renderPosixInstallSh(node);
    expect(sh).toContain('[1/4] 环境检查与权限校验');
    expect(sh).toContain('[2/4] 检查离线安装介质');
    expect(sh).toContain('[3/4] 二进制与配置部署落盘');
    expect(sh).toContain('[4/4] 注册自启服务与健康检查');
    expect(sh).toContain('/usr/local/bin/riri-agent');
    expect(sh).toContain('CONF_DIR="/etc/riricloud"');
    expect(sh).toContain('DEST_CONF="$CONF_DIR/config.yaml"');
  });

  it('Windows 离线流式打包成功输出 zip 归档', async () => {
    const node: OfflinePackageNode = {
      id: 'node-pkg-win',
      name: 'Windows 测试节点',
      agentToken: 'token-pkg-win'
    };
    const result = await service.generateOfflinePackageStream(node, 'windows-amd64', 'http://localhost:3000');
    expect(result.mimeType).toBe('application/zip');
    expect(result.filename).toContain('windows-amd64.zip');
    expect(result.stream).toBeDefined();
    await new Promise((res, rej) => {
      result.stream.on('end', res);
      result.stream.on('error', rej);
      result.stream.resume();
    });
  });

  it('Linux 离线流式打包成功输出 tar.gz 归档', async () => {
    const node: OfflinePackageNode = {
      id: 'node-pkg-linux',
      name: 'Linux 测试节点',
      agentToken: 'token-pkg-linux'
    };
    const result = await service.generateOfflinePackageStream(node, 'linux-amd64', 'http://localhost:3000');
    expect(result.mimeType).toBe('application/gzip');
    expect(result.filename).toContain('linux-amd64.tar.gz');
    expect(result.stream).toBeDefined();
    await new Promise((res, rej) => {
      result.stream.on('end', res);
      result.stream.on('error', rej);
      result.stream.resume();
    });
  });
});
