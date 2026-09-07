#!/usr/bin/env node
// 主控容器入口：迁移数据库、初始化管理员与系统节点，并管理 Master 的生命周期。
'use strict';

const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const { validateJwtSecret } = require('/app/prisma/admin-bootstrap');

const prismaCli = '/app/node_modules/prisma/build/index.js';
let serverChild = null;
let shutdownRequested = false;

function fail(message) {
  console.error(message);
  throw new Error(message);
}

function runPrisma(...args) {
  const result = spawnSync(process.execPath, [prismaCli, ...args], {
    cwd: '/app',
    env: process.env,
    stdio: 'inherit'
  });
  if (result.error) fail(`prisma ${args.join(' ')} failed: ${result.error.message}`);
  if (result.status !== 0) fail(`prisma ${args.join(' ')} failed with exit code ${result.status ?? 1}`);
}

function runNodeScript(scriptPath) {
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: '/app',
    env: process.env,
    stdio: 'inherit'
  });
  if (result.error) fail(`${scriptPath} failed: ${result.error.message}`);
  if (result.status !== 0) fail(`${scriptPath} failed with exit code ${result.status ?? 1}`);
}

function isEnabled(value) {
  return ['true', '1', 'yes', 'on'].includes(String(value).toLowerCase());
}

function isProduction() {
  return String(process.env.NODE_ENV ?? '').toLowerCase() === 'production' ||
    String(process.env.RIRICLOUD_ENV ?? '').toLowerCase() === 'production';
}

function isBooleanValue(value) {
  return ['true', '1', 'yes', 'on', 'false', '0', 'no', 'off'].includes(String(value).toLowerCase());
}

function stopChild(child, signal = 'SIGTERM') {
  if (child && child.exitCode === null && !child.killed) child.kill(signal);
}

function handleSignal(signal) {
  shutdownRequested = true;
  if (serverChild) stopChild(serverChild, signal);
}

process.on('SIGTERM', () => handleSignal('SIGTERM'));
process.on('SIGINT', () => handleSignal('SIGINT'));

async function main() {
  try {
    validateJwtSecret(process.env.JWT_SECRET);
  } catch (error) {
    fail(error.message);
  }

  const autoSeed = String(process.env.AUTO_SEED ?? 'false').toLowerCase();
  if (!isBooleanValue(autoSeed)) fail('AUTO_SEED must be true or false');
  if (isEnabled(autoSeed) && isProduction()) fail('AUTO_SEED=true is forbidden in production; use an explicit administrator bootstrap instead');

  fs.mkdirSync('/app/data', { recursive: true });

  runPrisma('migrate', 'deploy');
  runNodeScript('/app/prisma/bootstrap-admin.js');

  if (isEnabled(autoSeed)) {
    console.log('seeding demo data (AUTO_SEED=true) ...');
    runNodeScript('/app/prisma/seed.js');
  }

  const mainEntry = fs.existsSync('/app/dist/main.js')
    ? 'dist/main.js'
    : fs.existsSync('/app/dist/src/main.js')
      ? 'dist/src/main.js'
      : 'dist/main.js';

  serverChild = spawn(process.execPath, [mainEntry], {
    cwd: '/app',
    env: process.env,
    stdio: 'inherit'
  });

  const exitCode = await new Promise((resolve) => {
    serverChild.once('error', (error) => {
      console.error(`Master 启动失败：${error.message}`);
      resolve(1);
    });
    serverChild.once('exit', (code, signal) => {
      if (shutdownRequested || signal) resolve(0);
      else resolve(code ?? 1);
    });
  });

  process.exitCode = exitCode;
}

main().catch((error) => {
  if (serverChild) stopChild(serverChild);
  console.error(`master entrypoint failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = shutdownRequested ? 0 : 1;
});
