import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { generateKeyPairSync } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { generateAgentToken } from '../common/utils';
import { CreateNodeDto } from './dto/create-node.dto';

@Injectable()
export class NodesService {
  constructor(private prisma: PrismaService) {}

  // 管理端列表（含 agentToken 与遥测）
  list() {
    return this.prisma.node.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }]
    });
  }

  async create(dto: CreateNodeDto, _operatorId: string) {
    const protocol = dto.protocol ?? 'VLESS_REALITY';
    if (protocol !== 'VLESS_REALITY') {
      throw new BadRequestException('当前版本仅支持 VLESS_REALITY 协议');
    }
    const configPayload = this.generateRealityConfig();
    const node = await this.prisma.node.create({
      data: {
        name: dto.name?.trim() || `节点 ${dto.serverHost}`,
        serverHost: dto.serverHost,
        serverPort: dto.serverPort,
        protocol,
        configPayload: JSON.stringify(configPayload),
        agentToken: generateAgentToken(),
        isPublic: dto.isPublic ?? true
      }
    });
    return {
      node: this.sanitize(node),
      agentToken: node.agentToken,
      installCommand: this.buildInstallCommand(node.agentToken)
    };
  }

  async requestReload(id: string) {
    const node = await this.prisma.node.findUnique({ where: { id } });
    if (!node) {
      throw new NotFoundException('节点不存在');
    }
    // 触发配置重推由 AgentGateway 模块监听完成（本方法返回待推送标记）
    return { requested: true, nodeId: id };
  }

  // X25519 Reality 密钥对（短 ID 与 SNI 采用演示默认值，生产可由 UI 配置）
  private generateRealityConfig() {
    const { publicKey, privateKey } = generateKeyPairSync('x25519');
    return {
      serverNames: ['www.apple.com'],
      dest: 'www.apple.com:443',
      privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }),
      publicKey: publicKey.export({ type: 'spki', format: 'pem' }),
      shortIds: ['0123456789abcdef']
    };
  }

  private buildInstallCommand(token: string) {
    return `curl -fsSL https://<master-domain>/api/v1/install.sh | bash -s -- --token=${token} --master=wss://<master-domain>/ws/agent`;
  }

  // 列表/详情输出时移除私钥等敏感配置，仅保留公钥
  private sanitize(node: { configPayload: string | null } & Record<string, unknown>) {
    const { configPayload, ...rest } = node;
    let parsed: Record<string, unknown> | null = null;
    if (configPayload) {
      parsed = JSON.parse(configPayload) as Record<string, unknown>;
      delete parsed.privateKey;
    }
    return { ...rest, config: parsed };
  }
}
