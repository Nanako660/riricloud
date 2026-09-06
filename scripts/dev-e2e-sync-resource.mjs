import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const usage = () => {
  throw new Error([
    '用法：RIRICLOUD_ADMIN_COOKIE_FILE=<cookie-jar> node scripts/dev-e2e-sync-resource.mjs',
    '  --server-url <url> --kind <AGENT|SINGBOX> --target <target>',
    '  --version <version> --file <path> [--filename <name>] [--app-version <version>]'
  ].join('\n'));
};

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith('--')) throw new Error(`未知参数：${item}`);
    const key = item.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`参数缺少值：${item}`);
    args[key] = value;
    index += 1;
  }
  return args;
}

function required(args, name) {
  const value = String(args[name] ?? '').trim();
  if (!value) throw new Error(`缺少参数：--${name}`);
  return value;
}

function validateTarget(kind, target) {
  const pattern = new RegExp(`^${kind.toLowerCase()}-(linux|windows|macos)-(amd64|arm64|armv7)$`);
  if (!pattern.test(target)) throw new Error(`目标平台与资源类型不匹配：${target}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const serverUrl = required(args, 'server-url').replace(/\/$/, '');
  const kind = required(args, 'kind').toUpperCase();
  const target = required(args, 'target');
  const version = required(args, 'version');
  const filePath = resolve(required(args, 'file'));
  const cookieHeader = await readAdminCookie();
  if (kind !== 'AGENT' && kind !== 'SINGBOX') throw new Error(`不支持的资源类型：${kind}`);
  validateTarget(kind, target);

  const body = await readFile(filePath);
  const sha256 = createHash('sha256').update(body).digest('hex');
  const filename = String(args.filename ?? basename(filePath)).trim();
  const appVersion = String(args['app-version'] ?? version).trim();
  if (!filename) throw new Error('资源文件名不能为空');

  const request = async (path, init = {}) => {
    const response = await fetch(`${serverUrl}${path}`, {
      ...init,
      headers: { Cookie: cookieHeader, ...(init.headers ?? {}) }
    });
    const text = await response.text();
    let payload;
    try {
      payload = text ? JSON.parse(text) : undefined;
    } catch {
      payload = text;
    }
    if (!response.ok) {
      const detail = typeof payload === 'string' ? payload : JSON.stringify(payload);
      throw new Error(`${init.method ?? 'GET'} ${path} 失败：HTTP ${response.status}${detail ? ` ${detail}` : ''}`);
    }
    return payload;
  };

  const resources = await request('/api/v1/admin/binary-resources');
  if (!Array.isArray(resources)) throw new Error('资源列表响应格式无效');
  const sameVersion = resources.filter((resource) => resource.kind === kind && resource.upstreamVersion === version);
  const current = sameVersion.find((resource) => resource.assets?.some((asset) => (
    asset.target === target && asset.available && asset.sha256?.toLowerCase() === sha256
  )));
  if (current) {
    if (current.status === 'ACTIVE' && !current.isDefault) {
      await request(`/api/v1/admin/binary-resources/${current.id}/default`, { method: 'POST' });
      console.log(`资源已切换为默认：${kind.toLowerCase()} ${target} ${version}-r${current.revision}`);
    } else if (current.status === 'ACTIVE' && current.isDefault) {
      console.log(`资源已是当前文件：${kind.toLowerCase()} ${target} ${version}-r${current.revision}`);
    }
    if (current.status === 'ACTIVE') {
      return;
    }
  }

  const revision = sameVersion.reduce((max, resource) => Math.max(max, Number(resource.revision) || 0), 0) + 1;
  const form = new FormData();
  form.set('kind', kind);
  form.set('upstreamVersion', version);
  form.set('revision', String(revision));
  form.set('target', target);
  form.set('filename', filename);
  form.set('builtFromAppVersion', appVersion);
  form.set('notes', '本地 e2e 联调构建产物');
  form.set('sha256', sha256);
  form.set('file', new Blob([body], { type: 'application/octet-stream' }), filename);

  const uploaded = await request('/api/v1/admin/binary-resources/upload', { method: 'POST', body: form });
  const releaseId = uploaded?.id;
  if (!releaseId) throw new Error('资源上传响应缺少 release id');
  await request(`/api/v1/admin/binary-resources/${releaseId}/activate`, { method: 'POST' });
  await request(`/api/v1/admin/binary-resources/${releaseId}/default`, { method: 'POST' });
  console.log(`资源已同步：${kind.toLowerCase()} ${target} ${version}-r${revision}`);
}

async function readAdminCookie() {
  const direct = String(process.env.RIRICLOUD_ADMIN_COOKIE ?? '').trim();
  if (direct) return direct;
  const cookieFile = String(process.env.RIRICLOUD_ADMIN_COOKIE_FILE ?? '').trim();
  if (!cookieFile) throw new Error('RIRICLOUD_ADMIN_COOKIE_FILE 未设置');
  const contents = await readFile(resolve(cookieFile), 'utf8');
  const cookie = parseCookieJar(contents);
  if (cookie) return cookie;
  throw new Error('Cookie jar 中缺少管理员会话');
}

export function parseCookieJar(contents) {
  for (const line of contents.split(/\r?\n/)) {
    // curl 使用 #HttpOnly_ 标记 HttpOnly Cookie；它不是注释，需去掉标记后按 Netscape 格式解析。
    const cookieLine = line.startsWith('#HttpOnly_') ? line.slice(1) : line;
    if (!cookieLine || cookieLine.startsWith('#')) continue;
    const fields = cookieLine.split('\t');
    if (fields[5] === 'riricloud_access' && fields[6]) return `riricloud_access=${fields[6]}`;
  }
  return null;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
