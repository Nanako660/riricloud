const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomBytes } = require('node:crypto');
const { decryptSecret, encryptSecret } = require('./secret-crypto');

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

function syncTokenFile(token) {
  if (!token) return;
  const candidates = [
    path.join('/app', 'data', 'agent'),
    path.join(process.cwd(), 'data', 'agent'),
    path.join(process.cwd(), '..', '..', 'data', 'agent')
  ];
  for (const dir of candidates) {
    try {
      if (fs.existsSync(dir)) {
        const tokenFile = path.join(dir, 'token');
        fs.writeFileSync(tokenFile, `${token.trim()}\n`, { mode: 0o600 });
        return;
      }
    } catch {
      // 忽略文件系统只读或权限错误
    }
  }
}

async function findMasterAgentNode(prisma) {
  return prisma.node.findFirst({
    where: { isLocal: true },
    orderBy: [{ createdAt: 'asc' }]
  });
}

async function ensureMasterAgentNode(prisma, env = process.env) {
  const existing = await findMasterAgentNode(prisma);
  const explicitToken = firstNonEmpty(env.MASTER_LOCAL_AGENT_TOKEN);

  if (existing) {
    if (explicitToken) {
      const explicitHash = createHash('sha256').update(explicitToken).digest('hex');
      if (existing.agentTokenHash !== explicitHash) {
        const updated = await prisma.node.update({
          where: { id: existing.id },
          data: {
            agentToken: encryptSecret(explicitToken),
            agentTokenHash: explicitHash
          }
        });
        console.log(`master agent bootstrap: synchronized token for ${updated.name}`);
        syncTokenFile(explicitToken);
        return { node: updated, created: false };
      }
    }
    syncTokenFile(explicitToken || decryptSecret(existing.agentToken));
    return { node: existing, created: false };
  }

  const token = explicitToken || randomBytes(32).toString('hex');
  const node = await prisma.node.create({
    data: {
      name: MASTER_AGENT_NAME,
      serverHost: resolveMasterLocalHost(env),
      isLocal: true,
      agentToken: encryptSecret(token),
      agentTokenHash: createHash('sha256').update(token).digest('hex'),
      status: 'OFFLINE'
    }
  });

  console.log(`master agent bootstrap: created ${node.name}`);
  syncTokenFile(token);
  return { node, created: true };
}

module.exports = {
  DEFAULT_MASTER_LOCAL_HOST,
  MASTER_AGENT_NAME,
  ensureMasterAgentNode,
  findMasterAgentNode,
  resolveMasterLocalHost
};
