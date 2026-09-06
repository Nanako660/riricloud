import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy session version', () => {
  const originalSecret = process.env.JWT_SECRET;

  beforeAll(() => {
    process.env.JWT_SECRET = 'test-jwt-secret-for-session-version-regression-0123456789';
  });

  afterAll(() => {
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  });

  it('密码修改后旧 sessionVersion 立即失效', async () => {
    const prisma = { user: { findUnique: jest.fn().mockResolvedValue({ id: 'u1', email: 'u@example.com', role: 'USER', isActive: true, sessionVersion: 2 }) } };
    const strategy = new JwtStrategy(prisma as never);

    await expect(strategy.validate({ sub: 'u1', email: 'u@example.com', role: 'USER', sessionVersion: 1 })).rejects.toThrow(UnauthorizedException);
    await expect(strategy.validate({ sub: 'u1', email: 'u@example.com', role: 'USER', sessionVersion: 2 })).resolves.toEqual({ id: 'u1', email: 'u@example.com', role: 'USER' });
  });
});
