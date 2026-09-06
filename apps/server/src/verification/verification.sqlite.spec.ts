import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { SettingsService } from '../system/settings.service';
import { MailService } from '../mail/mail.service';
import { CaptchaService } from '../captcha/captcha.service';
import { VerificationService } from './verification.service';

describe('VerificationService SQLite security', () => {
  jest.setTimeout(60_000);

  let tempDir: string;
  let prisma: PrismaClient;
  let service: VerificationService;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-secret-for-verification-sqlite-0123456789';
    tempDir = await mkdtemp(join(tmpdir(), 'riricloud-verification-'));
    const databaseUrl = `file:${join(tempDir, 'verification.db').replaceAll('\\', '/')}`;
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await prisma.$connect();
    await prisma.$executeRawUnsafe(`
      CREATE TABLE "User" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "email" TEXT NOT NULL UNIQUE
      )
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE "VerificationCode" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "email" TEXT NOT NULL,
        "codeHash" TEXT NOT NULL,
        "action" TEXT NOT NULL,
        "attempts" INTEGER NOT NULL DEFAULT 0,
        "expiresAt" DATETIME NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await prisma.$executeRawUnsafe('CREATE INDEX "VerificationCode_email_action_createdAt_idx" ON "VerificationCode"("email", "action", "createdAt")');
    await prisma.$executeRawUnsafe('CREATE INDEX "VerificationCode_expiresAt_idx" ON "VerificationCode"("expiresAt")');

    const settings = { getSettings: jest.fn().mockResolvedValue({ emailVerificationEnabled: true, captchaMode: 'OFF' }) };
    const mail = { sendVerificationCode: jest.fn().mockResolvedValue({ messageId: 'sqlite-mail' }) };
    const captcha = { verifyCaptcha: jest.fn() };
    service = new VerificationService(prisma as never, settings as unknown as SettingsService, mail as unknown as MailService, captcha as unknown as CaptchaService);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
  });

  it('真实 SQLite 只保存验证码 hash，校验成功后一次性删除', async () => {
    const result = await service.sendCode({ email: 'User@Example.com', action: 'REGISTER' });
    expect(result.sent).toBe(true);
    const record = await prisma.verificationCode.findFirst({ where: { email: 'user@example.com', action: 'REGISTER' } });
    expect(record?.codeHash).toMatch(/^[a-f0-9]{64}$/);
    expect((record as unknown as { code?: string }).code).toBeUndefined();

    const mailMock = service as unknown as { mailService: { sendVerificationCode: jest.Mock } };
    const sentCode = mailMock.mailService.sendVerificationCode.mock.calls[0][1] as string;
    await expect(service.verifyCode('USER@EXAMPLE.COM', 'REGISTER', sentCode)).resolves.toEqual({ verified: true });
    expect(await prisma.verificationCode.count()).toBe(0);
  });

  it('真实 SQLite 并发校验同一个验证码最多允许一次成功', async () => {
    await service.sendCode({ email: 'concurrent@example.com', action: 'REGISTER' });
    const mailMock = service as unknown as { mailService: { sendVerificationCode: jest.Mock } };
    const sentCode = mailMock.mailService.sendVerificationCode.mock.calls.at(-1)?.[1] as string;

    const results = await Promise.allSettled([
      service.verifyCode('concurrent@example.com', 'REGISTER', sentCode),
      service.verifyCode('concurrent@example.com', 'REGISTER', sentCode)
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.verificationCode.count()).toBe(0);
  });
});
