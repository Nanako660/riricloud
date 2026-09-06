import { RateLimitService } from './rate-limit.service';

describe('RateLimitService', () => {
  it('在窗口内拒绝超额请求，并可清理过期计数', () => {
    const service = new RateLimitService();

    expect(service.consume('login:ip:127.0.0.1', 2, 1_000)).toBe(true);
    expect(service.consume('login:ip:127.0.0.1', 2, 1_000)).toBe(true);
    expect(service.consume('login:ip:127.0.0.1', 2, 1_000)).toBe(false);
    expect(service.size).toBe(1);

    service.clearExpired(Date.now() + 1_001);
    expect(service.size).toBe(0);
    expect(service.consume('login:ip:127.0.0.1', 2, 1_000)).toBe(true);
  });

  it('限制计数器总量，避免攻击者通过无界 key 持续消耗内存', () => {
    const service = new RateLimitService();
    for (let index = 0; index < 10_500; index += 1) {
      service.consume(`register:email:user-${index}@example.com`, 1, 60_000);
    }

    expect(service.size).toBeLessThanOrEqual(10_000);
  });
});
