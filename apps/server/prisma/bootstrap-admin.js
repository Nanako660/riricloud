'use strict';

const { PrismaClient } = require('@prisma/client');
const { ensureAdmin } = require('./admin-bootstrap');
const { ensureMasterAgentNode } = require('./master-agent-bootstrap');

const prisma = new PrismaClient();

async function main() {
  await ensureAdmin(prisma);
  await ensureMasterAgentNode(prisma);
}

main()
  .catch((error) => {
    console.error(`admin bootstrap failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
