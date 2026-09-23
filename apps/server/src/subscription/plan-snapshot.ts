import type { Prisma } from '@prisma/client';

export type RedeemedPlanSnapshot = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  durationDays: number;
  trafficLimitBytes: string;
  trafficResetMode: string;
  lineMatchMode: string;
  lineTagsJson: string;
  lineIdsJson: string;
  templateId: string | null;
  badgeText: string | null;
  isFeatured: boolean;
  featuresJson: string;
  cardConfigJson: string;
  isPublic: boolean;
  sortOrder: number;
  purchaseLimitPerUser: number | null;
  allowRenewal: boolean;
  speedLimitMbps: number | null;
  appendSpeedBadge: string;
  template: Record<string, unknown> | null;
};

export function captureRedeemedPlanSnapshot(plan: Prisma.PlanGetPayload<{ include: { template: true } }>): RedeemedPlanSnapshot {
  return {
    id: plan.id,
    name: plan.name,
    description: plan.description,
    price: plan.price,
    durationDays: plan.durationDays,
    trafficLimitBytes: plan.trafficLimitBytes.toString(),
    trafficResetMode: plan.trafficResetMode,
    lineMatchMode: plan.lineMatchMode,
    lineTagsJson: plan.lineTagsJson,
    lineIdsJson: plan.lineIdsJson,
    templateId: plan.templateId,
    badgeText: plan.badgeText,
    isFeatured: plan.isFeatured,
    featuresJson: plan.featuresJson,
    cardConfigJson: plan.cardConfigJson,
    isPublic: plan.isPublic,
    sortOrder: plan.sortOrder,
    purchaseLimitPerUser: plan.purchaseLimitPerUser,
    allowRenewal: plan.allowRenewal,
    speedLimitMbps: plan.speedLimitMbps,
    appendSpeedBadge: plan.appendSpeedBadge,
    template: plan.template ? { ...plan.template } : null
  };
}

export function applyPlanSnapshot<T extends object>(subscription: T): T {
  const source = subscription as T & { plan?: Record<string, unknown> | null; planSnapshotJson?: string | null };
  if (!source.planSnapshotJson || !source.plan) return subscription;
  try {
    const snapshot = JSON.parse(source.planSnapshotJson) as Record<string, unknown>;
    if (!snapshot || typeof snapshot !== 'object' || typeof snapshot.name !== 'string') return subscription;
    return {
      ...source,
      plan: {
        ...source.plan,
        ...snapshot,
        trafficLimitBytes: BigInt(String(snapshot.trafficLimitBytes)),
        template: snapshot.template ?? null
      }
    };
  } catch {
    return subscription;
  }
}
