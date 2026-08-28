import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { isUserEntitled } from '../common/utils';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

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
