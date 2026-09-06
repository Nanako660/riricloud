import { clearAuthCookie, readAuthCookie, setAuthCookie } from './auth-cookie';

describe('auth cookie', () => {
  it('设置 HttpOnly、SameSite 和路径属性，并可从请求读取', () => {
    const response = { setHeader: jest.fn() };
    setAuthCookie(response as never, 'jwt.token');

    const header = response.setHeader.mock.calls[0][1] as string;
    expect(header).toContain('riricloud_access=jwt.token');
    expect(header).toContain('HttpOnly');
    expect(header).toContain('SameSite=Lax');
    expect(header).toContain('Path=/');
    expect(readAuthCookie({ headers: { cookie: header } })).toBe('jwt.token');
  });

  it('清除 Cookie 时立即过期', () => {
    const response = { setHeader: jest.fn() };
    clearAuthCookie(response as never);

    const header = response.setHeader.mock.calls[0][1] as string;
    expect(header).toContain('Max-Age=0');
    expect(header).toContain('Expires=Thu, 01 Jan 1970 00:00:00 GMT');
  });
});
