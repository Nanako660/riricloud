import { AuthAuditService } from './auth-audit.service';

describe('AuthAuditService', () => {
  beforeAll(() => {
    process.env.JWT_SECRET = 'test-secret-for-auth-audit-hashing-0123456789';
  });

  it('记录稳定事件名与哈希身份，不携带原始邮箱', () => {
    const enqueue = jest.fn();
    const service = new AuthAuditService({ enqueue } as never);
    const emailHash = service.emailHash(' User@Example.com ');

    service.record('LOGIN_SUCCESS', { emailHash }, 'user-1');

    expect(emailHash).toMatch(/^[a-f0-9]{64}$/);
    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({
      module: 'AUTH',
      message: 'auth event: LOGIN_SUCCESS',
      userId: 'user-1',
      metadata: { event: 'LOGIN_SUCCESS', emailHash }
    }));
    expect(enqueue.mock.calls[0][0].metadata.emailHash).not.toContain('user@example.com');
  });

  it('审计队列异常时不影响认证流程', () => {
    const service = new AuthAuditService({ enqueue: () => { throw new Error('log unavailable'); } } as never);

    expect(() => service.record('LOGIN_FAILURE')).not.toThrow();
  });
});
