import assert from 'node:assert/strict';
import test from 'node:test';
import { extractResourceList, parseCookieJar } from './dev-e2e-sync-resource.mjs';

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

test('解析分页资源列表响应中的 data 数组', () => {
  const resources = [{ id: 'release-1', kind: 'AGENT' }];

  assert.deepEqual(extractResourceList({
    data: resources,
    total: 1,
    page: 1,
    pageSize: 100,
    supportedTargets: [],
    summary: { totalBytes: 0, reclaimableBytes: 0 }
  }), resources);
});

test('兼容旧版数组格式并拒绝无效资源列表响应', () => {
  const resources = [{ id: 'release-1', kind: 'AGENT' }];

  assert.deepEqual(extractResourceList(resources), resources);
  assert.throws(() => extractResourceList({ data: null }), /资源列表响应格式无效/);
});
