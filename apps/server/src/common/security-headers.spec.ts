import { applySecurityHeaders } from './security-headers';

describe('security headers', () => {
  it('为所有 API 响应设置禁止缓存头并放行 Turnstile 必要资源', () => {
    const response = { setHeader: jest.fn() };

    applySecurityHeaders(response, '/api/v1/auth/login', false);

    expect(response.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(response.setHeader).toHaveBeenCalledWith('Pragma', 'no-cache');
    expect(response.setHeader).toHaveBeenCalledWith('Referrer-Policy', 'no-referrer');
    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Security-Policy',
      expect.stringContaining('https://challenges.cloudflare.com')
    );
  });

  it('生产响应额外设置 HSTS', () => {
    const response = { setHeader: jest.fn() };

    applySecurityHeaders(response, '/api/v1/auth/me', true);

    expect(response.setHeader).toHaveBeenCalledWith('Strict-Transport-Security', expect.stringContaining('max-age='));
  });
});
