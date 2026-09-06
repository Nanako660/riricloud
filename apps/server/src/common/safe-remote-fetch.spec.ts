import { assertSafeRemoteUrl } from './safe-remote-fetch';

describe('safe-remote-fetch', () => {
  afterEach(() => {
    delete process.env.NODE_ENV;
    delete process.env.RIRICLOUD_ENV;
  });

  it.each([
    'http://127.0.0.1/file',
    'http://10.0.0.1/file',
    'http://169.254.169.254/latest/meta-data',
    'http://[::1]/file',
    'file:///etc/passwd',
    'http://user:password@example.com/file'
  ])('拒绝危险远程地址 %s', async (url) => {
    await expect(assertSafeRemoteUrl(url, false)).rejects.toThrow();
  });

  it('生产环境拒绝公网 HTTP 下载', async () => {
    process.env.NODE_ENV = 'production';
    await expect(assertSafeRemoteUrl('http://93.184.216.34/file')).rejects.toThrow('HTTPS');
  });
});
