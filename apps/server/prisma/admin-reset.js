'use strict';

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const {
  validateAdminEmail,
  validateAdminPassword
} = require('./admin-bootstrap');

const prisma = new PrismaClient();

function parseArgs(argv) {
  let email = null;
  let passwordStdin = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') continue;
    if (arg === '--help' || arg === '-h') {
      console.log('用法: admin-reset.sh --email admin@example.com [--password-stdin]');
      process.exit(0);
    }
    if (arg === '--password-stdin') {
      passwordStdin = true;
      continue;
    }
    if (arg === '--email') {
      email = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg.startsWith('--email=')) {
      email = arg.slice('--email='.length);
      continue;
    }
    throw new Error(`未知参数 ${arg}；不支持明文 --password，请使用 --password-stdin`);
  }

  if (!email) {
    throw new Error('必须提供 --email，且目标账号必须已经存在并且角色为 ADMIN');
  }

  return { email: validateAdminEmail(email), passwordStdin };
}

async function readStdinPassword() {
  let value = '';
  for await (const chunk of process.stdin) {
    value += chunk;
  }
  return value.replace(/\r?\n$/, '');
}

function readHidden(prompt) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return Promise.reject(new Error('当前不是交互终端，请改用 --password-stdin 输入密码'));
  }

  const stdin = process.stdin;
  const stdout = process.stdout;
  return new Promise((resolve, reject) => {
    let value = '';
    const previousRawMode = stdin.isRaw;

    const cleanup = () => {
      stdin.removeListener('data', onData);
      stdin.setRawMode(previousRawMode ?? false);
      stdin.pause();
    };

    const onData = (chunk) => {
      for (const character of chunk) {
        if (character === '\u0003') {
          cleanup();
          stdout.write('\n');
          reject(new Error('已取消密码输入'));
          return;
        }
        if (character === '\r' || character === '\n') {
          cleanup();
          stdout.write('\n');
          resolve(value);
          return;
        }
        if (character === '\u007f' || character === '\b') {
          value = value.slice(0, -1);
          continue;
        }
        value += character;
      }
    };

    stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    stdin.on('data', onData);
  });
}

async function readPassword(passwordStdin) {
  if (passwordStdin) {
    return readStdinPassword();
  }

  const password = await readHidden('新管理员密码: ');
  const confirmation = await readHidden('确认新管理员密码: ');
  if (password !== confirmation) {
    throw new Error('两次输入的管理员密码不一致');
  }
  return password;
}

async function main() {
  const { email, passwordStdin } = parseArgs(process.argv.slice(2));
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new Error(`账号 ${email} 不存在，密码重置不会创建账号`);
  }
  if (user.role !== 'ADMIN') {
    throw new Error(`账号 ${email} 不是 ADMIN，密码重置不会提权账号`);
  }

  const password = validateAdminPassword(await readPassword(passwordStdin));
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(password, 10) }
  });
  console.log(`管理员密码已重置：${email}`);
}

main()
  .catch((error) => {
    console.error(`admin reset failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
