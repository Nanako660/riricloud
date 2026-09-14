import { BinariesController } from './binaries.controller';

describe('BinariesController', () => {
  it('按安装器 User-Agent 通过 Header 鉴权后直接流式返回 Agent 二进制', async () => {
    const response = { setHeader: jest.fn() };
    const binaries = {
      authorizeDownload: jest.fn().mockResolvedValue(undefined),
      resolveAgentTarget: jest.fn(() => 'agent-linux-amd64'),
      getAsset: jest.fn(() => ({ path: process.execPath, size: 3, filename: 'riri-agent' }))
    };
    const controller = new BinariesController(binaries as never);

    const result = await controller.downloadAgent('riri-agent-installer/linux-amd64', 'secret', response as never);

    expect(binaries.authorizeDownload).toHaveBeenCalledWith('secret');
    expect(binaries.resolveAgentTarget).toHaveBeenCalledWith('riri-agent-installer/linux-amd64');
    expect(binaries.getAsset).toHaveBeenCalledWith('agent-linux-amd64');
    expect(response.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(result).toBeDefined();
  });

  it('agentInstaller 支持 Query Token 鉴权与 format=bat 渲染', async () => {
    const response = { setHeader: jest.fn() };
    const binaries = {
      findNodeByToken: jest.fn().mockResolvedValue({ id: 'node-1', communicationMode: 'WS' }),
      resolveAgentTarget: jest.fn(() => 'agent-windows-amd64')
    };
    const installer = {
      renderWindowsInstallBat: jest.fn().mockResolvedValue('@echo off\r\n')
    };
    const request = {
      headers: { host: 'panel.example.com' },
      protocol: 'https'
    };
    const controller = new BinariesController(binaries as never, installer as never);

    const result = await controller.agentInstaller(
      undefined,
      undefined,
      'token-from-query',
      'ws',
      'bat',
      'windows-amd64',
      '1',
      request as never,
      response as never
    );

    expect(binaries.findNodeByToken).toHaveBeenCalledWith('token-from-query');
    expect(installer.renderWindowsInstallBat).toHaveBeenCalled();
    expect(response.setHeader).toHaveBeenCalledWith('Content-Disposition', 'attachment; filename="riri-install.bat"');
    expect(result).toContain('@echo off');
  });
});
