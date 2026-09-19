import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as vm from 'node:vm';

describe('docker-entrypoint.js 脚本诊断与入口校验', () => {
  const entrypointPath = path.resolve(__dirname, '../../../../scripts/docker-entrypoint.js');

  it('脚本文件应存在且语法正确', () => {
    expect(fs.existsSync(entrypointPath)).toBe(true);
    const code = fs.readFileSync(entrypointPath, 'utf8');
    expect(() => new vm.Script(code)).not.toThrow();
  });

  it('main 函数在正常环境下执行不应抛出任何未定义变量或 ReferenceError', () => {
    const code = fs.readFileSync(entrypointPath, 'utf8');
    const testDir = path.join(os.tmpdir(), `riri-entry-test-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });

    let exitCode: number | null = null;
    const mockProcess = {
      ...process,
      execPath: process.execPath,
      env: {
        ...process.env,
        JWT_SECRET: 'a-valid-secure-random-secret-key-32-chars-long',
        MASTER_DATA_DIR: testDir,
        MASTER_TMP_DIR: os.tmpdir(),
        NODE_ENV: 'development',
        AUTO_SEED: 'false'
      },
      exit: (code: number) => { exitCode = code; },
      on: jest.fn()
    };

    const mockChildProcess = {
      spawn: jest.fn().mockReturnValue({
        once: (event: string, callback: (code: number) => void) => {
          if (event === 'exit') callback(0);
        },
        exitCode: 0,
        killed: false,
        kill: jest.fn()
      }),
      spawnSync: jest.fn().mockReturnValue({ status: 0 })
    };

    const context = {
      process: mockProcess,
      require: (id: string) => {
        if (id === 'node:child_process' || id === 'child_process') {
          return mockChildProcess;
        }
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        return require(id);
      },
      console: {
        ...console,
        error: jest.fn(),
        log: jest.fn()
      },
      __dirname: path.dirname(entrypointPath),
      Buffer,
      setTimeout,
      clearTimeout
    };

    try {
      vm.createContext(context);
      expect(() => vm.runInContext(code, context)).not.toThrow();
      expect(exitCode).toBeNull();
    } finally {
      try {
        fs.rmSync(testDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  });
});
