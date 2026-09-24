import { applyPlanSnapshot, captureRedeemedPlanSnapshot } from './plan-snapshot';

describe('redeemed plan snapshots', () => {
  const template = {
    id: 'template-1', name: 'Frozen template', description: null, isDefault: false, isBuiltin: false,
    proxyGroupsJson: '[{"tag":"frozen"}]', ruleSetsJson: '[]', dnsConfigJson: '{}',
    customInjectYaml: 'frozen: true', customInjectJson: null, createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-02T00:00:00Z')
  };
  const plan = {
    id: 'plan-1', name: 'Frozen plan', description: 'description', price: 1234, durationDays: 30,
    trafficLimitBytes: BigInt(1024), trafficResetMode: 'CALENDAR_MONTH', lineMatchMode: 'TAGS',
    lineTagsJson: '["frozen"]', lineIdsJson: '[]', templateId: template.id, badgeText: 'badge',
    isFeatured: true, featuresJson: '["feature"]', cardConfigJson: '{"icon":"gift"}', isPublic: false,
    sortOrder: 7, purchaseLimitPerUser: 1, allowRenewal: false, speedLimitMbps: 20,
    appendSpeedBadge: 'ENABLE', createdAt: new Date(), updatedAt: new Date(), template
  };

  it('保存并恢复完整套餐权益和订阅模板快照', () => {
    const snapshot = captureRedeemedPlanSnapshot(plan as never);
    const subscription = {
      planSnapshotJson: JSON.stringify(snapshot),
      plan: { id: plan.id, name: 'Edited later', price: 9999, trafficLimitBytes: BigInt(9999), template: null }
    };

    const effective = applyPlanSnapshot(subscription);

    expect(effective.plan).toMatchObject({
      id: 'plan-1', name: 'Frozen plan', price: 1234, durationDays: 30, trafficLimitBytes: BigInt(1024),
      trafficResetMode: 'CALENDAR_MONTH', lineMatchMode: 'TAGS', lineTagsJson: '["frozen"]',
      template: { id: 'template-1', proxyGroupsJson: '[{"tag":"frozen"}]', customInjectYaml: 'frozen: true' },
      speedLimitMbps: 20, appendSpeedBadge: 'ENABLE'
    });
  });

  it('旧订阅无快照时保持关联套餐原样，损坏快照回退至关联套餐', () => {
    const legacy = { plan: { id: 'plan-1', name: 'Legacy', trafficLimitBytes: BigInt(64) } };
    expect(applyPlanSnapshot(legacy)).toBe(legacy);
    const malformed = { ...legacy, planSnapshotJson: '{"name":"broken"' };
    expect(applyPlanSnapshot(malformed)).toBe(malformed);
  });
});
