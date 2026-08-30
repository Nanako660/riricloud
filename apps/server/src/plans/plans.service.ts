import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { QueryPlanDto } from './dto/query-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';

type PlanViewInput = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  durationDays: number;
  trafficLimitBytes: bigint;
  nodeMatchMode: string;
  nodeTagsJson: string;
  nodeIdsJson: string;
  templateId: string | null;
  isPublic: boolean;
  sortOrder: number;
  [key: string]: unknown;
};

function parseStringArray(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

@Injectable()
export class PlansService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreatePlanDto) {
    await this.ensureTemplate(dto.templateId);
    const plan = await this.prisma.plan.create({ data: this.toCreateData(dto) });
    return this.toView(plan);
  }

  async list(query: QueryPlanDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where = {
      ...(query.search ? { name: { contains: query.search } } : {}),
      ...(query.isPublic !== undefined ? { isPublic: query.isPublic } : {})
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.plan.findMany({
        where,
        include: { template: { select: { id: true, name: true, isDefault: true } } },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize
      }),
      this.prisma.plan.count({ where })
    ]);
    return { data: data.map((plan) => this.toView(plan)), total, page, pageSize };
  }

  async listPublic() {
    const result = await this.list({ page: 1, pageSize: 100, isPublic: true });
    return result.data;
  }

  async get(id: string) {
    const plan = await this.prisma.plan.findUnique({
      where: { id },
      include: { template: { select: { id: true, name: true, isDefault: true } } }
    });
    if (!plan) throw new NotFoundException('套餐不存在');
    return this.toView(plan);
  }

  async update(id: string, dto: UpdatePlanDto) {
    await this.get(id);
    await this.ensureTemplate(dto.templateId);
    const plan = await this.prisma.plan.update({ where: { id }, data: this.toUpdateData(dto) });
    return this.toView(plan);
  }

  async remove(id: string) {
    const plan = await this.prisma.plan.findUnique({
      where: { id },
      include: { _count: { select: { subscriptions: true } } }
    });
    if (!plan) throw new NotFoundException('套餐不存在');
    if (plan._count.subscriptions > 0) {
      throw new ConflictException('已有订阅使用该套餐，请先下架而不要删除');
    }
    await this.prisma.plan.delete({ where: { id } });
    return { deleted: true };
  }

  async getAvailableNodes(id: string) {
    const plan = await this.prisma.plan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException('套餐不存在');
    const tags = parseStringArray(plan.nodeTagsJson);
    const ids = parseStringArray(plan.nodeIdsJson);
    const nodes = await this.prisma.node.findMany({
      where: { status: 'ONLINE', isPublic: true },
      include: { inbounds: { where: { isPublic: true }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] } },
      orderBy: [{ sortOrder: 'asc' }, { level: 'desc' }, { createdAt: 'asc' }]
    });
    return nodes
      .filter((node) => {
        if (plan.nodeMatchMode === 'EXPLICIT') return ids.includes(node.id);
        if (plan.nodeMatchMode === 'TAGS') {
          const nodeTags = parseStringArray(node.tagsJson);
          return tags.some((tag) => nodeTags.includes(tag));
        }
        return true;
      })
      .map((node) => ({
        id: node.id,
        name: node.name,
        serverHost: node.serverHost,
        level: node.level,
        tags: parseStringArray(node.tagsJson),
        inbounds: node.inbounds.map((inbound) => ({ id: inbound.id, type: inbound.type, tag: inbound.tag, port: inbound.port }))
      }));
  }

  private async ensureTemplate(templateId: string | null | undefined) {
    if (templateId && !(await this.prisma.subscriptionTemplate.findUnique({ where: { id: templateId } }))) {
      throw new NotFoundException('订阅模板不存在');
    }
  }

  private toCreateData(dto: CreatePlanDto) {
    return {
      name: dto.name.trim(),
      description: dto.description?.trim() || null,
      price: dto.price ?? 0,
      durationDays: dto.durationDays,
      trafficLimitBytes: BigInt(dto.trafficLimitBytes),
      nodeMatchMode: dto.nodeMatchMode ?? 'ALL',
      nodeTagsJson: JSON.stringify(dto.nodeTags ?? []),
      nodeIdsJson: JSON.stringify(dto.nodeIds ?? []),
      templateId: dto.templateId ?? null,
      isPublic: dto.isPublic ?? true,
      sortOrder: dto.sortOrder ?? 0
    };
  }

  private toUpdateData(dto: UpdatePlanDto) {
    return {
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.description !== undefined ? { description: dto.description?.trim() || null } : {}),
      ...(dto.price !== undefined ? { price: dto.price } : {}),
      ...(dto.durationDays !== undefined ? { durationDays: dto.durationDays } : {}),
      ...(dto.trafficLimitBytes !== undefined ? { trafficLimitBytes: BigInt(dto.trafficLimitBytes) } : {}),
      ...(dto.nodeMatchMode !== undefined ? { nodeMatchMode: dto.nodeMatchMode } : {}),
      ...(dto.nodeTags !== undefined ? { nodeTagsJson: JSON.stringify(dto.nodeTags) } : {}),
      ...(dto.nodeIds !== undefined ? { nodeIdsJson: JSON.stringify(dto.nodeIds) } : {}),
      ...(dto.templateId !== undefined ? { templateId: dto.templateId } : {}),
      ...(dto.isPublic !== undefined ? { isPublic: dto.isPublic } : {}),
      ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {})
    };
  }

  private toView(plan: PlanViewInput) {
    return {
      ...plan,
      trafficLimitBytes: Number(plan.trafficLimitBytes),
      nodeTags: parseStringArray(plan.nodeTagsJson),
      nodeIds: parseStringArray(plan.nodeIdsJson),
      nodeTagsJson: undefined,
      nodeIdsJson: undefined
    };
  }
}
