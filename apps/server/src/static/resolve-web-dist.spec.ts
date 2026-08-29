import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveWebDistRoot } from './resolve-web-dist';

// 用临时目录构造三种布局，验证解析优先级与缺省回退
function makeDist(root: string): string {
  const dist = join(root, 'dist');
  mkdirSync(dist, { recursive: true });
  writeFileSync(join(dist, 'index.html'), '<html></html>');
  return dist;
}

describe('resolveWebDistRoot', () => {
  const created: string[] = [];

  const makeDir = (): string => {
    const dir = mkdtempSync(join(tmpdir(), 'riri-webdist-'));
    created.push(dir);
    return dir;
  };

  afterAll(() => {
    for (const dir of created) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    delete process.env.WEB_DIST_PATH;
  });

  it('WEB_DIST_PATH 显式指定时最优先', () => {
    const explicit = makeDist(makeDir());
    process.env.WEB_DIST_PATH = explicit;
    expect(resolveWebDistRoot(makeDir())).toBe(explicit);
  });

  it('发行包布局：cwd 下的 web-dist 目录被命中', () => {
    const pkgRoot = makeDir();
    const dist = makeDist(join(pkgRoot, 'web-dist'));
    process.env.WEB_DIST_PATH = dist;
    expect(resolveWebDistRoot(pkgRoot)).toBe(dist);
  });

  it('三种布局都不存在时返回 null（纯 API 模式跳过托管）', () => {
    const empty = makeDir();
    expect(resolveWebDistRoot(empty)).toBeNull();
  });

  it('目录存在但缺 index.html 时视为无效', () => {
    const pkgRoot = makeDir();
    mkdirSync(join(pkgRoot, 'web-dist'));
    expect(resolveWebDistRoot(pkgRoot)).toBeNull();
  });
});
