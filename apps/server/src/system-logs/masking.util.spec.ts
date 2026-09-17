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


    it('should mask diagnostic hosts, IPs, assignments and private keys', () => {
      const input = '\x1b[31mdial https://proxy.example.com:443 from 192.0.2.10 token=very-secret password:pass123 -----BEGIN PRIVATE KEY-----abc-----END PRIVATE KEY-----';
      const output = maskSensitiveString(input);
      expect(output).not.toContain('\x1b');
      expect(output).toContain('[redacted-host]');
      expect(output).toContain('[redacted-ip]');
      expect(output).toContain('token=***');
      expect(output).toContain('password:***');
      expect(output).not.toContain('proxy.example.com');
      expect(output).not.toContain('very-secret');
      expect(output).not.toContain('BEGIN PRIVATE KEY');
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
