import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AgentGatewayService } from '../agent-gateway/agent-gateway.service';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../system/settings.service';
import { isUserEntitled } from '../common/utils';
import { CreateUserDto } from './dto/create-user.dto';
import { ListUsersQueryDto } from './dto/list-users.query.dto';
import { UpdateUserDto } from './dto/update-user.dto';

// 管理端用户视图字段（不含 passwordHash / uuid 等敏感字段）
const ADMIN_USER_SELECT = {
  id: true,
  email: true,
  role: true,
  trafficLimitBytes: true,
  trafficUsedBytes: true,
  expireAt: true,
  isActive: true,
  createdAt: true
} as const;

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private settingsService: SettingsService,
    private agentGateway: AgentGatewayService
  ) {}

  // 重置订阅令牌：旧链接立即失效，返回新 token
  async resetSubscriptionToken(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException();
    }
    const subscriptionToken = crypto.randomUUID();
    await this.prisma.user.update({ where: { id: userId }, data: { subscriptionToken } });
    return subscriptionToken;
  }

  // ---------- 管理员接口 ----------

  // 分页列表：search 邮箱模糊、role/isActive 过滤
  async listUsers(query: ListUsersQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where = {
      ...(query.search ? { email: { contains: query.search } } : {}),
      ...(query.role ? { role: query.role } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {})
    };
    const [users, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: ADMIN_USER_SELECT,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize
      }),
      this.prisma.user.count({ where })
    ]);
    // BigInt 在服务边界转 Number（< 2^53 无精度损失）
    const data = users.map((u) => ({
      ...u,
      trafficLimitBytes: Number(u.trafficLimitBytes),
      trafficUsedBytes: Number(u.trafficUsedBytes)
    }));
    return { data, total, page, pageSize };
  }

  async createUser(dto: CreateUserDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('邮箱已存在');
    }
    const defaultQuota = await this.settingsService.getDefaultQuota();
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash: await bcrypt.hash(dto.password, 10),
        role: dto.role ?? 'USER',
        trafficLimitBytes: BigInt(dto.trafficLimitBytes ?? defaultQuota),
        expireAt: dto.expireAt ? new Date(dto.expireAt) : null
      },
      select: ADMIN_USER_SELECT
    });
    void this.agentGateway.pushConfigToAll();
    return { ...user, trafficLimitBytes: Number(user.trafficLimitBytes), trafficUsedBytes: Number(user.trafficUsedBytes) };
  }

  async updateUser(id: string, dto: UpdateUserDto, operatorId: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('用户不存在');
    }
    // 防锁死：管理员不能修改自己的角色
    if (dto.role !== undefined && id === operatorId && dto.role !== user.role) {
      throw new ForbiddenException('不能修改自己的角色');
    }
    const data: Record<string, unknown> = {};
    if (dto.role !== undefined) data.role = dto.role;
    if (dto.trafficLimitBytes !== undefined) data.trafficLimitBytes = BigInt(dto.trafficLimitBytes);
    if (dto.expireAt !== undefined) data.expireAt = dto.expireAt ? new Date(dto.expireAt) : null;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.password !== undefined) {
      if (dto.password.length < 8) {
        throw new BadRequestException('密码至少 8 位');
      }
      data.passwordHash = await bcrypt.hash(dto.password, 10);
    }
    const updated = await this.prisma.user.update({ where: { id }, data, select: ADMIN_USER_SELECT });
    // 配额/到期/激活/角色变化影响订阅资格，向在线节点同步用户名单
    void this.agentGateway.pushConfigToAll();
    return { ...updated, trafficLimitBytes: Number(updated.trafficLimitBytes), trafficUsedBytes: Number(updated.trafficUsedBytes) };
  }

  async deleteUser(id: string, operatorId: string) {
    if (id === operatorId) {
      throw new ForbiddenException('不能删除自己');
    }
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('用户不存在');
    }
    // TrafficLog 经 schema onDelete: Cascade 级联删除
    await this.prisma.user.delete({ where: { id } });
    void this.agentGateway.pushConfigToAll();
    return { deleted: true, id };
  }

  async getDashboard(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException();
    }
    const onlineCount = await this.prisma.node.count({ where: { status: 'ONLINE', isPublic: true } });
    return {
      // BigInt 无法 JSON 序列化，在服务边界转 Number（流量值 < 2^53，无精度损失）
      trafficLimitBytes: Number(user.trafficLimitBytes),
      trafficUsedBytes: Number(user.trafficUsedBytes),
      expireAt: user.expireAt,
      subscriptionToken: user.subscriptionToken,
      onlineNodeCount: onlineCount
    };
  }

  // 公开节点列表（用户可见视图，不含 agentToken 等敏感字段）
  async getAvailableNodes(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException();
    }
    const nodes = await this.prisma.node.findMany({
      where: { isPublic: true, status: { not: 'DISABLED' } },
      select: {
        id: true,
        name: true,
        serverHost: true,
        serverPort: true,
        protocol: true,
        status: true,
        cpuUsage: true,
        memoryUsage: true,
        bandwidthRate: true,
        lastSeenAt: true,
        sortOrder: true
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }]
    });
    return { entitled: isUserEntitled(user), nodes };
  }
}
