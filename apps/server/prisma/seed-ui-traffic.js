// 生成管理端流量看板专用演示数据；每次执行都会刷新一批随机测试用户和流量流水。
'use strict';

const { randomBytes, randomInt } = require('node:crypto');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const MIB = 1024n ** 2n;
const GIB = 1024n ** 3n;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const RATE_BUCKET_MS = 5 * 60 * 1000;
const RATE_BUCKET_COUNT = 30 * 24 * 12;
const DEFAULT_LIMIT = 100n * GIB;
const TEST_USER_COUNT = 100;
const UI_PASSWORD_HASH = bcrypt.hashSync('ui-demo-pass-2026', 10);
const now = new Date();

function randomBetween(min, max) {
  return randomInt(min, max + 1);
}

function pick(items) {
  return items[randomBetween(0, items.length - 1)];
}

function shuffle(items) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = randomBetween(0, index);
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function randomFloat(min, max, digits = 1) {
  const factor = 10 ** digits;
  return Math.round((min + Math.random() * (max - min)) * factor) / factor;
}

function randomFutureDate(days) {
  return new Date(now.getTime() + randomBetween(1, days * DAY_MS));
}

function randomDateForDay(daysAgo) {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - daysAgo);
  date.setHours(randomBetween(0, 23), randomBetween(0, 59), randomBetween(0, 59), randomBetween(0, 999));
  return date > now ? new Date(now.getTime() - randomBetween(0, HOUR_MS)) : date;
}

function getPlanLimit(planName) {
  if (planName.includes('专业')) return 1024n * GIB;
  if (planName.includes('轻量')) return 20n * GIB;
  return 100n * GIB;
}

async function upsertByName(delegate, name, data) {
  const existing = await delegate.findFirst({ where: { name } });
  return existing
    ? delegate.update({ where: { id: existing.id }, data })
    : delegate.create({ data: { name, ...data } });
}

async function upsertNode(name, data) {
  const existing = await prisma.node.findFirst({ where: { name } });
  const payload = {
    serverHost: data.serverHost,
    isLocal: false,
    status: data.status,
    lastSeenAt: data.status === 'ONLINE' ? now : null,
    cpuUsage: data.status === 'ONLINE' ? data.cpuUsage : null,
    memoryUsage: data.status === 'ONLINE' ? data.memoryUsage : null,
    bandwidthRate: data.status === 'ONLINE' ? data.uploadRate + data.downloadRate : null,
    uploadRate: data.status === 'ONLINE' ? data.uploadRate : null,
    downloadRate: data.status === 'ONLINE' ? data.downloadRate : null,
    kernelRunning: data.status === 'ONLINE',
    agentVersion: '0.4.15-ui-demo',
    osArch: data.osArch ?? 'linux/amd64',
    kernelVersion: '1.12.0'
  };
  return existing
    ? prisma.node.update({ where: { id: existing.id }, data: payload })
    : prisma.node.create({ data: { name, ...payload, agentToken: randomBytes(32).toString('hex') } });
}

async function clearPreviousUiRateMetrics() {
  const uiNodes = await prisma.node.findMany({
    where: { name: { startsWith: 'UI 节点 ·' } },
    select: { id: true }
  });
  const nodeIds = uiNodes.map(({ id }) => id);
  if (nodeIds.length === 0) return 0;
  const result = await prisma.nodeRateMetric.deleteMany({ where: { nodeId: { in: nodeIds } } });
  return result.count;
}

function createRateRows(node, profile) {
  const rows = [];
  const currentBucket = Math.floor(now.getTime() / RATE_BUCKET_MS) * RATE_BUCKET_MS;
  for (let index = 0; index < RATE_BUCKET_COUNT; index += 1) {
    const bucketStart = new Date(currentBucket - (RATE_BUCKET_COUNT - 1 - index) * RATE_BUCKET_MS);
    const dayPhase = (Math.sin((bucketStart.getUTCHours() / 24) * Math.PI * 2 - Math.PI / 2) + 1) / 2;
    const trend = 0.72 + (index / RATE_BUCKET_COUNT) * 0.18;
    const averageUpload = profile.uploadRate * (0.38 + dayPhase * 0.82) * trend * randomFloat(0.72, 1.24, 3);
    const averageDownload = profile.downloadRate * (0.38 + dayPhase * 0.82) * trend * randomFloat(0.72, 1.24, 3);
    const sampleCount = randomBetween(1, 3);
    rows.push({
      nodeId: node.id,
      bucketStart,
      sampleCount,
      uploadRateSum: Math.round(averageUpload * sampleCount * 100) / 100,
      downloadRateSum: Math.round(averageDownload * sampleCount * 100) / 100,
      uploadRatePeak: Math.round(averageUpload * randomFloat(1.05, 1.35, 3) * 100) / 100,
      downloadRatePeak: Math.round(averageDownload * randomFloat(1.05, 1.35, 3) * 100) / 100
    });
  }
  return rows;
}

async function createRateMetrics(rows) {
  for (let index = 0; index < rows.length; index += 400) {
    await prisma.nodeRateMetric.createMany({ data: rows.slice(index, index + 400) });
  }
}

async function upsertLine(name, data) {
  return upsertByName(prisma.line, name, {
    tag: data.tag,
    listen: '0.0.0.0',
    type: data.type ?? 'DIRECT',
    relayMode: data.relayMode ?? null,
    protocolType: data.protocolType,
    paramsJson: JSON.stringify(data.params ?? {}),
    entryNodeId: data.entryNodeId,
    entryPort: data.entryPort,
    landingNodeId: data.type === 'RELAY' ? (data.landingNodeId ?? null) : null,
    landingPort: data.type === 'RELAY' ? (data.landingPort ?? null) : null,
    endpointOverrideEnabled: false,
    serverHost: data.serverHost,
    serverPort: data.entryPort,
    serverName: null,
    host: null,
    trafficRate: data.trafficRate,
    tagsJson: JSON.stringify(data.tags),
    level: data.level ?? 0,
    sortOrder: data.sortOrder,
    isPublic: data.isPublic ?? true,
    status: data.status ?? 'ACTIVE'
  });
}

async function upsertPlan(name, data) {
  return upsertByName(prisma.plan, name, data);
}

async function clearPreviousUiUsers() {
  const previousUsers = await prisma.user.findMany({
    where: { email: { startsWith: 'ui-' } },
    select: { id: true }
  });
  const ids = previousUsers.map(({ id }) => id);
  if (ids.length === 0) return 0;

  await prisma.trafficLog.deleteMany({ where: { userId: { in: ids } } });
  await prisma.subscription.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  return ids.length;
}

function weightedSubscriptionStatus() {
  const value = randomBetween(1, 100);
  if (value <= 72) return 'ACTIVE';
  if (value <= 84) return 'CANCELED';
  if (value <= 94) return 'EXPIRED';
  return 'REVOKED';
}

function buildUserDefinition(batchTag, index, lineKeys) {
  const forcedStatuses = ['ACTIVE', 'CANCELED', 'EXPIRED', 'REVOKED'];
  const hasPlan = index < 4 || index === 99 || (index !== 98 && randomBetween(1, 100) > 5);
  const planName = hasPlan ? pick(['UI 演示 · 标准 100 GiB', 'UI 演示 · 专业 1 TiB', 'UI 演示 · 轻量 20 GiB']) : null;
  const subscriptionStatus = hasPlan ? forcedStatuses[index] ?? weightedSubscriptionStatus() : null;
  const isEmptyStateUser = index === TEST_USER_COUNT - 1;
  const traffic = !isEmptyStateUser && (index === 0 || randomBetween(1, 100) > 5);
  const isActive = index === 7 ? false : randomBetween(1, 100) > 8;
  const localPart = isEmptyStateUser
    ? `ui-${batchTag}-${String(index + 1).padStart(3, '0')}-empty-state-layout-check`
    : index === 1
    ? `ui-${batchTag}-${String(index + 1).padStart(3, '0')}-very-long-enterprise-address-for-layout-check`
    : `ui-${batchTag}-${String(index + 1).padStart(3, '0')}-${pick(['alice', 'bob', 'charlie', 'diana', 'eric', 'faye', 'grace', 'hugo', 'iris', 'jules'])}-${randomBytes(2).toString('hex')}`;

  let expireAt = null;
  if (subscriptionStatus === 'EXPIRED') expireAt = new Date(now.getTime() - randomBetween(1, 30) * DAY_MS);
  else if (subscriptionStatus) expireAt = randomFutureDate(subscriptionStatus === 'ACTIVE' ? 90 : 30);

  let usageRatio = 0;
  if (planName && traffic) {
    if (subscriptionStatus === 'EXPIRED') usageRatio = randomFloat(0.52, 0.98, 3);
    else if (subscriptionStatus === 'REVOKED') usageRatio = randomFloat(0.01, 0.25, 3);
    else usageRatio = randomFloat(0.03, 0.94, 3);
  }

  const selectedLineKeys = isEmptyStateUser ? [] : shuffle(lineKeys).slice(0, randomBetween(1, Math.min(4, lineKeys.length)));
  return {
    email: `${localPart}@demo.riricloud.local`,
    planName,
    subscriptionStatus,
    usageRatio,
    isActive,
    expireAt,
    lineKeys: selectedLineKeys,
    includeUnassigned: index === 0 || randomBetween(1, 100) <= 15,
    traffic
  };
}

async function createUser(definition, plan, index) {
  const limit = plan ? getPlanLimit(definition.planName) : DEFAULT_LIMIT;
  const used = plan ? BigInt(Math.round(Number(limit) * definition.usageRatio)) : 0n;
  const user = await prisma.user.create({
    data: {
      email: definition.email,
      passwordHash: UI_PASSWORD_HASH,
      role: 'USER',
      isActive: definition.isActive,
      trafficLimitBytes: limit,
      trafficUsedBytes: used,
      expireAt: definition.expireAt,
      createdAt: new Date(now.getTime() - randomBetween(0, 45) * DAY_MS - index * 1000)
    }
  });

  if (!plan) return user;

  const subscription = await prisma.subscription.create({
    data: {
      userId: user.id,
      planId: plan.id,
      status: definition.subscriptionStatus,
      trafficLimitBytes: limit,
      trafficUsedBytes: used,
      startedAt: new Date(now.getTime() - randomBetween(1, 45) * DAY_MS),
      expireAt: definition.expireAt,
      canceledAt: definition.subscriptionStatus === 'CANCELED' ? new Date(now.getTime() - randomBetween(1, 10) * DAY_MS) : null
    }
  });
  return prisma.user.update({ where: { id: user.id }, data: { subscriptionToken: subscription.subscriptionToken } });
}

function createTrafficRows(user, definition, lines, nodes, index) {
  if (!definition.traffic) return [];

  const rows = [];
  const anchorDays = [0, 1, 7, 14, 21, 29];
  const eventCount = randomBetween(16, 34);
  const timestamps = anchorDays.map((daysAgo) => randomDateForDay(daysAgo));
  while (timestamps.length < eventCount) {
    timestamps.push(randomDateForDay(randomBetween(0, 29)));
  }

  for (const [pointIndex, recordedAt] of timestamps.entries()) {
    const shouldBeUnassigned = definition.includeUnassigned && (pointIndex === 0 || randomBetween(1, 100) <= 18);
    const lineKey = shouldBeUnassigned ? null : definition.lineKeys[pointIndex % definition.lineKeys.length];
    const line = lineKey ? lines[lineKey] : null;
    const node = line ? nodes[line.entryNodeId] : nodes.unassigned;
    rows.push({
      nodeId: node.id,
      userId: user.id,
      lineId: line?.id ?? null,
      upload: BigInt(randomBetween(1, 80)) * MIB,
      download: BigInt(randomBetween(12, 900)) * MIB,
      recordedAt
    });
  }
  return rows;
}

async function main() {
  const batchTag = randomBytes(3).toString('hex');
  const deletedUsers = await clearPreviousUiUsers();
  const deletedRateMetrics = await clearPreviousUiRateMetrics();
  const template = await prisma.subscriptionTemplate.findFirst({ where: { isDefault: true } });
  const planStandard = await upsertPlan('UI 演示 · 标准 100 GiB', {
    description: '用于检查用户列表和流量明细布局的标准演示套餐',
    price: 19900,
    durationDays: 30,
    trafficLimitBytes: 100n * GIB,
    lineMatchMode: 'ALL',
    lineTagsJson: '[]',
    lineIdsJson: '[]',
    templateId: template?.id ?? null,
    isPublic: true,
    sortOrder: 10
  });
  const planProfessional = await upsertPlan('UI 演示 · 专业 1 TiB', {
    description: '用于检查大配额和长文本套餐名称布局的演示套餐',
    price: 69900,
    durationDays: 90,
    trafficLimitBytes: 1024n * GIB,
    lineMatchMode: 'TAGS',
    lineTagsJson: JSON.stringify(['premium', 'relay']),
    lineIdsJson: '[]',
    templateId: template?.id ?? null,
    isPublic: true,
    sortOrder: 11
  });
  const planLight = await upsertPlan('UI 演示 · 轻量 20 GiB', {
    description: '用于检查小配额进度条临界状态的演示套餐',
    price: 5900,
    durationDays: 7,
    trafficLimitBytes: 20n * GIB,
    lineMatchMode: 'EXPLICIT',
    lineTagsJson: '[]',
    lineIdsJson: '[]',
    templateId: template?.id ?? null,
    isPublic: false,
    sortOrder: 12
  });

  const lineRates = shuffle([0.5, 0.8, 1, 1.2, 1.5, 2]);
  const nodes = {
    hongKong: await upsertNode('UI 节点 · 香港入口', { serverHost: 'ui-hk.example.test', status: 'ONLINE', cpuUsage: randomFloat(12, 42), memoryUsage: randomFloat(25, 58), uploadRate: randomFloat(1.8, 18), downloadRate: randomFloat(8, 72) }),
    tokyo: await upsertNode('UI 节点 · 东京中继', { serverHost: 'ui-tokyo.example.test', status: 'ONLINE', cpuUsage: randomFloat(24, 68), memoryUsage: randomFloat(34, 78), uploadRate: randomFloat(3, 28), downloadRate: randomFloat(10, 120) }),
    losAngeles: await upsertNode('UI 节点 · 洛杉矶出口', { serverHost: 'ui-la.example.test', status: 'OFFLINE', cpuUsage: 0, memoryUsage: 0, uploadRate: 0, downloadRate: 0 }),
    unassigned: await upsertNode('UI 节点 · 裸机未分配', { serverHost: 'ui-unassigned.example.test', status: 'ONLINE', cpuUsage: randomFloat(8, 24), memoryUsage: randomFloat(18, 42), uploadRate: randomFloat(0.5, 8), downloadRate: randomFloat(2, 24) })
  };

  const lines = {
    hkVless: await upsertLine('UI 香港 Premium · VLESS', { tag: 'ui-hk-vless', protocolType: 'VLESS', params: { flow: 'xtls-rprx-vision', transport: { type: 'tcp' }, tls: { enabled: true, mode: 'reality', serverName: 'www.apple.com' } }, entryNodeId: nodes.hongKong.id, entryPort: 24101, serverHost: nodes.hongKong.serverHost, trafficRate: lineRates[0], tags: ['hk', 'premium'], sortOrder: 20 }),
    hkShadowsocks: await upsertLine('UI 香港低倍率 · Shadowsocks', { tag: 'ui-hk-ss', protocolType: 'SHADOWSOCKS', params: { method: '2022-blake3-aes-128-gcm', password: 'ui-demo-password', mode: 'shared' }, entryNodeId: nodes.hongKong.id, entryPort: 24102, serverHost: nodes.hongKong.serverHost, trafficRate: lineRates[1], tags: ['hk', 'economy'], sortOrder: 21 }),
    tokyoRelay: await upsertLine('UI 东京中继 · Hysteria2', { tag: 'ui-tokyo-relay', type: 'RELAY', relayMode: 'BLIND_FORWARD', protocolType: 'HYSTERIA2', params: { upMbps: 100, downMbps: 500, tls: { enabled: true, mode: 'tls', serverName: 'ui-tokyo.example.test', insecure: true } }, entryNodeId: nodes.tokyo.id, entryPort: 24111, landingNodeId: nodes.losAngeles.id, landingPort: 24121, serverHost: nodes.tokyo.serverHost, trafficRate: lineRates[2], tags: ['premium', 'relay', 'us'], sortOrder: 22 }),
    tokyoTuic: await upsertLine('UI 东京直连 · TUIC', { tag: 'ui-tokyo-tuic', protocolType: 'TUIC', params: { congestionControl: 'bbr', zeroRttHandshake: false, heartbeat: '10s', tls: { enabled: true, mode: 'tls', serverName: 'ui-tokyo.example.test', insecure: true } }, entryNodeId: nodes.tokyo.id, entryPort: 24112, serverHost: nodes.tokyo.serverHost, trafficRate: lineRates[3], tags: ['jp', 'premium'], sortOrder: 23 }),
    laVless: await upsertLine('UI 洛杉矶 · VLESS Reality', { tag: 'ui-la-vless', protocolType: 'VLESS', params: { flow: 'xtls-rprx-vision', transport: { type: 'tcp' }, tls: { enabled: true, mode: 'reality', serverName: 'www.microsoft.com' } }, entryNodeId: nodes.losAngeles.id, entryPort: 24131, serverHost: nodes.losAngeles.serverHost, trafficRate: lineRates[4], tags: ['us', 'premium'], sortOrder: 24 }),
    laTrojan: await upsertLine('UI 洛杉矶备用 · Trojan', { tag: 'ui-la-trojan', protocolType: 'TROJAN', params: { transport: { type: 'ws', path: '/ui-demo' }, tls: { enabled: true, mode: 'tls', serverName: 'ui-la.example.test', insecure: true } }, entryNodeId: nodes.losAngeles.id, entryPort: 24132, serverHost: nodes.losAngeles.serverHost, trafficRate: lineRates[5], tags: ['us', 'backup'], sortOrder: 25 }),
    disabled: await upsertLine('UI 香港 · 已停用线路', { tag: 'ui-hk-disabled', protocolType: 'VLESS', params: { transport: { type: 'tcp' }, tls: { enabled: false, mode: 'none' } }, entryNodeId: nodes.hongKong.id, entryPort: 24103, serverHost: nodes.hongKong.serverHost, trafficRate: 1, tags: ['hk', 'maintenance'], status: 'DISABLED', isPublic: false, sortOrder: 26 })
  };

  const lineKeys = ['hkVless', 'hkShadowsocks', 'tokyoRelay', 'tokyoTuic', 'laVless', 'laTrojan'];
  const preparedUsers = [];
  const trafficRows = [];
  const nodeById = Object.fromEntries(Object.values(nodes).map((node) => [node.id, node]));
  const lineMap = Object.fromEntries(Object.entries(lines).map(([key, line]) => [key, line]));

  for (let index = 0; index < TEST_USER_COUNT; index += 1) {
    const definition = buildUserDefinition(batchTag, index, lineKeys);
    const plan = definition.planName === 'UI 演示 · 标准 100 GiB'
      ? planStandard
      : definition.planName === 'UI 演示 · 专业 1 TiB'
        ? planProfessional
        : definition.planName === 'UI 演示 · 轻量 20 GiB'
          ? planLight
          : null;
    const user = await createUser(definition, plan, index);
    preparedUsers.push(user);
    trafficRows.push(...createTrafficRows(user, definition, lineMap, { ...nodeById, unassigned: nodes.unassigned }, index));
  }

  if (trafficRows.length > 0) await prisma.trafficLog.createMany({ data: trafficRows });
  const rateProfiles = {
    hongKong: { uploadRate: nodes.hongKong.uploadRate, downloadRate: nodes.hongKong.downloadRate },
    tokyo: { uploadRate: nodes.tokyo.uploadRate, downloadRate: nodes.tokyo.downloadRate },
    losAngeles: { uploadRate: randomFloat(2, 24), downloadRate: randomFloat(8, 96) },
    unassigned: { uploadRate: nodes.unassigned.uploadRate, downloadRate: nodes.unassigned.downloadRate }
  };
  for (const [key, profile] of Object.entries(rateProfiles)) {
    if (nodes[key].status !== 'ONLINE') continue;
    await prisma.node.update({
      where: { id: nodes[key].id },
      data: {
        status: 'ONLINE',
        lastSeenAt: new Date(),
        uploadRate: profile.uploadRate,
        downloadRate: profile.downloadRate,
        bandwidthRate: profile.uploadRate + profile.downloadRate
      }
    });
  }
  const rateRows = Object.entries(nodes).flatMap(([key, node]) => createRateRows(node, rateProfiles[key]));
  await createRateMetrics(rateRows);
  console.log(`ui traffic seed: batch=${batchTag}, deletedUsers=${deletedUsers}, deletedRateMetrics=${deletedRateMetrics}, users=${preparedUsers.length}, lines=${Object.keys(lines).length}, trafficLogs=${trafficRows.length}, rateMetrics=${rateRows.length}`);
  console.log('ui traffic seed: password=ui-demo-pass-2026');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
