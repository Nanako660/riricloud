import { AuthController } from './auth.controller';

describe('AuthController', () => {
  it('登录成功只通过 HttpOnly Cookie 建立会话，不在 JSON 中返回 JWT', async () => {
    const authService = { login: jest.fn().mockResolvedValue({ accessToken: 'secret-token' }) };
    const response = { setHeader: jest.fn() };
    const controller = new AuthController(authService as never);

    await expect(controller.login(
      { email: 'User@Example.com', password: 'password123' },
      '127.0.0.1',
      'test-agent',
      undefined,
      response as never
    )).resolves.toEqual({ authenticated: true });

    expect(authService.login).toHaveBeenCalledWith(
      { email: 'User@Example.com', password: 'password123' },
      '127.0.0.1',
      'test-agent'
    );
    expect(response.setHeader).toHaveBeenCalledWith('Set-Cookie', expect.stringContaining('HttpOnly'));
  });

  it('注销时递增会话版本并清除 Cookie', async () => {
    const authService = { logout: jest.fn().mockResolvedValue(undefined) };
    const response = { setHeader: jest.fn() };
    const controller = new AuthController(authService as never);

    await expect(controller.logout({ id: 'user-1' }, response as never)).resolves.toBeUndefined();

    expect(authService.logout).toHaveBeenCalledWith('user-1');
    expect(response.setHeader).toHaveBeenCalledWith('Set-Cookie', expect.stringContaining('Max-Age=0'));
  });
});
