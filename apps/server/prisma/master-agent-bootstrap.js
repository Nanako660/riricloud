'use strict';

const { randomBytes } = require('node:crypto');

const MASTER_AGENT_NAME = 'Master-Local';
const DEFAULT_MASTER_LOCAL_HOST = '127.0.0.1';

function firstNonEmpty(...values) {
  return values.find((value) => typeof value === 'string' && value.trim().length > 0) ?? null;
}

function resolveMasterLocalHost(env = process.env) {
  const explicitHost = firstNonEmpty(env.MASTER_LOCAL_HOST);
  if (explicitHost) return explicitHost.trim();

  const publicUrl = firstNonEmpty(env.RIRICLOUD_PUBLIC_URL);
  if (publicUrl) {
    let parsed;
    try {
      parsed = new URL(publicUrl);
    } catch {
      throw new Error('RIRICLOUD_PUBLIC_URL 必须是包含协议和主机名的绝对 URL');
    }
    if (!parsed.hostname) {
      throw new Error('RIRICLOUD_PUBLIC_URL 必须包含可用的主机名');
    }
    return parsed.hostname;
  }

  return DEFAULT_MASTER_LOCAL_HOST;
}

async function findMasterAgentNode(prisma) {
  return prisma.node.findFirst({
    where: { isLocal: true },
    orderBy: [{ createdAt: 'asc' }]
  });
}

async function ensureMasterAgentNode(prisma, env = process.env) {
  const existing = await findMasterAgentNode(prisma);
  if (existing) return { node: existing, created: false };

  const node = await prisma.node.create({
    data: {
      name: MASTER_AGENT_NAME,
      serverHost: resolveMasterLocalHost(env),
      isLocal: true,
      agentToken: randomBytes(32).toString('hex'),
      status: 'OFFLINE'
    }
  });

  console.log(`master agent bootstrap: created ${node.name}`);
  return { node, created: true };
}

module.exports = {
  DEFAULT_MASTER_LOCAL_HOST,
  MASTER_AGENT_NAME,
  ensureMasterAgentNode,
  findMasterAgentNode,
  resolveMasterLocalHost
};
