import { BadRequestException, ConflictException, HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { CaptchaService } from '../captcha/captcha.service';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../system/settings.service';
import { MailService } from '../mail/mail.service';
import { SendCodeDto, VerificationAction } from './dto/send-code.dto';

const CODE_TTL_MS = 5 * 60 * 1000;
const CODE_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

type VerificationCodeRow = { id: string; code: string; attempts: number; expiresAt: Date };
type VerificationStore = {
  findFirst: (args: Record<string, unknown>) => Promise<VerificationCodeRow | null>;
  create: (args: Record<string, unknown>) => Promise<VerificationCodeRow>;
  update: (args: Record<string, unknown>) => Promise<VerificationCodeRow>;
  delete: (args: Record<string, unknown>) => Promise<VerificationCodeRow>;
  deleteMany: (args: Record<string, unknown>) => Promise<unknown>;
};

@Injectable()
export class VerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
    private readonly mailService: MailService,
    private readonly captchaService: CaptchaService
  ) {}

  async sendCode(dto: SendCodeDto, userId?: string, remoteIp?: string) {
    const email = dto.email.trim().toLowerCase();
    const settings = await this.settingsService.getSettings();
    if (dto.action === 'REGISTER') {
      if (!settings.emailVerificationEnabled) throw new BadRequestException('注册邮箱验证未启用');
      const existing = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
      if (existing) throw new ConflictException('邮箱已被注册');
      if (settings.captchaMode !== 'OFF') {
        await this.captchaService.verifyCaptcha({ ...dto, remoteIp });
      }
    } else if (dto.action === 'CHANGE_EMAIL') {
      if (!userId) throw new UnauthorizedException('请先登录后换绑邮箱');
      const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
      if (!user) throw new UnauthorizedException();
      const existing = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
      if (existing && existing.id !== userId) throw new ConflictException('新邮箱已被其他账号使用');
    } else if (dto.action === 'VERIFY_CURRENT_EMAIL') {
      if (!userId) throw new UnauthorizedException('请先登录后验证邮箱');
      const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true } });
      if (!user) throw new UnauthorizedException();
      if (user.email.toLowerCase() !== email) throw new BadRequestException('只能验证当前登录账号绑定的邮箱');
    } else if (dto.action === 'RESET_PASSWORD') {
      const user = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
      if (!user) throw new BadRequestException('该邮箱尚未注册');
      if (settings.captchaMode !== 'OFF') {
        await this.captchaService.verifyCaptcha({ ...dto, remoteIp });
      }
    }

    const store = this.store(this.client(this.prisma));
    const now = new Date();
    await store.deleteMany({ where: { expiresAt: { lt: now } } });
    const recent = await store.findFirst({
      where: { email, action: dto.action, createdAt: { gte: new Date(now.getTime() - CODE_COOLDOWN_MS) } },
      orderBy: { createdAt: 'desc' }
    });
    if (recent) throw new HttpException('验证码发送过于频繁，请 60 秒后再试', HttpStatus.TOO_MANY_REQUESTS);

    const code = randomInt(100000, 1000000).toString();
    const record = await store.create({
      data: { email, code, action: dto.action, attempts: 0, expiresAt: new Date(now.getTime() + CODE_TTL_MS) }
    });
    try {
      const result = await this.mailService.sendVerificationCode(email, code, dto.action);
      return { sent: true, expiresAt: record.expiresAt, cooldownSeconds: 60, messageId: result.messageId };
    } catch (error) {
      await store.delete({ where: { id: record.id } });
      throw error;
    }
  }

  async verifyCode(email: string, action: VerificationAction, code: string, client: VerificationClient = this.client(this.prisma)) {
    const store = this.store(client);
    const normalizedEmail = email.trim().toLowerCase();
    const record = await store.findFirst({ where: { email: normalizedEmail, action }, orderBy: { createdAt: 'desc' } });
    if (!record || record.expiresAt.getTime() <= Date.now()) throw new BadRequestException('验证码不存在或已过期');
    if (record.attempts >= MAX_ATTEMPTS) throw new BadRequestException('验证码错误次数过多，请重新获取');
    if (record.code !== code.trim()) {
      const nextAttempts = record.attempts + 1;
      const rootStore = this.store(this.client(this.prisma));
      await rootStore.update({ where: { id: record.id }, data: { attempts: nextAttempts } });
      if (nextAttempts >= MAX_ATTEMPTS) throw new BadRequestException('验证码错误次数过多，请重新获取');
      throw new BadRequestException('验证码错误');
    }
    await store.delete({ where: { id: record.id } });
    return { verified: true };
  }

  private client(client: PrismaService): VerificationClient {
    return client as unknown as VerificationClient;
  }

  private store(client: VerificationClient): VerificationStore {
    return client.verificationCode;
  }
}

type VerificationClient = { verificationCode: VerificationStore };
