import { BadRequestException, ConflictException, ForbiddenException, Injectable, Optional, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';
import { AgentService } from '../agent-gateway/agent.service';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../system/settings.service';
import { SubscriptionService } from '../subscription/subscription.service';
import { WalletService } from '../wallet/wallet.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private settingsService: SettingsService,
    private agentGateway: AgentService,
    @Optional() private subscriptionService?: SubscriptionService,
    @Optional() private walletService?: WalletService
  ) {}

  async login(dto: LoginDto): Promise<{ accessToken: string }> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('邮箱或密码错误');
    }
    if (!user.isActive) {
      throw new UnauthorizedException('账号已被禁用');
    }
    return { accessToken: await this.signToken(user) };
  }

  // 注册：受注册开关控制，新用户固定 USER 角色与默认配额，注册即登录
  async register(dto: RegisterDto): Promise<{ accessToken: string }> {
    const settings = await this.settingsService.getSettings();
    if (!settings.registrationEnabled) {
      throw new ForbiddenException('注册已关闭');
    }
    const passwordMinLength = settings.passwordMinLength ?? 8;
    if (dto.password.length < passwordMinLength) {
      throw new BadRequestException(`密码至少 ${passwordMinLength} 位`);
    }
    this.assertEmailDomainAllowed(dto.email, settings.emailDomainMode ?? 'none', settings.emailDomainList ?? []);
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('邮箱已被注册');
    }
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash: await bcrypt.hash(dto.password, 10),
        role: 'USER',
        trafficLimitBytes: BigInt(0),
        expireAt: null
      }
    });
    if (settings.defaultBalance > 0 && this.walletService) {
      await this.walletService.adjustBalance(user.id, settings.defaultBalance, 'SYSTEM_GIFT', '新用户注册赠金');
    }
    if (settings.defaultPlanId && this.subscriptionService) {
      await this.subscriptionService.subscribe(user.id, settings.defaultPlanId);
    } else {
      // 用户变动需向在线节点同步（协议约定见 docs/API_AND_PROTOCOLS.md §2.2）
      void this.agentGateway.pushConfigToAll();
    }
    return { accessToken: await this.signToken(user) };
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        balance: true,
        uuid: true,
        trafficLimitBytes: true,
        trafficUsedBytes: true,
        expireAt: true,
        subscriptionToken: true,
        isActive: true,
        createdAt: true
      }
    });
    if (!user) {
      throw new UnauthorizedException();
    }
    // BigInt 无法 JSON 序列化，在服务边界转 Number（流量值 < 2^53，无精度损失）
    return {
      ...user,
      balance: user.balance,
      uuid: user.uuid,
      trafficLimitBytes: Number(user.trafficLimitBytes),
      trafficUsedBytes: Number(user.trafficUsedBytes)
    };
  }

  private async signToken(user: { id: string; email: string; role: string }) {
    const settings = await this.settingsService.getSettings();
    const days = Number.isInteger(settings?.jwtSessionDays) && settings.jwtSessionDays > 0
      ? settings.jwtSessionDays
      : 1;
    return this.jwtService.sign(
      { sub: user.id, email: user.email, role: user.role },
      { expiresIn: `${days}d` }
    );
  }

  private assertEmailDomainAllowed(email: string, mode: 'none' | 'whitelist' | 'blacklist', domains: string[]) {
    if (mode === 'none') return;
    const domain = email.trim().toLowerCase().split('@').pop() ?? '';
    const normalized = new Set(domains.map((item) => item.trim().toLowerCase().replace(/^@+/, '')).filter(Boolean));
    const matched = normalized.has(domain);
    if (mode === 'whitelist' && !matched) throw new ForbiddenException('该邮箱域名不在允许注册范围内');
    if (mode === 'blacklist' && matched) throw new ForbiddenException('该邮箱域名已被禁止注册');
  }
}
