import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { createPublicKey, X509Certificate } from 'node:crypto';
import { AgentService } from '../agent-gateway/agent.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCertificateDto, ParseCertificateDto, UpdateCertificateDto } from './dto/create-certificate.dto';
import { QueryCertificateDto } from './dto/query-certificate.dto';

export type CertificateStatus = 'VALID' | 'EXPIRING' | 'EXPIRED' | 'NOT_YET_VALID';

const certificateCount = { _count: { select: { lines: true } } } as const;
type CertificateWithCount = Prisma.CertificateGetPayload<{ include: typeof certificateCount }>;

type ParsedCertificate = {
  certificatePem: string;
  subject: string;
  issuer: string;
  serialNumber: string;
  sans: string[];
  validFrom: Date;
  validTo: Date;
  privateKeyMatched: boolean | null;
};

export function getCertificateStatus(validFrom: Date, validTo: Date, now = new Date()): CertificateStatus {
  if (validFrom.getTime() > now.getTime()) return 'NOT_YET_VALID';
  if (validTo.getTime() <= now.getTime()) return 'EXPIRED';
  const expiringAt = now.getTime() + 30 * 24 * 60 * 60 * 1000;
  return validTo.getTime() <= expiringAt ? 'EXPIRING' : 'VALID';
}

function parseSans(subjectAltName?: string): string[] {
  if (!subjectAltName) return [];
  return subjectAltName
    .split(/,\s*(?=(?:DNS|IP Address|IP|URI|email):)/i)
    .map((entry) => entry.trim())
    .map((entry) => entry.replace(/^(?:DNS|IP Address|IP|URI|email):\s*/i, '').trim())
    .filter(Boolean);
}

function assertPem(value: string, label: string, beginLabel: string): string {
  const pem = value.trim();
  if (!pem.includes(`-----BEGIN ${beginLabel}-----`) || !pem.includes(`-----END ${beginLabel}-----`)) {
    throw new BadRequestException(`${label} 不是合法的 PEM 格式`);
  }
  return pem;
}

function assertMatchingPublicKey(certificate: X509Certificate, privateKeyPem: string): void {
  let privatePublicKey: Buffer;
  try {
    privatePublicKey = createPublicKey(privateKeyPem).export({ type: 'spki', format: 'der' }) as Buffer;
  } catch {
    throw new BadRequestException('私钥不是可用的未加密 PEM 私钥');
  }
  const certificatePublicKey = certificate.publicKey.export({ type: 'spki', format: 'der' }) as Buffer;
  if (!privatePublicKey.equals(certificatePublicKey)) {
    throw new BadRequestException('证书与私钥不匹配');
  }
}

function parseCertificatePem(certificatePem: string, privateKeyPem?: string): ParsedCertificate {
  const normalizedCertificatePem = assertPem(certificatePem, '证书', 'CERTIFICATE');
  let certificate: X509Certificate;
  try {
    certificate = new X509Certificate(normalizedCertificatePem);
  } catch {
    throw new BadRequestException('证书不是可解析的 X.509 PEM');
  }

  const sans = parseSans(certificate.subjectAltName);
  if (!sans.length) throw new BadRequestException('证书必须包含至少一个 SAN 域名或 IP');
  const validFrom = new Date(certificate.validFrom);
  const validTo = new Date(certificate.validTo);
  if (!Number.isFinite(validFrom.getTime()) || !Number.isFinite(validTo.getTime()) || validTo <= validFrom) {
    throw new BadRequestException('证书有效期无效');
  }

  let privateKeyMatched: boolean | null = null;
  if (privateKeyPem !== undefined) {
    const normalizedPrivateKeyPem = privateKeyPem.trim();
    if (!/-----BEGIN (?:PRIVATE KEY|RSA PRIVATE KEY|EC PRIVATE KEY|DSA PRIVATE KEY)-----/.test(normalizedPrivateKeyPem)) {
      throw new BadRequestException('私钥不是合法的 PEM 格式或为加密私钥');
    }
    assertMatchingPublicKey(certificate, normalizedPrivateKeyPem);
    privateKeyMatched = true;
  }

  return {
    certificatePem: normalizedCertificatePem,
    subject: certificate.subject,
    issuer: certificate.issuer,
    serialNumber: certificate.serialNumber,
    sans,
    validFrom,
    validTo,
    privateKeyMatched
  };
}

@Injectable()
export class CertificatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agentGateway: AgentService
  ) {}

  async list(query: QueryCertificateDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const search = query.search?.trim();
    const where: Prisma.CertificateWhereInput = search
      ? {
          OR: [
            { name: { contains: search } },
            { subject: { contains: search } },
            { issuer: { contains: search } },
            { sansJson: { contains: search } }
          ]
        }
      : {};
    const [total, certificates] = await Promise.all([
      this.prisma.certificate.count({ where }),
      this.prisma.certificate.findMany({
        where,
        include: certificateCount,
        orderBy: [{ validTo: 'asc' }, { updatedAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize
      })
    ]);
    return { data: certificates.map((certificate) => this.toView(certificate)), total, page, pageSize };
  }

  async detail(id: string) {
    const certificate = await this.prisma.certificate.findUnique({ where: { id }, include: certificateCount });
    if (!certificate) throw new NotFoundException('证书不存在');
    return { certificate: this.toView(certificate, true) };
  }

  parse(dto: ParseCertificateDto) {
    const parsed = parseCertificatePem(dto.certificatePem, dto.privateKeyPem);
    return this.toParsedView(parsed);
  }

  async create(dto: CreateCertificateDto) {
    const parsed = parseCertificatePem(dto.certificatePem, dto.privateKeyPem);
    const certificate = await this.prisma.certificate.create({
      data: {
        name: dto.name.trim(),
        certificatePem: parsed.certificatePem,
        privateKeyPem: dto.privateKeyPem.trim(),
        subject: parsed.subject,
        issuer: parsed.issuer,
        serialNumber: parsed.serialNumber,
        sansJson: JSON.stringify(parsed.sans),
        validFrom: parsed.validFrom,
        validTo: parsed.validTo
      }
    });
    return { certificate: this.toView(certificate) };
  }

  async update(id: string, dto: UpdateCertificateDto) {
    const current = await this.prisma.certificate.findUnique({ where: { id }, include: certificateCount });
    if (!current) throw new NotFoundException('证书不存在');
    const certificatePem = dto.certificatePem?.trim() ?? current.certificatePem;
    const privateKeyPem = dto.privateKeyPem?.trim() ?? current.privateKeyPem;
    const parsed = parseCertificatePem(certificatePem, privateKeyPem);
    const updated = await this.prisma.certificate.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        certificatePem: parsed.certificatePem,
        privateKeyPem,
        subject: parsed.subject,
        issuer: parsed.issuer,
        serialNumber: parsed.serialNumber,
        sansJson: JSON.stringify(parsed.sans),
        validFrom: parsed.validFrom,
        validTo: parsed.validTo
      },
      include: certificateCount
    });
    const lines = await this.prisma.line.findMany({
      where: { certificateId: id },
      select: { entryNodeId: true, landingNodeId: true }
    });
    const nodeIds = [...new Set(lines.flatMap((line) => [line.entryNodeId, line.landingNodeId].filter((id): id is string => Boolean(id))))];
    const syncResults = await Promise.all(nodeIds.map(async (nodeId) => ({ nodeId, synced: await this.agentGateway.pushConfig(nodeId) })));
    return {
      certificate: this.toView(updated),
      syncedNodeIds: syncResults.filter((result) => result.synced).map((result) => result.nodeId),
      affectedNodeIds: nodeIds
    };
  }

  async remove(id: string) {
    const certificate = await this.prisma.certificate.findUnique({ where: { id }, include: certificateCount });
    if (!certificate) throw new NotFoundException('证书不存在');
    if (certificate._count.lines > 0) throw new ConflictException('证书仍被线路引用，解除关联后才能删除');
    await this.prisma.certificate.delete({ where: { id } });
    return { deleted: true, id };
  }

  private toParsedView(parsed: ParsedCertificate) {
    return {
      subject: parsed.subject,
      issuer: parsed.issuer,
      serialNumber: parsed.serialNumber,
      sans: parsed.sans,
      validFrom: parsed.validFrom,
      validTo: parsed.validTo,
      status: getCertificateStatus(parsed.validFrom, parsed.validTo),
      daysUntilExpiry: Math.ceil((parsed.validTo.getTime() - Date.now()) / (24 * 60 * 60 * 1000)),
      privateKeyMatched: parsed.privateKeyMatched
    };
  }

  private toView(certificate: CertificateWithCount | Omit<CertificateWithCount, '_count'>, includePrivateKey = false) {
    const lineCount = '_count' in certificate ? certificate._count.lines : 0;
    const view = {
      id: certificate.id,
      name: certificate.name,
      subject: certificate.subject,
      issuer: certificate.issuer,
      serialNumber: certificate.serialNumber,
      sans: this.parseJsonArray(certificate.sansJson),
      validFrom: certificate.validFrom,
      validTo: certificate.validTo,
      status: getCertificateStatus(certificate.validFrom, certificate.validTo),
      daysUntilExpiry: Math.ceil((certificate.validTo.getTime() - Date.now()) / (24 * 60 * 60 * 1000)),
      lineCount,
      createdAt: certificate.createdAt,
      updatedAt: certificate.updatedAt
    };
    return includePrivateKey
      ? { ...view, certificatePem: certificate.certificatePem, privateKeyPem: certificate.privateKeyPem }
      : view;
  }

  private parseJsonArray(value: string): string[] {
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
    } catch {
      return [];
    }
  }
}
