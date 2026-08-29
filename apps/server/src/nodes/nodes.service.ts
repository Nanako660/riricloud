import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { generateKeyPairSync } from 'node:crypto';
import { AgentGatewayService } from '../agent-gateway/agent-gateway.service';
import { PrismaService } from '../prisma/prisma.service';
import { generateAgentToken } from '../common/utils';
import { CreateNodeDto } from './dto/create-node.dto';
import { UpdateNodeDto } from './dto/update-node.dto';

@Injectable()
export class NodesService {
  constructor(
    private prisma: PrismaService,
    private agentGateway: AgentGatewayService
  ) {}

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
    const pushed = await this.agentGateway.pushConfig(id);
    return { requested: pushed, nodeId: id };
  }

  async update(id: string, dto: UpdateNodeDto) {
    const node = await this.prisma.node.findUnique({ where: { id } });
    if (!node) {
      throw new NotFoundException('节点不存在');
    }
    const data: { name?: string; serverHost?: string; serverPort?: number; isPublic?: boolean } = {};
    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) {
        throw new BadRequestException('节点名称不能为空');
      }
      data.name = name;
    }
    if (dto.serverHost !== undefined) {
      const serverHost = dto.serverHost.trim();
      if (!serverHost) {
        throw new BadRequestException('服务器地址不能为空');
      }
      data.serverHost = serverHost;
    }
    if (dto.serverPort !== undefined) {
      data.serverPort = dto.serverPort;
    }
    if (dto.isPublic !== undefined) {
      data.isPublic = dto.isPublic;
    }
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('未提供任何更新字段');
    }
    const updated = await this.prisma.node.update({ where: { id }, data });
    // 端口变更影响 Agent 入站监听，主机/端口变更影响订阅输出：在线时热推送最新配置
    void this.agentGateway.pushConfig(id);
    return { node: this.sanitize(updated) };
  }

  async remove(id: string) {
    const node = await this.prisma.node.findUnique({ where: { id } });
    if (!node) {
      throw new NotFoundException('节点不存在');
    }
    // 先断开在线 Agent 再删库；TrafficLog 由外键 onDelete: Cascade 一并删除
    this.agentGateway.disconnectNode(id);
    await this.prisma.node.delete({ where: { id } });
    return { deleted: true, id };
  }

  // X25519 Reality 密钥对（短 ID 与 SNI 采用演示默认值，生产可由 UI 配置）
  private generateRealityConfig() {
    const { publicKey, privateKey } = generateKeyPairSync('x25519');
    // sing-box 内核与客户端均要求 32 字节裸密钥的 base64url（无填充、URL 安全字母表，
    // 等价 sing-box generate reality-keypair 输出）；PEM、标准 base64（含 "+"/"/" 与填充）
    // 都会导致内核 inbound 解析失败
    const pubDer = publicKey.export({ type: 'spki', format: 'der' }) as Buffer;
    const privDer = privateKey.export({ type: 'pkcs8', format: 'der' }) as Buffer;
    const b64 = (der: Buffer) => der.subarray(der.length - 32).toString('base64url');
    return {
      serverNames: ['www.apple.com'],
      dest: 'www.apple.com:443',
      privateKey: b64(privDer),
      publicKey: b64(pubDer),
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
