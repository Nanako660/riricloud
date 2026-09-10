import type { ProxyPoolExportProtocol } from './use-proxy-pool';

export interface ProxySnippetInput {
  protocol: ProxyPoolExportProtocol;
  host: string;
  port: number;
  username: string;
  password: string;
  tls?: boolean;
  serverName?: string | null;
}

export interface ProxyCodeSnippet {
  id: string;
  label: string;
  code: string;
}

// 代理 URI：HTTP 协议下根据节点是否启用 TLS 自动生成 https:// 或 http:// 代理
export function buildProxyUri(input: ProxySnippetInput): string {
  const scheme = input.protocol === 'http' ? (input.tls ? 'https' : 'http') : 'socks5h';
  return `${scheme}://${encodeURIComponent(input.username)}:${encodeURIComponent(input.password)}@${input.host}:${input.port}`;
}

// 多语言代码片段：覆盖 requests / Playwright / Node axios / cURL 四种自动化入口
export function buildProxyCodeSnippets(input: ProxySnippetInput): ProxyCodeSnippet[] {
  const { host, port, username, password, tls } = input;
  const isSocks = input.protocol !== 'http';
  const hostPort = `${host}:${port}`;
  const httpScheme = tls ? 'https' : 'http';

  const pythonRequests = isSocks
    ? `# 需先安装 SOCKS 依赖：pip install "requests[socks]"
import requests

proxies = {
    "http": "socks5h://${username}:${password}@${hostPort}",
    "https": "socks5h://${username}:${password}@${hostPort}",
}
resp = requests.get("https://httpbin.org/ip", proxies=proxies, timeout=15)
print(resp.json())`
    : `# ${tls ? '节点启用 TLS 加密（标准 HTTPS 代理）' : '标准明文 HTTP 代理'}
import requests

proxies = {
    "http": "${httpScheme}://${username}:${password}@${hostPort}",
    "https": "${httpScheme}://${username}:${password}@${hostPort}",
}
resp = requests.get("https://httpbin.org/ip", proxies=proxies, timeout=15)
print(resp.json())`;

  const playwright = `from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(
        proxy={
            "server": "${isSocks ? 'socks5' : httpScheme}://${hostPort}",
            "username": "${username}",
            "password": "${password}",
        }
    )
    page = browser.new_page()
    page.goto("https://httpbin.org/ip")
    print(page.text_content("body"))
    browser.close()`;

  const nodeAxios = isSocks
    ? `// 需先安装：npm i axios socks-proxy-agent
const axios = require('axios');
const { SocksProxyAgent } = require('socks-proxy-agent');

const agent = new SocksProxyAgent('socks5h://${username}:${password}@${hostPort}');
axios
  .get('https://httpbin.org/ip', { httpAgent: agent, httpsAgent: agent, proxy: false, timeout: 15000 })
  .then((res) => console.log(res.data));`
    : `// 只需安装：npm i axios
const axios = require('axios');

axios
  .get('https://httpbin.org/ip', {
    proxy: { protocol: '${httpScheme}', host: '${host}', port: ${port}, auth: { username: '${username}', password: '${password}' } },
    timeout: 15000,
  })
  .then((res) => console.log(res.data));`;

  const curl = isSocks
    ? `curl -x "socks5h://${username}:${password}@${hostPort}" https://httpbin.org/ip`
    : `curl -x "${httpScheme}://${username}:${password}@${hostPort}" https://httpbin.org/ip`;

  return [
    { id: 'python-requests', label: 'Python requests', code: pythonRequests },
    { id: 'playwright', label: 'Playwright', code: playwright },
    { id: 'node-axios', label: 'Node.js axios', code: nodeAxios },
    { id: 'curl', label: 'Shell cURL', code: curl }
  ];
}
