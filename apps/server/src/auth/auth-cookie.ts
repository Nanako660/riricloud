import type { Response } from 'express';

export const AUTH_COOKIE_NAME = 'riricloud_access';

export function readAuthCookie(request: { headers?: { cookie?: string } }): string | undefined {
  const cookieHeader = request.headers?.cookie;
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    const name = part.slice(0, separator).trim();
    if (name !== AUTH_COOKIE_NAME) continue;
    const value = part.slice(separator + 1).trim();
    try {
      return decodeURIComponent(value) || undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function secureCookie(): boolean {
  return process.env.NODE_ENV === 'production' || process.env.RIRICLOUD_ENV === 'production';
}

export function setAuthCookie(response: Response, token: string): void {
  const attributes = ['Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (secureCookie()) attributes.push('Secure');
  response.setHeader('Set-Cookie', `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}; ${attributes.join('; ')}`);
}

export function clearAuthCookie(response: Response): void {
  const attributes = ['Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0', 'Expires=Thu, 01 Jan 1970 00:00:00 GMT'];
  if (secureCookie()) attributes.push('Secure');
  response.setHeader('Set-Cookie', `${AUTH_COOKIE_NAME}=; ${attributes.join('; ')}`);
}
