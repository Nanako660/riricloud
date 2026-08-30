import { AgentGateway } from './agent.gateway';
import { AgentGatewayService } from './agent-gateway.service';

describe('AgentGateway', () => {
  const gatewayService = {
    handleHeartbeat: jest.fn(),
    handleConfigApplyResult: jest.fn(),
    handleUpgradeResult: jest.fn(),
    handleProbeResult: jest.fn()
  };
  const client = {} as Parameters<AgentGateway['handleMessage']>[0];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function createGateway() {
    const gateway = new AgentGateway(gatewayService as unknown as AgentGatewayService);
    (gateway as unknown as { registry: Map<unknown, string> }).registry.set(client, 'node-1');
    return gateway;
  }

  it('只向业务服务转发通过运行时校验的心跳', async () => {
    const gateway = createGateway();
    await gateway.handleMessage(
      client,
      JSON.stringify({
        type: 'heartbeat',
        data: { cpuUsage: 12.5, memoryUsage: 20, bandwidthRate: 1024, trafficRecords: [] }
      })
    );
    expect(gatewayService.handleHeartbeat).toHaveBeenCalledWith('node-1', {
      cpuUsage: 12.5,
      memoryUsage: 20,
      bandwidthRate: 1024,
      trafficRecords: []
    });
  });

  it.each([
    ['invalid JSON', '{'],
    ['missing data', JSON.stringify({ type: 'heartbeat' })],
    ['invalid CPU', JSON.stringify({ type: 'heartbeat', data: { cpuUsage: '12', memoryUsage: 20, bandwidthRate: 1, trafficRecords: [] } })],
    ['unknown type', JSON.stringify({ type: 'heartbeat-malicious', data: {} })],
    ['invalid probe result', JSON.stringify({ type: 'probe_result', data: { taskId: 't1', success: true, results: [{ type: 'shell', target: 'x', success: true }] } })]
  ])('拒绝 %s 消息且不调用业务服务', async (_name, raw) => {
    const gateway = createGateway();
    await gateway.handleMessage(client, raw);
    expect(gatewayService.handleHeartbeat).not.toHaveBeenCalled();
    expect(gatewayService.handleConfigApplyResult).not.toHaveBeenCalled();
    expect(gatewayService.handleUpgradeResult).not.toHaveBeenCalled();
    expect(gatewayService.handleProbeResult).not.toHaveBeenCalled();
  });

  it('按消息类型转发升级与探针回执', async () => {
    const gateway = createGateway();
    await gateway.handleMessage(
      client,
      JSON.stringify({
        type: 'upgrade_result',
        data: { taskId: 'task-1', target: 'singbox', version: '1.11.0', success: true, message: 'ok' }
      })
    );
    await gateway.handleMessage(
      client,
      JSON.stringify({
        type: 'probe_result',
        data: {
          taskId: 'task-2',
          success: true,
          results: [{ type: 'dns', target: 'localhost', success: true, latencyMs: 1 }]
        }
      })
    );
    expect(gatewayService.handleUpgradeResult).toHaveBeenCalledWith('node-1', expect.objectContaining({ taskId: 'task-1' }));
    expect(gatewayService.handleProbeResult).toHaveBeenCalledWith('node-1', expect.objectContaining({ taskId: 'task-2' }));
  });
});
