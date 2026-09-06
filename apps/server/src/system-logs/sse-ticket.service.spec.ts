import { SseTicketService } from './sse-ticket.service';

describe('SseTicketService', () => {
  it('票据只能成功消费一次', () => {
    const service = new SseTicketService();
    const issued = service.issue('admin-1');
    expect(service.consume(issued.ticket)).toBe('admin-1');
    expect(service.consume(issued.ticket)).toBeNull();
  });

  it('票据过期后不可消费', () => {
    jest.useFakeTimers();
    try {
      const service = new SseTicketService();
      const issued = service.issue('admin-1');
      jest.advanceTimersByTime(60_001);
      expect(service.consume(issued.ticket)).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });
});
