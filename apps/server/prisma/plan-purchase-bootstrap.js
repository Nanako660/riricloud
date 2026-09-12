'use strict';

const { createHmac } = require('node:crypto');
const { validateJwtSecret } = require('./admin-bootstrap');

function hashPlanPurchaseEmail(email) {
  const secret = validateJwtSecret(process.env.JWT_SECRET);
  const normalized = String(email ?? '').trim().toLowerCase();
  return createHmac('sha256', secret).update(`plan-purchase-email\u0000${normalized}`).digest('hex');
}

async function ensurePlanPurchaseIdentity(prisma, user) {
  let identityId = user.planPurchaseIdentityId ?? null;
  if (identityId) {
    await prisma.planPurchaseIdentity.upsert({
      where: { id: identityId },
      update: {},
      create: { id: identityId }
    });
  } else {
    const existingAlias = await prisma.planPurchaseEmailAlias.findUnique({
      where: { emailHash: hashPlanPurchaseEmail(user.email) },
      select: { identityId: true }
    });
    if (existingAlias) {
      identityId = existingAlias.identityId;
    } else {
      const identity = await prisma.planPurchaseIdentity.upsert({
        where: { id: user.id },
        update: {},
        create: { id: user.id }
      });
      identityId = identity.id;
    }
    await prisma.user.update({ where: { id: user.id }, data: { planPurchaseIdentityId: identityId } });
  }

  await prisma.planPurchaseEmailAlias.upsert({
    where: { emailHash: hashPlanPurchaseEmail(user.email) },
    update: {},
    create: { identityId, emailHash: hashPlanPurchaseEmail(user.email) }
  });
  return identityId;
}

async function ensurePlanPurchaseForSubscription(prisma, user, subscription) {
  const existing = await prisma.planPurchase.findFirst({
    where: { subscriptionId: subscription.id }
  });
  if (existing) return existing;

  const identityId = await ensurePlanPurchaseIdentity(prisma, user);
  const used = await prisma.planPurchase.count({ where: { identityId, planId: subscription.planId } });
  return prisma.planPurchase.create({
    data: {
      identityId,
      planId: subscription.planId,
      sequence: used + 1,
      source: 'MIGRATED',
      subscriptionId: subscription.id
    }
  });
}

module.exports = {
  ensurePlanPurchaseForSubscription,
  ensurePlanPurchaseIdentity,
  hashPlanPurchaseEmail
};
