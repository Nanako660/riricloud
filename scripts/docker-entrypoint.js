#!/usr/bin/env node
// 主控容器入口：迁移数据库、初始化系统节点，并管理 Master 与内置 Agent 的生命周期。
'use strict';

const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const { PrismaClient } = require('/app/node_modules/@prisma/client');
const { validateJwtSecret } = require('/app/prisma/admin-bootstrap');

const prismaCli = '/app/node_modules/prisma/build/index.js';
const activeChildren = new Set();
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

function isBooleanValue(value) {
  return ['true', '1', 'yes', 'on', 'false', '0', 'no', 'off'].includes(String(value).toLowerCase());
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function readMasterAgentToken() {
  const prisma = new PrismaClient();
  try {
    const node = await prisma.node.findFirst({
      where: { isLocal: true },
      orderBy: [{ createdAt: 'asc' }],
      select: { agentToken: true }
    });
    if (!node) throw new Error('Master-Local 节点不存在，请检查 bootstrap 是否成功');
    return node.agentToken;
  } finally {
    await prisma.$disconnect();
  }
}

async function waitForMaster(server, port, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = 'unknown error';
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`Master 在就绪前退出，exitCode=${server.exitCode}`);
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/v1/system/version`);
      if (response.ok) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await delay(500);
  }
  throw new Error(`等待 Master 就绪超时（${timeoutMs}ms）：${lastError}`);
}

function waitForChild(child, name) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve({ name, ...result });
    };
    child.once('error', (error) => finish({ error }));
    child.once('exit', (code, signal) => finish({ code, signal }));
  });
}

function stopChild(child, signal = 'SIGTERM') {
  if (child && child.exitCode === null && !child.killed) child.kill(signal);
}

function trackChild(child) {
  activeChildren.add(child);
  child.once('exit', () => activeChildren.delete(child));
  return child;
}

function stopAllChildren(signal = 'SIGTERM') {
  for (const child of activeChildren) stopChild(child, signal);
}

function handleSignal(signal) {
  shutdownRequested = true;
  stopAllChildren(signal);
  if (activeChildren.size === 0) process.exit(0);
}

process.on('SIGTERM', () => handleSignal('SIGTERM'));
process.on('SIGINT', () => handleSignal('SIGINT'));

async function supervise(server, agent) {
  const serverExit = waitForChild(server, 'Master');
  const agentExit = waitForChild(agent, '内置 Agent');
  const first = await Promise.race([serverExit, agentExit]);
  if (!shutdownRequested) {
    console.error(`${first.name} 已退出，主控容器将退出以触发 Docker 自动恢复`);
    stopAllChildren();
    await Promise.all([serverExit, agentExit]);
    if (first.error) console.error(`${first.name} 启动失败：${first.error.message}`);
    return first.code && first.code > 0 ? first.code : 1;
  }

  await Promise.all([serverExit, agentExit]);
  return 0;
}

async function main() {
  try {
    validateJwtSecret(process.env.JWT_SECRET);
  } catch (error) {
    fail(error.message);
  }

  const autoSeed = String(process.env.AUTO_SEED ?? 'false').toLowerCase();
  if (!isBooleanValue(autoSeed)) fail('AUTO_SEED must be true or false');

  const embeddedAgent = String(process.env.MASTER_AGENT_ENABLED ?? 'true').toLowerCase();
  if (!isBooleanValue(embeddedAgent)) fail('MASTER_AGENT_ENABLED must be true or false');

  fs.mkdirSync('/app/data', { recursive: true });
  if (isEnabled(embeddedAgent)) fs.mkdirSync('/app/data/master-agent', { recursive: true });

  runPrisma('migrate', 'deploy');
  runNodeScript('/app/prisma/bootstrap-admin.js');

  if (isEnabled(autoSeed)) {
    console.log('seeding demo data (AUTO_SEED=true) ...');
    runNodeScript('/app/prisma/seed.js');
  }

  const port = String(process.env.PORT ?? '3000');
  const mainEntry = fs.existsSync('/app/dist/main.js')
    ? 'dist/main.js'
    : fs.existsSync('/app/dist/src/main.js')
      ? 'dist/src/main.js'
      : 'dist/main.js';
  const server = trackChild(spawn(process.execPath, [mainEntry], {
    cwd: '/app',
    env: process.env,
    stdio: 'inherit'
  }));

  if (!isEnabled(embeddedAgent)) {
    const result = await waitForChild(server, 'Master');
    if (result.error) throw result.error;
    process.exitCode = result.signal ? 0 : result.code ?? 1;
    return;
  }

  await waitForMaster(server, port);
  const token = await readMasterAgentToken();
  const agentPath = process.env.MASTER_AGENT_BINARY_PATH || '/usr/local/bin/riri-agent';
  const singboxPath = process.env.SINGBOX_BINARY_PATH || '/usr/local/bin/sing-box';
  const configPath = process.env.MASTER_AGENT_CONFIG_PATH || '/app/data/master-agent/config.json';
  const agentMode = process.env.MASTER_AGENT_MODE || 'ws';
  const agentMasterUrl = process.env.MASTER_AGENT_MASTER_URL || `ws://127.0.0.1:${port}/ws/agent`;
  if (!fs.existsSync(agentPath)) throw new Error(`内置 Agent 不存在：${agentPath}`);
  if (!fs.existsSync(singboxPath)) throw new Error(`内置 sing-box 不存在：${singboxPath}`);

  // 内置 Agent 必须走守护进程模式，避免继承容器终端后误入交互式 TUI。
  const agent = trackChild(spawn(agentPath, ['run'], {
    cwd: '/app/data/master-agent',
    env: {
      ...process.env,
      AGENT_TOKEN: token,
      MASTER_URL: agentMasterUrl,
      AGENT_MODE: agentMode,
      SINGBOX_CONFIG_PATH: configPath,
      SINGBOX_BINARY_PATH: singboxPath
    },
    stdio: 'inherit'
  }));

  process.exitCode = await supervise(server, agent);
}

main().catch((error) => {
  stopAllChildren();
  console.error(`master entrypoint failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = shutdownRequested ? 0 : 1;
});
