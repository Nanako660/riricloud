import { ConflictException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';
import { AgentGatewayService } from '../agent-gateway/agent-gateway.service';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../system/settings.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private settingsService: SettingsService,
    private agentGateway: AgentGatewayService
  ) {}

  async login(dto: LoginDto): Promise<{ accessToken: string }> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('邮箱或密码错误');
    }
    if (!user.isActive) {
      throw new UnauthorizedException('账号已被禁用');
    }
    const accessToken = this.jwtService.sign({ sub: user.id, email: user.email, role: user.role });
    return { accessToken };
  }

  // 注册：受注册开关控制，新用户固定 USER 角色与默认配额，注册即登录
  async register(dto: RegisterDto): Promise<{ accessToken: string }> {
    const settings = await this.settingsService.getSettings();
    if (!settings.registrationEnabled) {
      throw new ForbiddenException('注册已关闭');
    }
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('邮箱已被注册');
    }
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash: await bcrypt.hash(dto.password, 10),
        role: 'USER',
        trafficLimitBytes: BigInt(settings.defaultTrafficLimitBytes)
      }
    });
    // 用户变动需向在线节点同步（协议约定见 docs/API_AND_PROTOCOLS.md §2.2）
    void this.agentGateway.pushConfigToAll();
    const accessToken = this.jwtService.sign({ sub: user.id, email: user.email, role: user.role });
    return { accessToken };
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
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
      trafficLimitBytes: Number(user.trafficLimitBytes),
      trafficUsedBytes: Number(user.trafficUsedBytes)
    };
  }
}
