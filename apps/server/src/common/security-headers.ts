export interface HeaderResponse {
  setHeader: (name: string, value: string) => void;
}

export function applySecurityHeaders(response: HeaderResponse, requestPath: string | undefined, productionLike: boolean): void {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' https://challenges.cloudflare.com; frame-src 'self' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https: wss:"
  );
  if (requestPath?.startsWith('/api/v1/')) {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Pragma', 'no-cache');
  }
  if (productionLike) response.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
}
