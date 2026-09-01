import { BinariesController } from './binaries.controller';

describe('BinariesController', () => {
  it('按安装器 User-Agent 重定向到匹配的 Agent 二进制', async () => {
    const response = { redirect: jest.fn() };
    const binaries = {
      authorizeDownload: jest.fn().mockResolvedValue(undefined),
      resolveAgentTarget: jest.fn(() => 'agent-linux-amd64'),
      buildDownloadUrl: jest.fn(() => 'https://master.example.com/api/v1/downloads/binaries/agent-linux-amd64?token=secret')
    };
    const controller = new BinariesController(binaries as never);

    await controller.downloadAgent('riri-agent-installer/linux-amd64', 'secret', undefined, response as never);

    expect(binaries.authorizeDownload).toHaveBeenCalledWith('secret');
    expect(binaries.resolveAgentTarget).toHaveBeenCalledWith('riri-agent-installer/linux-amd64');
    expect(response.redirect).toHaveBeenCalledWith(302, expect.stringContaining('agent-linux-amd64'));
  });
});
