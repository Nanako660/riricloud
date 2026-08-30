import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { parseDocument } from 'yaml';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';

type TemplateViewInput = {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  proxyGroupsJson: string;
  ruleSetsJson: string;
  dnsConfigJson: string;
  customInjectYaml: string | null;
  customInjectJson: string | null;
  [key: string]: unknown;
};

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

@Injectable()
export class TemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateTemplateDto) {
    const data = { ...this.toData(dto), name: dto.name.trim() };
    if (dto.isDefault) await this.prisma.subscriptionTemplate.updateMany({ data: { isDefault: false } });
    const template = await this.prisma.subscriptionTemplate.create({ data });
    return this.toView(template);
  }

  async list() {
    const templates = await this.prisma.subscriptionTemplate.findMany({
      include: { _count: { select: { plans: true } } },
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }]
    });
    return templates.map((template) => this.toView(template));
  }

  async get(id: string) {
    const template = await this.prisma.subscriptionTemplate.findUnique({
      where: { id },
      include: { _count: { select: { plans: true } } }
    });
    if (!template) throw new NotFoundException('订阅模板不存在');
    return this.toView(template);
  }

  async getDefault() {
    const template = await this.prisma.subscriptionTemplate.findFirst({ orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] });
    if (!template) throw new NotFoundException('尚未配置订阅模板');
    return this.toView(template);
  }

  async update(id: string, dto: UpdateTemplateDto) {
    await this.get(id);
    const data = this.toData(dto);
    if (dto.isDefault) await this.prisma.subscriptionTemplate.updateMany({ data: { isDefault: false } });
    const template = await this.prisma.subscriptionTemplate.update({ where: { id }, data });
    return this.toView(template);
  }

  async remove(id: string) {
    const template = await this.prisma.subscriptionTemplate.findUnique({
      where: { id },
      include: { _count: { select: { plans: true } } }
    });
    if (!template) throw new NotFoundException('订阅模板不存在');
    if (template.isDefault) throw new ConflictException('默认模板不能删除，请先指定其他默认模板');
    if (template._count.plans > 0) throw new ConflictException('套餐仍在使用该模板');
    await this.prisma.subscriptionTemplate.delete({ where: { id } });
    return { deleted: true };
  }

  private toData(dto: CreateTemplateDto | UpdateTemplateDto) {
    this.validateYaml(dto.customInjectYaml);
    this.validateJson(dto.customInjectJson);
    return {
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.description !== undefined ? { description: dto.description?.trim() || null } : {}),
      ...(dto.proxyGroups !== undefined ? { proxyGroupsJson: JSON.stringify(dto.proxyGroups) } : {}),
      ...(dto.ruleSets !== undefined ? { ruleSetsJson: JSON.stringify(dto.ruleSets) } : {}),
      ...(dto.dnsConfig !== undefined ? { dnsConfigJson: JSON.stringify(dto.dnsConfig) } : {}),
      ...(dto.customInjectYaml !== undefined ? { customInjectYaml: dto.customInjectYaml?.trim() || null } : {}),
      ...(dto.customInjectJson !== undefined ? { customInjectJson: dto.customInjectJson?.trim() || null } : {}),
      ...(dto.isDefault !== undefined ? { isDefault: dto.isDefault } : {})
    };
  }

  private validateYaml(value: string | null | undefined) {
    if (!value?.trim()) return;
    const doc = parseDocument(value);
    if (doc.errors.length) throw new BadRequestException(`customInjectYaml 语法错误: ${doc.errors[0].message}`);
    if (!doc.toJS() || Array.isArray(doc.toJS()) || typeof doc.toJS() !== 'object') {
      throw new BadRequestException('customInjectYaml 必须是 YAML 对象');
    }
  }

  private validateJson(value: string | null | undefined) {
    if (!value?.trim()) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new BadRequestException('customInjectJson 必须是合法 JSON');
    }
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
      throw new BadRequestException('customInjectJson 必须是 JSON 对象');
    }
  }

  private toView(template: TemplateViewInput) {
    return {
      ...template,
      proxyGroups: parseJson(template.proxyGroupsJson, []),
      ruleSets: parseJson(template.ruleSetsJson, []),
      dnsConfig: parseJson(template.dnsConfigJson, {}),
      proxyGroupsJson: undefined,
      ruleSetsJson: undefined,
      dnsConfigJson: undefined
    };
  }
}
