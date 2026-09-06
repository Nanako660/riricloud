'use strict';

const { PrismaClient } = require('@prisma/client');
const { findMasterAgentNode } = require('./master-agent-bootstrap');
const { decryptSecret } = require('./secret-crypto');

const prisma = new PrismaClient();

async function main() {
  const node = await findMasterAgentNode(prisma);
  if (!node) throw new Error('Master-Local 节点不存在，请先执行主控 bootstrap');
  if (!node.agentToken) throw new Error('Master-Local 节点缺少 AgentToken');

  if (process.argv.includes('--token')) {
    process.stdout.write(`${decryptSecret(node.agentToken)}\n`);
    return;
  }

  process.stdout.write(`${JSON.stringify({ id: node.id, name: node.name, serverHost: node.serverHost })}\n`);
}

main()
  .catch((error) => {
    console.error(`master agent config failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
