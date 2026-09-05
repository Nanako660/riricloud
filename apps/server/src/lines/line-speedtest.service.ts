import { Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as net from 'node:net';
import * as fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../system/settings.service';
import { sanitizeInboundParams } from '../common/inbound';
import { type ProtocolType } from '../common/constants';
import { buildSingboxOutbound, type SubEntry, type SubLine, type SubUser } from '../subscription/builders';

export interface SpeedTestExecutionResult {
  lineId: string;
  lineName: string;
  latencyMs: number | null;
  status: 'SUCCESS' | 'TIMEOUT' | 'ERROR';
  message: string;
  testedAt: Date;
  mode: 'END_TO_END' | 'TCP_HANDSHAKE';
}

@Injectable()
export class LineSpeedtestService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LineSpeedtestService.name);
  private schedulerTimer?: NodeJS.Timeout;
  private lastAutoSpeedtestAt = Date.now();
  private isBatchTesting = false;
  private singboxBinaryChecked = false;
  private cachedSingboxPath: string | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService
  ) {}

  onModuleInit() {
    this.startScheduler();
  }

  onModuleDestroy() {
    if (this.schedulerTimer) {
      clearInterval(this.schedulerTimer);
      this.schedulerTimer = undefined;
    }
  }

  /**
   * 启动后台定时测速调度器（每 30 秒自省一次设置与运行间隔）
   */
  private startScheduler() {
    this.schedulerTimer = setInterval(() => {
      void this.checkScheduledSpeedtest();
    }, 30_000);
    this.schedulerTimer.unref?.();
  }

  private async checkScheduledSpeedtest(): Promise<void> {
    try {
      const settings = await this.settingsService.getSettings();
      if (!settings.lineSpeedtestEnabled) return;

      const intervalMs = Math.max(1, settings.lineSpeedtestIntervalMins) * 60 * 1000;
      if (Date.now() - this.lastAutoSpeedtestAt >= intervalMs) {
        this.logger.log('触发后台定时线路测速任务...');
        await this.testAllActiveLines();
      }
    } catch (err) {
      this.logger.warn(`定时测速调度检查失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * 测试单条线路
   */
  async testLine(lineId: string): Promise<SpeedTestExecutionResult> {
    const line = await this.prisma.line.findUnique({
      where: { id: lineId },
      include: { entryNode: true, landingNode: true, targetLine: { include: { entryNode: true, landingNode: true } } }
    });

    if (!line) {
      throw new NotFoundException(`线路 ${lineId} 不存在`);
    }

    const settings = await this.settingsService.getSettings();
    const targetUrl = settings.lineSpeedtestTargetUrl || 'http://cp.cloudflare.com/generate_204';
    const timeoutMs = Math.min(Math.max(settings.lineSpeedtestTimeoutMs || 3000, 500), 30000);

    const serverHost = (line.endpointOverrideEnabled && line.serverHost ? line.serverHost : line.entryNode.serverHost).trim();
    const serverPort = line.endpointOverrideEnabled && line.serverPort ? line.serverPort : line.entryPort;

    let latencyMs: number | null = null;
    let status: 'SUCCESS' | 'TIMEOUT' | 'ERROR' = 'ERROR';
    let message = '';
    let mode: 'END_TO_END' | 'TCP_HANDSHAKE' = 'TCP_HANDSHAKE';

    // 优先尝试端到端代理探测（若内核可用）
    const singboxBin = await this.resolveSingboxBinary();
    if (singboxBin) {
      try {
        const e2eResult = await this.runSingboxProbe(singboxBin, line, targetUrl, timeoutMs);
        latencyMs = e2eResult;
        status = 'SUCCESS';
        message = `204 OK (端到端 ${latencyMs}ms)`;
        mode = 'END_TO_END';
      } catch (e2eErr) {
        // 端到端失败后，尝试 TCP 握手降级测试以区分为完全失联还是仅端到端异常
        try {
          const tcpLatency = await this.tcpPing(serverHost, serverPort, timeoutMs);
          latencyMs = tcpLatency;
          status = 'SUCCESS';
          message = `TCP 握手 (${tcpLatency}ms, 端到端未就绪: ${e2eErr instanceof Error ? e2eErr.message : String(e2eErr)})`;
          mode = 'TCP_HANDSHAKE';
        } catch (tcpErr) {
          status = this.isTimeoutError(tcpErr) ? 'TIMEOUT' : 'ERROR';
          message = tcpErr instanceof Error ? tcpErr.message : String(tcpErr);
        }
      }
    } else {
      // 无 sing-box 内核直接执行入口 TCP 握手延时探测
      try {
        const tcpLatency = await this.tcpPing(serverHost, serverPort, timeoutMs);
        latencyMs = tcpLatency;
        status = 'SUCCESS';
        message = `TCP 握手 (${tcpLatency}ms)`;
        mode = 'TCP_HANDSHAKE';
      } catch (err) {
        status = this.isTimeoutError(err) ? 'TIMEOUT' : 'ERROR';
        message = err instanceof Error ? err.message : String(err);
      }
    }

    const testedAt = new Date();

    // 更新持久化快照
    await this.prisma.line.update({
      where: { id: lineId },
      data: {
        lastLatencyMs: latencyMs,
        lastTestedAt: testedAt,
        lastTestStatus: status,
        lastTestMessage: message
      }
    });

    return {
      lineId: line.id,
      lineName: line.name,
      latencyMs,
      status,
      message,
      testedAt,
      mode
    };
  }

  /**
   * 批量测试全部已启用线路（并发受控）
   */
  async testAllActiveLines(): Promise<{ total: number; success: number; failed: number }> {
    if (this.isBatchTesting) {
      this.logger.warn('已有测速任务正在执行中，跳过本次批量请求');
      return { total: 0, success: 0, failed: 0 };
    }

    this.isBatchTesting = true;
    try {
      const activeLines = await this.prisma.line.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true, name: true }
      });

      let success = 0;
      let failed = 0;
      const chunkSize = 4; // 限制并发度为 4

      for (let i = 0; i < activeLines.length; i += chunkSize) {
        const chunk = activeLines.slice(i, i + chunkSize);
        const results = await Promise.allSettled(chunk.map((item) => this.testLine(item.id)));
        for (const res of results) {
          if (res.status === 'fulfilled' && res.value.status === 'SUCCESS') {
            success++;
          } else {
            failed++;
          }
        }
      }

      this.lastAutoSpeedtestAt = Date.now();
      return { total: activeLines.length, success, failed };
    } finally {
      this.isBatchTesting = false;
    }
  }

  /**
   * TCP 握手 RTT 检测
   */
  private tcpPing(host: string, port: number, timeoutMs: number): Promise<number> {
    return new Promise((resolve, reject) => {
      const started = Date.now();
      const socket = net.createConnection({ host, port, timeout: timeoutMs });

      socket.once('connect', () => {
        const latency = Date.now() - started;
        socket.destroy();
        resolve(latency);
      });

      socket.once('timeout', () => {
        socket.destroy();
        reject(new Error(`连接超时（${timeoutMs}ms）`));
      });

      socket.once('error', (err) => {
        socket.destroy();
        reject(err);
      });
    });
  }

  /**
   * 端到端 Sing-box 代理探测
   */
  private async runSingboxProbe(
    singboxBin: string,
    line: {
      id: string;
      name: string;
      protocolType: string;
      paramsJson: string;
      serverHost: string | null;
      serverPort: number | null;
      entryPort: number;
      endpointOverrideEnabled: boolean;
      serverName: string | null;
      host: string | null;
      trafficRate: number;
      entryNode: { name: string; serverHost: string };
      landingNode?: { name: string; serverHost: string } | null;
    },
    targetUrl: string,
    timeoutMs: number
  ): Promise<number> {
    const subLine: SubLine = {
      id: line.id,
      name: line.name,
      protocolType: line.protocolType as ProtocolType,
      params: sanitizeInboundParams(this.parseJson(line.paramsJson)),
      serverHost: line.endpointOverrideEnabled && line.serverHost ? line.serverHost : line.entryNode.serverHost,
      serverPort: line.endpointOverrideEnabled && line.serverPort ? line.serverPort : line.entryPort,
      serverName: line.endpointOverrideEnabled ? line.serverName : null,
      host: line.endpointOverrideEnabled ? line.host : null,
      trafficRate: line.trafficRate
    };

    const subEntry: SubEntry = {
      label: line.name,
      node: {
        name: line.landingNode?.name ?? line.entryNode.name,
        serverHost: line.landingNode?.serverHost ?? line.entryNode.serverHost,
        inbounds: []
      },
      inbound: {
        type: line.protocolType as ProtocolType,
        tag: `probe-${line.id}`,
        port: subLine.serverPort,
        params: subLine.params ?? {}
      },
      line: subLine
    };

    const dummyUser: SubUser = {
      uuid: '11111111-2222-3333-4444-555555555555',
      credential: 'dummy-credential-for-speedtest'
    };

    const outboundConfig = buildSingboxOutbound(dummyUser, subEntry);
    outboundConfig.tag = 'probe-out';

    // 随机分配一个本地测试端口（20000 - 60000）
    const localPort = 30000 + Math.floor(Math.random() * 20000);
    const configObj = {
      log: { level: 'panic' },
      inbounds: [
        {
          type: 'mixed',
          listen: '127.0.0.1',
          listen_port: localPort
        }
      ],
      outbounds: [outboundConfig, { type: 'direct', tag: 'direct' }],
      route: {
        rules: [{ outbound: 'probe-out' }]
      }
    };

    const tmpConfigFile = `${process.env.TEMP || '/tmp'}/riri-probe-${line.id}-${Date.now()}.json`;
    await fs.writeFile(tmpConfigFile, JSON.stringify(configObj), 'utf8');

    let childProc: ReturnType<typeof spawn> | null = null;
    try {
      childProc = spawn(singboxBin, ['run', '-c', tmpConfigFile], {
        stdio: ['ignore', 'ignore', 'pipe']
      });

      // 等待 sing-box 启动并监听本地端口（最多等待 1500ms）
      await this.waitForPortReady('127.0.0.1', localPort, 1500);

      // 发起 HTTP 204 请求测速
      const latency = await this.httpGetViaHttpProxy('127.0.0.1', localPort, targetUrl, timeoutMs);
      return latency;
    } finally {
      if (childProc) {
        childProc.kill('SIGTERM');
      }
      await fs.unlink(tmpConfigFile).catch(() => undefined);
    }
  }

  private waitForPortReady(host: string, port: number, timeoutMs: number): Promise<void> {
    const started = Date.now();
    return new Promise((resolve, reject) => {
      const attempt = () => {
        if (Date.now() - started > timeoutMs) {
          return reject(new Error('等待 sing-box 启动超时'));
        }
        const socket = net.createConnection({ host, port });
        socket.once('connect', () => {
          socket.destroy();
          resolve();
        });
        socket.once('error', () => {
          socket.destroy();
          setTimeout(attempt, 50);
        });
      };
      attempt();
    });
  }

  /**
   * 通过 HTTP/Mixed Proxy 代理请求测试目标并测量往返延迟
   */
  private httpGetViaHttpProxy(proxyHost: string, proxyPort: number, targetUrl: string, timeoutMs: number): Promise<number> {
    return new Promise((resolve, reject) => {
      const url = new URL(targetUrl);
      const isHttps = url.protocol === 'https:';
      const started = Date.now();

      const socket = net.createConnection({ host: proxyHost, port: proxyPort, timeout: timeoutMs });

      socket.once('timeout', () => {
        socket.destroy();
        reject(new Error(`代理探测超时（${timeoutMs}ms）`));
      });

      socket.once('error', (err) => {
        socket.destroy();
        reject(err);
      });

      socket.once('connect', () => {
        if (isHttps) {
          // HTTPS: HTTP CONNECT tunnel
          const connectPayload = `CONNECT ${url.hostname}:${url.port || 443} HTTP/1.1\r\nHost: ${url.hostname}:${url.port || 443}\r\nProxy-Connection: keep-alive\r\n\r\n`;
          socket.write(connectPayload);

          let connectBuffer = '';
          const onConnectData = (chunk: Buffer) => {
            connectBuffer += chunk.toString();
            if (connectBuffer.includes('\r\n\r\n')) {
              socket.removeListener('data', onConnectData);
              if (!connectBuffer.startsWith('HTTP/1.1 200') && !connectBuffer.startsWith('HTTP/1.0 200')) {
                socket.destroy();
                return reject(new Error(`CONNECT 握手失败: ${connectBuffer.slice(0, 50)}`));
              }
              // Tunnel established, record time or send probe
              resolve(Date.now() - started);
              socket.destroy();
            }
          };
          socket.on('data', onConnectData);
        } else {
          // HTTP: 直接通过代理请求 GET
          const request = `GET ${targetUrl} HTTP/1.1\r\nHost: ${url.hostname}\r\nConnection: close\r\nUser-Agent: RiriCloud-Speedtest\r\n\r\n`;
          socket.write(request);

          let responseBuffer = '';
          socket.on('data', (chunk) => {
            responseBuffer += chunk.toString();
            if (responseBuffer.includes('\r\n\r\n')) {
              const latency = Date.now() - started;
              socket.destroy();
              resolve(latency);
            }
          });
        }
      });
    });
  }

  private async resolveSingboxBinary(): Promise<string | null> {
    if (this.singboxBinaryChecked) return this.cachedSingboxPath;
    this.singboxBinaryChecked = true;

    const envPath = process.env.SINGBOX_BINARY_PATH || '/usr/local/bin/sing-box';
    try {
      const stat = await fs.stat(envPath);
      if (stat.isFile()) {
        this.cachedSingboxPath = envPath;
        return envPath;
      }
    } catch {
      // ignore
    }

    this.cachedSingboxPath = null;
    return null;
  }

  private isTimeoutError(err: unknown): boolean {
    const msg = String(err instanceof Error ? err.message : err).toLowerCase();
    return msg.includes('timeout') || msg.includes('etimedout') || msg.includes('超时');
  }

  private parseJson(str: string | null | undefined): Record<string, unknown> {
    if (!str) return {};
    try {
      const parsed = JSON.parse(str);
      return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
}
