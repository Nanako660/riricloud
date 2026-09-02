import { BinariesController } from './binaries.controller';

describe('BinariesController', () => {
  it('按安装器 User-Agent 重定向到匹配的 Agent 二进制', async () => {
    const response = { redirect: jest.fn() };
    const binaries = {
      authorizeDownload: jest.fn().mockResolvedValue(undefined),
      resolveAgentTarget: jest.fn(() => 'agent-linux-amd64'),
      buildConfiguredDownloadUrl: jest.fn(() => 'https://master.example.com/api/v1/downloads/binaries/agent-linux-amd64?token=secret')
    };
    const controller = new BinariesController(binaries as never);
    const request = {
      headers: {
        host: '127.0.0.1:3000',
        'x-forwarded-host': 'panel.example.com',
        'x-forwarded-proto': 'https'
      },
      protocol: 'http'
    };

    await controller.downloadAgent('riri-agent-installer/linux-amd64', 'secret', undefined, request as never, response as never);

    expect(binaries.authorizeDownload).toHaveBeenCalledWith('secret');
    expect(binaries.resolveAgentTarget).toHaveBeenCalledWith('riri-agent-installer/linux-amd64');
    expect(binaries.buildConfiguredDownloadUrl).toHaveBeenCalledWith('agent-linux-amd64', 'secret', 'https://panel.example.com');
    expect(response.redirect).toHaveBeenCalledWith(302, expect.stringContaining('agent-linux-amd64'));
  });
});
