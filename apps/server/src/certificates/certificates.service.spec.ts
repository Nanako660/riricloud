import { Test } from '@nestjs/testing';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { generateKeyPairSync, createSign } from 'node:crypto';
import { AgentService } from '../agent-gateway/agent.service';
import { CertificatesService } from './certificates.service';
import { PrismaService } from '../prisma/prisma.service';

function der(tag: number, value: Buffer) {
  const length = value.length;
  if (length < 128) return Buffer.concat([Buffer.from([tag, length]), value]);
  const bytes: number[] = [];
  let remaining = length;
  while (remaining > 0) {
    bytes.unshift(remaining & 0xff);
    remaining >>= 8;
  }
  const lengthBytes = Buffer.from([0x80 | bytes.length, ...bytes]);
  return Buffer.concat([Buffer.from([tag]), lengthBytes, value]);
}

function derSequence(...values: Buffer[]) {
  return der(0x30, Buffer.concat(values));
}

function derInteger(value: number) {
  return der(0x02, Buffer.from([value]));
}

function derOid(value: number[]) {
  return der(0x06, Buffer.from(value));
}

function derName(commonName: string) {
  return derSequence(der(0x31, derSequence(derOid([0x55, 0x04, 0x03]), der(0x0c, Buffer.from(commonName)))));
}

function derUtcTime(date: Date) {
  const value = date.toISOString().slice(2, 19).replace(/[-:T]/g, '') + 'Z';
  return der(0x17, Buffer.from(value));
}

function generateCertificate(commonName: string) {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const signatureAlgorithm = derSequence(derOid([0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x0b]), der(0x05, Buffer.alloc(0)));
  const subjectAlternativeNames = derSequence(
    der(0x82, Buffer.from(commonName)),
    der(0x82, Buffer.from(`www.${commonName}`))
  );
  const extensions = der(0xa3, derSequence(
    derSequence(
      derOid([0x55, 0x1d, 0x11]),
      der(0x04, subjectAlternativeNames)
    )
  ));
  const now = new Date();
  const validTo = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const tbsCertificate = derSequence(
    der(0xa0, derInteger(2)),
    derInteger(1),
    signatureAlgorithm,
    derName(commonName),
    derSequence(derUtcTime(now), derUtcTime(validTo)),
    derName(commonName),
    publicKey.export({ type: 'spki', format: 'der' }) as Buffer,
    extensions
  );
  const signer = createSign('RSA-SHA256');
  signer.update(tbsCertificate);
  signer.end();
  const certificateDer = derSequence(
    tbsCertificate,
    signatureAlgorithm,
    der(0x03, Buffer.concat([Buffer.from([0]), signer.sign(privateKey)]))
  );
  return {
    certificatePem: `-----BEGIN CERTIFICATE-----\n${certificateDer.toString('base64').match(/.{1,64}/g)!.join('\n')}\n-----END CERTIFICATE-----`,
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
  };
}

describe('CertificatesService', () => {
  let service: CertificatesService;
  let generated: ReturnType<typeof generateCertificate>;
  let mismatch: ReturnType<typeof generateCertificate>;

  const prisma = {
    certificate: {
      count: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn()
    },
    line: { findMany: jest.fn() }
  };
  const agentGateway = { pushConfig: jest.fn() };

  beforeAll(async () => {
    generated = generateCertificate('example.com');
    mismatch = generateCertificate('other.example.com');
    const moduleRef = await Test.createTestingModule({
      providers: [
        CertificatesService,
        { provide: PrismaService, useValue: prisma },
        { provide: AgentService, useValue: agentGateway }
      ]
    }).compile();
    service = moduleRef.get(CertificatesService);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.certificate.count.mockResolvedValue(0);
    prisma.certificate.findMany.mockResolvedValue([]);
    prisma.certificate.findUnique.mockResolvedValue(null);
    prisma.certificate.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'certificate-1', ...data, createdAt: new Date(), updatedAt: new Date()
    }));
    prisma.certificate.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'certificate-1', ...data, createdAt: new Date(), updatedAt: new Date(), _count: { lines: 1 }
    }));
    prisma.line.findMany.mockResolvedValue([]);
    agentGateway.pushConfig.mockResolvedValue(true);
  });

  it('解析 X.509 证书并提取 SAN、签发者和有效期', () => {
    const parsed = service.parse({ certificatePem: generated.certificatePem });
    expect(parsed.issuer).toContain('CN=example.com');
    expect(parsed.sans).toEqual(['example.com', 'www.example.com']);
    expect(parsed.validTo).toBeInstanceOf(Date);
    expect(parsed.privateKeyMatched).toBeNull();
  });

  it('校验公私钥匹配性并拒绝错误私钥', () => {
    expect(service.parse({ certificatePem: generated.certificatePem, privateKeyPem: generated.privateKeyPem }).privateKeyMatched).toBe(true);
    expect(() => service.parse({ certificatePem: generated.certificatePem, privateKeyPem: mismatch.privateKeyPem })).toThrow(BadRequestException);
  });

  it('创建证书时保存解析后的元数据且不把密钥放入列表视图', async () => {
    const result = await service.create({ name: '生产证书', certificatePem: generated.certificatePem, privateKeyPem: generated.privateKeyPem });
    expect(prisma.certificate.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ name: '生产证书', sansJson: JSON.stringify(['example.com', 'www.example.com']) })
    }));
    expect(result.certificate).not.toHaveProperty('privateKeyPem');
  });

  it('删除仍被线路引用的证书时拦截', async () => {
    prisma.certificate.findUnique.mockResolvedValue({
      id: 'certificate-1', name: '生产证书', certificatePem: generated.certificatePem, privateKeyPem: generated.privateKeyPem,
      subject: 'CN=example.com', issuer: 'CN=example.com', serialNumber: '01', sansJson: '["example.com"]',
      validFrom: new Date(Date.now() - 1_000), validTo: new Date(Date.now() + 86_400_000), createdAt: new Date(), updatedAt: new Date(),
      _count: { lines: 1 }
    });
    await expect(service.remove('certificate-1')).rejects.toThrow(ConflictException);
    expect(prisma.certificate.delete).not.toHaveBeenCalled();
  });

  it('更新证书后向关联线路的入口和出口节点推送配置', async () => {
    const current = {
      id: 'certificate-1', name: '旧证书', certificatePem: generated.certificatePem, privateKeyPem: generated.privateKeyPem,
      subject: 'CN=example.com', issuer: 'CN=example.com', serialNumber: '01', sansJson: '["example.com"]',
      validFrom: new Date(Date.now() - 1_000), validTo: new Date(Date.now() + 86_400_000), createdAt: new Date(), updatedAt: new Date(),
      _count: { lines: 1 }
    };
    prisma.certificate.findUnique.mockResolvedValue(current);
    prisma.certificate.update.mockResolvedValue({ ...current, name: '新证书' });
    prisma.line.findMany.mockResolvedValue([{ entryNodeId: 'node-entry', landingNodeId: 'node-landing' }]);

    const result = await service.update('certificate-1', { name: '新证书' });
    expect(agentGateway.pushConfig).toHaveBeenCalledWith('node-entry');
    expect(agentGateway.pushConfig).toHaveBeenCalledWith('node-landing');
    expect(result.affectedNodeIds).toEqual(['node-entry', 'node-landing']);
  });
});
