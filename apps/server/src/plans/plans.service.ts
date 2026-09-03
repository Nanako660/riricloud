import { ConflictException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { QueryPlanDto } from './dto/query-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { LinesService } from '../lines/lines.service';

type PlanViewInput = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  durationDays: number;
  trafficLimitBytes: bigint;
  trafficResetMode: string;
  lineMatchMode: string;
  lineTagsJson: string;
  lineIdsJson: string;
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
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly linesService?: LinesService
  ) {}

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

  async getAvailableLines(id: string) {
    const plan = await this.prisma.plan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException('套餐不存在');
    if (!this.linesService) throw new NotFoundException('线路服务不可用');
    return this.linesService.getAvailableForPlan(plan);
  }

  // 兼容旧管理端路径；返回内容已切换为线路。
  async getAvailableNodes(id: string) {
    return this.getAvailableLines(id);
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
      price: toCents(dto.price ?? 0),
      durationDays: dto.durationDays,
      trafficLimitBytes: BigInt(dto.trafficLimitBytes),
      trafficResetMode: dto.trafficResetMode ?? 'NONE',
      lineMatchMode: dto.lineMatchMode ?? 'ALL',
      lineTagsJson: JSON.stringify(dto.lineTags ?? []),
      lineIdsJson: JSON.stringify(dto.lineIds ?? []),
      templateId: dto.templateId ?? null,
      isPublic: dto.isPublic ?? true,
      sortOrder: dto.sortOrder ?? 0
    };
  }

  private toUpdateData(dto: UpdatePlanDto) {
    return {
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.description !== undefined ? { description: dto.description?.trim() || null } : {}),
      ...(dto.price !== undefined ? { price: toCents(dto.price) } : {}),
      ...(dto.durationDays !== undefined ? { durationDays: dto.durationDays } : {}),
      ...(dto.trafficLimitBytes !== undefined ? { trafficLimitBytes: BigInt(dto.trafficLimitBytes) } : {}),
      ...(dto.trafficResetMode !== undefined ? { trafficResetMode: dto.trafficResetMode } : {}),
      ...(dto.lineMatchMode !== undefined ? { lineMatchMode: dto.lineMatchMode } : {}),
      ...(dto.lineTags !== undefined ? { lineTagsJson: JSON.stringify(dto.lineTags) } : {}),
      ...(dto.lineIds !== undefined ? { lineIdsJson: JSON.stringify(dto.lineIds) } : {}),
      ...(dto.templateId !== undefined ? { templateId: dto.templateId } : {}),
      ...(dto.isPublic !== undefined ? { isPublic: dto.isPublic } : {}),
      ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {})
    };
  }

  private toView(plan: PlanViewInput) {
    return {
      ...plan,
      price: fromCents(plan.price),
      trafficLimitBytes: Number(plan.trafficLimitBytes),
      lineTags: parseStringArray(plan.lineTagsJson),
      lineIds: parseStringArray(plan.lineIdsJson),
      lineTagsJson: undefined,
      lineIdsJson: undefined
    };
  }
}

function toCents(value: number): number {
  if (!Number.isFinite(value) || value < 0) throw new Error('套餐价格必须为非负数');
  const cents = Math.round(value * 100);
  if (!Number.isSafeInteger(cents) || cents > 2147483647) throw new Error('套餐价格超出范围');
  return cents;
}

function fromCents(value: number): number {
  return Number((value / 100).toFixed(2));
}
