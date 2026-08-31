import { BinariesController } from './binaries.controller';

describe('BinariesController', () => {
  it('返回安装脚本并设置 shell 下载响应头', () => {
    const response = { setHeader: jest.fn() };
    const binaries = { getInstallScript: jest.fn(() => '#!/bin/sh\necho ok\n') };
    const controller = new BinariesController(binaries as never);

    expect(controller.install(response as never)).toBe('#!/bin/sh\necho ok\n');
    expect(response.setHeader).toHaveBeenCalledWith('Content-Type', 'text/plain; charset=utf-8');
    expect(response.setHeader).toHaveBeenCalledWith('Content-Length', 18);
    expect(response.setHeader).toHaveBeenCalledWith('Content-Disposition', 'inline; filename="install-agent.sh"');
  });
});
