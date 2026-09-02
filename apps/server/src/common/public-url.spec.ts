import { getRequestBaseUrl, normalizePublicBaseUrl, resolvePublicBaseUrl, toWebSocketBaseUrl } from './public-url';

describe('public-url', () => {
  it('从反向代理请求头解析公开地址', () => {
    expect(getRequestBaseUrl({
      headers: {
        host: '127.0.0.1:3000',
        'x-forwarded-host': 'panel.example.com',
        'x-forwarded-proto': 'https'
      },
      protocol: 'http'
    })).toBe('https://panel.example.com');
  });

  it('优先使用显式配置，其次使用环境变量和请求地址', () => {
    expect(resolvePublicBaseUrl({
      configuredBaseUrl: 'https://configured.example.com',
      envPublicUrl: 'https://env.example.com',
      requestBaseUrl: 'https://request.example.com'
    })).toBe('https://configured.example.com');
    expect(resolvePublicBaseUrl({
      envPublicUrl: 'https://env.example.com',
      requestBaseUrl: 'https://request.example.com'
    })).toBe('https://env.example.com');
    expect(resolvePublicBaseUrl({ requestBaseUrl: 'https://request.example.com' })).toBe('https://request.example.com');
  });

  it('移除公开地址末尾斜杠、查询参数和片段', () => {
    expect(normalizePublicBaseUrl('https://panel.example.com/panel/?source=admin#settings')).toBe('https://panel.example.com/panel');
  });

  it('根据公开地址生成 WebSocket 协议', () => {
    expect(toWebSocketBaseUrl('https://panel.example.com/panel')).toBe('wss://panel.example.com/panel');
    expect(toWebSocketBaseUrl('http://localhost:3000')).toBe('ws://localhost:3000');
  });
});
