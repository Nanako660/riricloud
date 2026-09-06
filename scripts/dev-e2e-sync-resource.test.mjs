import assert from 'node:assert/strict';
import test from 'node:test';
import { parseCookieJar } from './dev-e2e-sync-resource.mjs';

test('解析 curl Netscape Cookie jar 中的 HttpOnly 管理员 Cookie', () => {
  const token = 'jwt-cookie-token';
  const jar = [
    '# Netscape HTTP Cookie File',
    '#HttpOnly_localhost\tFALSE\t/\tTRUE\t0\triricloud_access\t' + token,
    ''
  ].join('\n');

  assert.equal(parseCookieJar(jar), `riricloud_access=${token}`);
});

test('忽略普通注释并解析非 HttpOnly Cookie', () => {
  const token = 'plain-cookie-token';
  const jar = ['# comment', `localhost\tFALSE\t/\tFALSE\t0\triricloud_access\t${token}`].join('\n');

  assert.equal(parseCookieJar(jar), `riricloud_access=${token}`);
});
