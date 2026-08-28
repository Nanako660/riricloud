// 种子数据：幂等创建演示管理员与普通用户（机制说明见 docs/DATA_MODELS.md §seed）
// 凭据从环境变量读取，默认值仅供本地演示；生产环境务必修改或禁用
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@riricloud.local';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'riri-admin-demo';
  const userEmail = process.env.SEED_USER_EMAIL || 'demo@riricloud.local';
  const userPassword = process.env.SEED_USER_PASSWORD || 'riri-user-demo';

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: { role: 'ADMIN', isActive: true },
    create: {
      email: adminEmail,
      passwordHash: await bcrypt.hash(adminPassword, 10),
      role: 'ADMIN'
    }
  });

  await prisma.user.upsert({
    where: { email: userEmail },
    update: { isActive: true },
    create: {
      email: userEmail,
      passwordHash: await bcrypt.hash(userPassword, 10),
      role: 'USER'
    }
  });

  console.log(`seed: admin=${adminEmail}, user=${userEmail}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
