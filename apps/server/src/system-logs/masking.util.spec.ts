import { maskSensitiveString, sanitizeLogMetadata } from './masking.util';

describe('masking.util', () => {
  describe('maskSensitiveString', () => {
    it('should mask Bearer token correctly', () => {
      const input = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0';
      const output = maskSensitiveString(input);
      expect(output).toContain('Bearer eyJhbGci***');
      expect(output).not.toContain('eyJzdWIiOiIxMjM0NTY3ODkwIn0');
    });

    it('should mask query params like token and password', () => {
      const input = '/api/v1/sub?token=secret-token-12345&other=value';
      const output = maskSensitiveString(input);
      expect(output).toBe('/api/v1/sub?token=***&other=value');
    });
  });

  describe('sanitizeLogMetadata', () => {
    it('should recursively mask sensitive keys in objects', () => {
      const metadata = {
        user: {
          id: '123',
          password: 'my-super-secret-password',
          agentToken: 'agent-token-xyz-123456789'
        },
        headers: {
          authorization: 'Bearer secret-jwt-here',
          userAgent: 'Mozilla/5.0'
        },
        safeField: 'hello world'
      };

      const sanitized = sanitizeLogMetadata(metadata);
      expect(sanitized.user.password).toBe('my-s***rd');
      expect(sanitized.user.agentToken).toBe('agen***89');
      expect(sanitized.headers.authorization).toContain('Bearer secret-j***');
      expect(sanitized.safeField).toBe('hello world');
    });
  });
});
