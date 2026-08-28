import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService
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
