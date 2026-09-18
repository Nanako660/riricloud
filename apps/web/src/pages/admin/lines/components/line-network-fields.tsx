import type { UseFormReturn } from 'react-hook-form';
import { FieldGrid, NumberField, SelectField, SwitchField, TextField } from './line-form-controls';
import type { LineFormValues } from './line-form-schema';

export function LineNetworkFields({ form }: { form: UseFormReturn<LineFormValues> }) {
  const protocol = form.watch('protocolType');
  const proxyProtocol = form.watch('proxyProtocol');
  const ssUdpOverTcp = form.watch('ssUdpOverTcp');
  const isShadowsocksWithUdpOverTcp = protocol === 'SHADOWSOCKS' && ssUdpOverTcp;
  const supportsMultiplex = ['VLESS', 'VMESS', 'TROJAN', 'SHADOWSOCKS'].includes(protocol);
  const multiplexEnabled = form.watch('multiplexEnabled');
  const brutalEnabled = form.watch('multiplexBrutalEnabled');

  return (
    <div className="space-y-4">
      <FieldGrid>
        <NumberField
          form={form}
          name="speedLimitMbps"
          label="单端口带宽整形 (Mbps)"
          placeholder="0 或留空为不限速"
          description="由 Linux 边缘 Agent 通过 Traffic Control (HTB) 对物理端口实施出入双向整形。"
          min={0}
          max={100000}
        />
        <SwitchField
          form={form}
          name="proxyProtocol"
          label="PROXY Protocol"
          description="接收上游 HAProxy / Nginx 的 PROXY 协议头（自动兼容解析 v1 与 v2）以获取真实客户端 IP。"
        />
      </FieldGrid>

      {Boolean(proxyProtocol) && (
        <SwitchField
          form={form}
          name="proxyProtocolAcceptNoHeader"
          label="允许无 PROXY Protocol 头握手"
          description="开启后允许直连该端口的客户端在无 PROXY 头的情况下正常建立连接。"
        />
      )}

      <FieldGrid>
        <SwitchField
          form={form}
          name="tcpFastOpen"
          label="TCP Fast Open (TFO)"
          description="在 TCP SYN 包中携带数据，减少握手往返延迟（需内核支持）。"
        />
        <SwitchField
          form={form}
          name="tcpMultiPath"
          label="TCP MultiPath (MPTCP)"
          description="允许并发使用多个网络接口提升吞吐与抗断网韧性。"
        />
      </FieldGrid>

      <FieldGrid>
        <SwitchField
          form={form}
          name="udpFragment"
          label="允许 UDP 分片 (Fragment)"
          description="默认开启；拆分超过 MTU 的大型 UDP 数据报以避免丢包。"
        />
        <TextField
          form={form}
          name="udpTimeout"
          label="UDP 会话超时"
          placeholder="例如: 5m, 30s"
          description="留空采用内核默认超时。"
        />
      </FieldGrid>

      {supportsMultiplex && (
        <div className="rounded-md border p-4 space-y-3 bg-muted/20">
          <SwitchField
            form={form}
            name="multiplexEnabled"
            label="启用多路复用 (Multiplex)"
            description={
              isShadowsocksWithUdpOverTcp
                ? 'Shadowsocks 协议已开启 UDP over TCP，根据 Sing-box 规范两者互斥，已自动禁用多路复用。'
                : '将多个 TCP 逻辑连接合并在单一长连接隧道中传输，降低握手开销。'
            }
            disabled={isShadowsocksWithUdpOverTcp}
          />

          {multiplexEnabled && !isShadowsocksWithUdpOverTcp && (
            <div className="space-y-3 pt-2">
              <FieldGrid>
                <SelectField
                  form={form}
                  name="multiplexProtocol"
                  label="复用协议"
                  options={[
                    { value: 'smux', label: 'smux (兼容 Clash Meta / Sing-box)' },
                    { value: 'yamux', label: 'yamux' },
                    { value: 'h2mux', label: 'h2mux' }
                  ]}
                />
                <NumberField
                  form={form}
                  name="multiplexMaxConnections"
                  label="最大底层连接数 (max_connections)"
                  placeholder={form.watch('multiplexMaxStreams') ? '已配置最大流数，此项留空' : '默认 4'}
                  description="与最大复用流数互斥（Sing-box 规范二选一）。"
                  disabled={Boolean(form.watch('multiplexMaxStreams'))}
                  min={1}
                  max={64}
                />
              </FieldGrid>

              <FieldGrid>
                <NumberField
                  form={form}
                  name="multiplexMinStreams"
                  label="最小复用流数"
                  placeholder="默认 4"
                  min={1}
                  max={256}
                />
                <NumberField
                  form={form}
                  name="multiplexMaxStreams"
                  label="最大复用流数 (max_streams)"
                  placeholder={form.watch('multiplexMaxConnections') ? '已配置底层连接数，此项留空' : '留空不限制'}
                  description="与最大底层连接数互斥（Sing-box 规范二选一）。"
                  disabled={Boolean(form.watch('multiplexMaxConnections'))}
                  min={0}
                  max={1024}
                />
              </FieldGrid>

              <SwitchField
                form={form}
                name="multiplexPadding"
                label="流混淆填充 (Padding)"
                description="填充数据包长度以抵御流量指纹特征分析。"
              />

              <SwitchField
                form={form}
                name="multiplexBrutalEnabled"
                label="TCP Brutal 强力拥塞控制"
                description="基于带宽自适应发包策略，抵抗恶劣跨境网络的高丢包。"
              />

              {brutalEnabled && (
                <FieldGrid>
                  <NumberField
                    form={form}
                    name="multiplexBrutalUpMbps"
                    label="Brutal 上行速率期望 (Mbps)"
                    placeholder="例如: 50"
                    min={1}
                    max={100000}
                  />
                  <NumberField
                    form={form}
                    name="multiplexBrutalDownMbps"
                    label="Brutal 下行速率期望 (Mbps)"
                    placeholder="例如: 100"
                    min={1}
                    max={100000}
                  />
                </FieldGrid>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
