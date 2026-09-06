// 完整演示 seed：幂等创建管理员、普通用户及演示业务数据。
// 生产启动入口会先执行无默认值的 admin bootstrap；只有明确 AUTO_SEED=true 才调用本脚本。
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { generateKeyPairSync, randomInt } = require('node:crypto');
const { ensureAdmin } = require('./admin-bootstrap');
const { ensureMasterAgentNode } = require('./master-agent-bootstrap');
const { buildDefaultTemplateData, migrateLegacyTemplates } = require('./default-template');
const { encryptSecret } = require('./secret-crypto');

const prisma = new PrismaClient();
const RANDOM_SERVICE_PORT_MIN = 20000;
const RANDOM_SERVICE_PORT_MAX = 65535;

async function findAvailableServicePort(nodeId, reservedPorts = []) {
  const reserved = new Set(reservedPorts);
  for (let attempt = 0; attempt < 64; attempt += 1) {
    const port = randomInt(RANDOM_SERVICE_PORT_MIN, RANDOM_SERVICE_PORT_MAX + 1);
    if (reserved.has(port)) continue;
    const line = await prisma.line.findFirst({
      where: { OR: [{ entryNodeId: nodeId, entryPort: port }, { landingNodeId: nodeId, landingPort: port }] }
    });
    if (!line) return port;
  }
  throw new Error('没有可用的随机服务端口');
}

async function isServicePortAvailable(nodeId, port, excludedLineId) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) return false;
  const line = await prisma.line.findFirst({
    where: {
      ...(excludedLineId ? { id: { not: excludedLineId } } : {}),
      OR: [{ entryNodeId: nodeId, entryPort: port }, { landingNodeId: nodeId, landingPort: port }]
    }
  });
  return !line;
}

async function resolveServicePort(nodeId, line, preferredPort, reservedPorts = []) {
  const reserved = new Set(reservedPorts);
  if (
    Number.isInteger(preferredPort) &&
    !reserved.has(preferredPort) &&
    await isServicePortAvailable(nodeId, preferredPort, line?.id)
  ) {
    return preferredPort;
  }
  return findAvailableServicePort(nodeId, reservedPorts);
}

function generateRealityKeypair() {
  const { publicKey, privateKey } = generateKeyPairSync('x25519');
  const exportRawKey = (key, type) => {
    const der = key.export({ type, format: 'der' });
    return der.subarray(der.length - 32).toString('base64url');
  };
  return {
    privateKey: exportRawKey(privateKey, 'pkcs8'),
    publicKey: exportRawKey(publicKey, 'spki')
  };
}

function defaultLocalVlessParams() {
  const keys = generateRealityKeypair();
  return {
    flow: 'xtls-rprx-vision',
    transport: { type: 'tcp' },
    tls: {
      enabled: true,
      mode: 'reality',
      serverName: 'www.apple.com',
      reality: {
        dest: 'www.apple.com:443',
        serverNames: ['www.apple.com'],
        privateKey: encryptSecret(keys.privateKey),
        publicKey: keys.publicKey,
        shortIds: ['0123456789abcdef']
      }
    }
  };
}

function parseParams(value) {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function hasInvalidVlessFlow(params) {
  if (!params || typeof params.flow !== 'string' || !params.flow.trim()) return false;
  const tls = params.tls;
  return !tls || tls.enabled === false || tls.mode === 'none';
}

async function main() {
  const userEmail = (process.env.SEED_USER_EMAIL || 'demo@riricloud.local').trim().toLowerCase();
  const userPassword = process.env.SEED_USER_PASSWORD || 'RiriCloud-User-2026!';
  await migrateLegacyTemplates(prisma);
  // 完整 seed 仍保留本地演示默认值；生产启动入口只调用无默认值的 bootstrap。
  const { admin } = await ensureAdmin(prisma, { allowDemoDefaults: true });

  const templateData = buildDefaultTemplateData(true);

  let template = await prisma.subscriptionTemplate.findFirst({ where: { isDefault: true } });
  if (!template) {
    template = await prisma.subscriptionTemplate.findFirst({ where: { name: templateData.name } });
  }
  if (template) {
    template = await prisma.subscriptionTemplate.update({ where: { id: template.id }, data: templateData });
  } else {
    template = await prisma.subscriptionTemplate.create({ data: templateData });
  }

  let plan = await prisma.plan.findFirst({ where: { name: '体验套餐' } });
  const planData = {
    name: '体验套餐',
    description: '适合本地演示与首次体验的默认套餐',
    price: 0,
    durationDays: 30,
    trafficLimitBytes: BigInt(107374182400),
    lineMatchMode: 'ALL',
    lineTagsJson: '[]',
    lineIdsJson: '[]',
    templateId: template.id,
    isPublic: true,
    sortOrder: 0
  };
  if (plan) {
    plan = await prisma.plan.update({ where: { id: plan.id }, data: planData });
  } else {
    plan = await prisma.plan.create({ data: planData });
  }

  const { node: localNode } = await ensureMasterAgentNode(prisma);
  const localHost = localNode.serverHost;

  const existingDirectLine = await prisma.line.findFirst({ where: { name: 'Master 本机直连' } });
  // 直连线路是本机演示端点的稳定入口；若旧盲转线路占用同端口，优先迁移盲转端口。
  const directPort = existingDirectLine?.entryPort ?? await findAvailableServicePort(localNode.id);
  const directParams = existingDirectLine ? parseParams(existingDirectLine.paramsJson) : null;
  const protocolParams = directParams && !hasInvalidVlessFlow(directParams) ? directParams : defaultLocalVlessParams();

  const directLineData = {
    name: 'Master 本机直连',
    tag: 'master-direct',
    listen: '0.0.0.0',
    type: 'DIRECT',
    relayMode: null,
    protocolType: 'VLESS',
    paramsJson: JSON.stringify(protocolParams),
    entryNodeId: localNode.id,
    entryPort: directPort,
    landingNodeId: null,
    landingPort: null,
    endpointOverrideEnabled: false,
    serverHost: localHost,
    serverPort: directPort,
    serverName: null,
    host: null,
    trafficRate: 1,
    tagsJson: JSON.stringify(['local']),
    level: 0,
    sortOrder: 0,
    isPublic: true,
    status: 'ACTIVE'
  };
  const existingRelayLine = await prisma.line.findFirst({ where: { name: 'Master 本机盲转示例' } });
  const relayEntryPort = await resolveServicePort(localNode.id, existingRelayLine, existingRelayLine?.entryPort, [directPort]);
  const relayLandingPort = await resolveServicePort(localNode.id, existingRelayLine, existingRelayLine?.landingPort, [directPort, relayEntryPort]);
  const relayLineData = {
    ...directLineData,
    name: 'Master 本机盲转示例',
    tag: 'master-blind',
    type: 'RELAY',
    relayMode: 'BLIND_FORWARD',
    entryPort: relayEntryPort,
    landingNodeId: localNode.id,
    landingPort: relayLandingPort,
    serverPort: relayEntryPort,
    tagsJson: JSON.stringify(['local', 'relay']),
    sortOrder: 1
  };
  for (const lineData of [directLineData, relayLineData]) {
    const existingLine = await prisma.line.findFirst({ where: { name: lineData.name } });
    if (existingLine) {
      await prisma.line.update({ where: { id: existingLine.id }, data: lineData });
    } else {
      await prisma.line.create({ data: lineData });
    }
  }

  const user = await prisma.user.upsert({
    where: { email: userEmail },
    update: { isActive: true },
    create: {
      email: userEmail,
      passwordHash: await bcrypt.hash(userPassword, 10),
      role: 'USER'
    }
  });

  for (const seededUser of [admin, user]) {
    const existingSubscription = await prisma.subscription.findUnique({ where: { userId: seededUser.id } });
    if (!existingSubscription) {
      const subscription = await prisma.subscription.create({
        data: {
          userId: seededUser.id,
          planId: plan.id,
          status: 'ACTIVE',
          trafficLimitBytes: plan.trafficLimitBytes,
          trafficUsedBytes: BigInt(0),
          startedAt: new Date(),
          expireAt: new Date(Date.now() + plan.durationDays * 86400000)
        }
      });
      await prisma.user.update({
        where: { id: seededUser.id },
        data: {
          trafficLimitBytes: subscription.trafficLimitBytes,
          trafficUsedBytes: subscription.trafficUsedBytes,
          expireAt: subscription.expireAt,
          subscriptionToken: subscription.subscriptionToken
        }
      });
    }
  }

  console.log(`seed: admin=${admin.email}, user=${userEmail}, plan=${plan.name}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
