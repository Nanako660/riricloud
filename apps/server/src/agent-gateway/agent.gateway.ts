import { Logger } from '@nestjs/common';
import { OnGatewayConnection, OnGatewayDisconnect, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import type { Server, WebSocket } from 'ws';
import { AgentService } from './agent.service';
import { AGENT_PROTOCOL_VERSION, parseAgentInboundMessage } from './agent-message';

const AGENT_MESSAGE_WINDOW_MS = 60_000;
const AGENT_MESSAGE_LIMIT = 120;
const AGENT_BYTE_LIMIT = 4 * 1024 * 1024;

type ConnectionQuota = { windowStartedAt: number; messages: number; bytes: number };

// Agent 长连接网关：只做连接管理与消息编解码，业务逻辑全部在 AgentService
// （分层约束见 docs/CODE_REVIEW.md §3.1 S3）
@WebSocketGateway({ path: '/ws/agent', perMessageDeflate: false, maxPayload: 256 * 1024 })
export class AgentGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(AgentGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(private readonly gatewayService: AgentService) {}

  async handleConnection(client: WebSocket, request: IncomingMessageLike) {
    const rawToken = request.headers?.['x-agent-token'];
    const token = Array.isArray(rawToken) ? rawToken[0] : rawToken;
    const auth = await this.gatewayService.authenticate(token);
    if (!auth.ok) {
      this.logger.warn(`agent auth failed: ${auth.message}`);
      client.send(JSON.stringify({ type: 'auth_result', data: { success: false, message: auth.message, nodeId: null, protocolVersion: AGENT_PROTOCOL_VERSION } }));
      client.close(4001, 'authentication failed');
      return;
    }
    const authResult = await this.gatewayService.register(auth.nodeId, client);
    this.registry.set(client, auth.nodeId);
    this.quotas.set(client, { windowStartedAt: Date.now(), messages: 0, bytes: 0 });
    client.on('message', (raw) => {
      const rawText = raw.toString();
      if (!this.consumeQuota(client, Buffer.byteLength(rawText, 'utf8'))) {
        this.logger.warn(`agent message quota exceeded: node=${auth.nodeId}`);
        client.close(1008, 'message quota exceeded');
        return;
      }
      void this.handleMessage(client, rawText).catch((err) => {
        this.logger.error(`agent message handling failed: ${err}`);
      });
    });
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
    this.quotas.delete(client);
    if (nodeId) {
      await this.gatewayService.unregister(nodeId, client);
    }
  }

  // client → nodeId 反查注册表（ws adapter 的 disconnect 不携带 request）
  private readonly registry = new Map<WebSocket, string>();
  private readonly quotas = new Map<WebSocket, ConnectionQuota>();

  private consumeQuota(client: WebSocket, bytes: number): boolean {
    if (bytes > 256 * 1024) return false;
    const now = Date.now();
    const quota = this.quotas.get(client);
    if (!quota) return false;
    if (now - quota.windowStartedAt >= AGENT_MESSAGE_WINDOW_MS) {
      quota.windowStartedAt = now;
      quota.messages = 0;
      quota.bytes = 0;
    }
    if (quota.messages >= AGENT_MESSAGE_LIMIT || quota.bytes + bytes > AGENT_BYTE_LIMIT) return false;
    quota.messages += 1;
    quota.bytes += bytes;
    return true;
  }

  async handleMessage(client: WebSocket, raw: string) {
    const message = parseAgentInboundMessage(raw);
    if (!message) {
      this.logger.warn('agent message: invalid or unsupported payload');
      return;
    }
    const nodeId = this.registry.get(client);
    if (!nodeId) {
      return;
    }
    if (!this.gatewayService.isCurrentSocket(nodeId, client)) {
      return;
    }
    switch (message.type) {
      case 'heartbeat': {
        await this.gatewayService.handleHeartbeat(nodeId, message.data);
        break;
      }
      case 'config_apply_result': {
        await this.gatewayService.handleConfigApplyResult(nodeId, message.data);
        break;
      }
      case 'upgrade_result': {
        await this.gatewayService.handleUpgradeResult(nodeId, message.data);
        break;
      }
      case 'probe_result': {
        await this.gatewayService.handleProbeResult(nodeId, message.data);
        break;
      }
      case 'restart_agent_result': {
        await this.gatewayService.handleRestartResult(nodeId, message.data);
        break;
      }
      case 'log_report': {
        this.gatewayService.handleLogReport(nodeId, message.data);
        break;
      }
    }
  }
}

// Express IncomingMessage 的最小结构（避免依赖 @types/express 细节）
interface IncomingMessageLike {
  url?: string;
  headers?: Record<string, string | string[] | undefined>;
}
