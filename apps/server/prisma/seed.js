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

  const templateData = {
    name: '默认分流模板',
    description: '开箱即用的常见流媒体、AI、广告与国内直连分流模板',
    isDefault: true,
    proxyGroupsJson: JSON.stringify([
      { name: '节点选择', type: 'select', proxies: 'all' },
      { name: '自动测速', type: 'url-test', interval: 300, tolerance: 50, proxies: 'all' }
    ]),
    ruleSetsJson: JSON.stringify([
      { name: 'OpenAI', type: 'domain-suffix', rules: ['openai.com', 'chatgpt.com'], target: '节点选择', enabled: true },
      { name: '流媒体', type: 'domain-suffix', rules: ['netflix.com', 'youtube.com'], target: '节点选择', enabled: true },
      { name: '广告拦截', type: 'domain-suffix', rules: ['doubleclick.net', 'ads.google.com'], target: 'REJECT', enabled: true },
      { name: '国内直连', type: 'geosite', rules: ['cn'], target: 'DIRECT', enabled: true },
      { name: 'Final', type: 'match', rules: [], target: '节点选择', enabled: true }
    ]),
    dnsConfigJson: JSON.stringify({
      enable: true,
      enhancedMode: 'fake-ip',
      nameserver: ['https://1.1.1.1/dns-query', 'https://dns.google/dns-query']
    })
  };

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
    nodeMatchMode: 'ALL',
    nodeTagsJson: '[]',
    nodeIdsJson: '[]',
    templateId: template.id,
    isPublic: true,
    sortOrder: 0
  };
  if (plan) {
    plan = await prisma.plan.update({ where: { id: plan.id }, data: planData });
  } else {
    plan = await prisma.plan.create({ data: planData });
  }

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { role: 'ADMIN', isActive: true },
    create: {
      email: adminEmail,
      passwordHash: await bcrypt.hash(adminPassword, 10),
      role: 'ADMIN'
    }
  });

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

  console.log(`seed: admin=${adminEmail}, user=${userEmail}, plan=${plan.name}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
