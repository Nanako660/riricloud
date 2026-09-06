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
});
