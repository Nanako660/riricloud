import { Logger } from '@nestjs/common';
import { OnGatewayConnection, OnGatewayDisconnect, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import type { Server, WebSocket } from 'ws';
import { AgentGatewayService } from './agent-gateway.service';
import type { AgentMessage, ConfigApplyResultData, HeartbeatData } from './agent-message';

// Agent 长连接网关：只做连接管理与消息编解码，业务逻辑全部在 AgentGatewayService
// （分层约束见 docs/CODE_REVIEW.md §3.1 S3）
@WebSocketGateway({ path: '/ws/agent', perMessageDeflate: false })
export class AgentGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(AgentGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(private readonly gatewayService: AgentGatewayService) {}

  async handleConnection(client: WebSocket, request: IncomingMessageLike) {
    const token = new URL(request.url ?? '', 'http://localhost').searchParams.get('token') ?? undefined;
    const auth = await this.gatewayService.authenticate(token);
    if (!auth.ok) {
      this.logger.warn(`agent auth failed: ${auth.message}`);
      client.send(JSON.stringify({ type: 'auth_result', data: { success: false, message: auth.message, nodeId: null } }));
      client.close(4001, 'authentication failed');
      return;
    }
    const authResult = await this.gatewayService.register(auth.nodeId, client);
    this.registry.set(client, auth.nodeId);
    client.on('message', (raw) => void this.handleMessage(client, raw.toString()));
    client.on('close', () => void this.handleDisconnect(client));
    client.send(JSON.stringify({ type: 'auth_result', data: authResult }));
    // 鉴权成功即推送全量配置（协议时序见 docs/ARCHITECTURE.md §3.1）
    try {
      await this.gatewayService.pushConfig(auth.nodeId);
    } catch (err) {
      this.logger.error(`failed to push initial config to node=${auth.nodeId}: ${err}`);
    }
  }

  async handleDisconnect(client: WebSocket) {
    const nodeId = this.registry.get(client);
    this.registry.delete(client);
    if (nodeId) {
      await this.gatewayService.unregister(nodeId);
    }
  }

  // client → nodeId 反查注册表（ws adapter 的 disconnect 不携带 request）
  private readonly registry = new Map<WebSocket, string>();

  async handleMessage(client: WebSocket, raw: string) {
    let message: AgentMessage;
    try {
      message = JSON.parse(raw) as AgentMessage;
    } catch {
      this.logger.warn('agent message: invalid JSON');
      return;
    }
    const nodeId = this.registry.get(client);
    if (!nodeId) {
      return;
    }
    switch (message.type) {
      case 'heartbeat': {
        await this.gatewayService.handleHeartbeat(nodeId, message.data as HeartbeatData);
        break;
      }
      case 'config_apply_result': {
        await this.gatewayService.handleConfigApplyResult(nodeId, message.data as ConfigApplyResultData);
        break;
      }
      default:
        this.logger.warn(`agent message: unknown type=${message.type}`);
    }
  }
}

// Express IncomingMessage 的最小结构（避免依赖 @types/express 细节）
interface IncomingMessageLike {
  url?: string;
}
