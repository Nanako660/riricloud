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

export interface MultiProxySnippetEndpoint {
  lineId: string;
  name: string;
  host: string;
  port: number;
  tls?: boolean;
  serverName?: string | null;
}

export interface MultiProxySnippetInput {
  protocol: ProxyPoolExportProtocol;
  username: string;
  password: string;
  endpoints: MultiProxySnippetEndpoint[];
}

// 代理 URI：HTTP 协议下根据节点是否启用 TLS 自动生成 https:// 或 http:// 代理
export function buildProxyUri(input: ProxySnippetInput): string {
  const scheme = input.protocol === 'http' ? (input.tls ? 'https' : 'http') : 'socks5h';
  return `${scheme}://${encodeURIComponent(input.username)}:${encodeURIComponent(input.password)}@${input.host}:${input.port}`;
}

// 多语言代码片段（单节点）：覆盖 requests / Playwright / Node axios / cURL 四种自动化入口
export function buildProxyCodeSnippets(input: ProxySnippetInput): ProxyCodeSnippet[] {
  const { host, port, username, password, tls } = input;
  const isSocks = input.protocol !== 'http';
  const hostPort = `${host}:${port}`;
  const httpScheme = tls ? 'https' : 'http';
  const tlsSocksWarning = (isSocks && tls)
    ? '# ⚠️ 注意：该节点已开启 TLS 加密，标准 SOCKS5 握手将因协议冲突失败，建议切换为 HTTP (HTTPS) 协议\n'
    : '';

  const pythonRequests = isSocks
    ? `${tlsSocksWarning}# 需先安装 SOCKS 依赖：pip install "requests[socks]"
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

  const playwright = isSocks
    ? `${tlsSocksWarning ? tlsSocksWarning + '\n' : ''}from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(
        proxy={
            "server": "socks5://${hostPort}",
            "username": "${username}",
            "password": "${password}",
        }
    )
    page = browser.new_page()
    page.goto("https://httpbin.org/ip")
    print(page.text_content("body"))
    browser.close()`
    : `from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(
        proxy={
            "server": "${httpScheme}://${hostPort}",
            "username": "${username}",
            "password": "${password}",
        }
    )
    page = browser.new_page()
    page.goto("https://httpbin.org/ip")
    print(page.text_content("body"))
    browser.close()`;

  const nodeAxios = isSocks
    ? `${tlsSocksWarning ? tlsSocksWarning.replace(/^#/, '//') : ''}// 需先安装：npm i axios socks-proxy-agent
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
    ? `${tlsSocksWarning}curl -x "socks5h://${username}:${password}@${hostPort}" https://httpbin.org/ip`
    : `curl -x "${httpScheme}://${username}:${password}@${hostPort}" https://httpbin.org/ip`;

  return [
    { id: 'python-requests', label: 'Python requests', code: pythonRequests },
    { id: 'playwright', label: 'Playwright', code: playwright },
    { id: 'node-axios', label: 'Node.js axios', code: nodeAxios },
    { id: 'curl', label: 'Shell cURL', code: curl }
  ];
}

// 多语言代码片段（多节点代理池轮换）：覆盖 requests / Playwright / Node axios / cURL
export function buildMultiProxyCodeSnippets(input: MultiProxySnippetInput): ProxyCodeSnippet[] {
  const { protocol, username, password, endpoints } = input;
  const isSocks = protocol !== 'http';

  const endpointUris = endpoints.map((ep) => ({
    name: ep.name,
    uri: buildProxyUri({
      protocol,
      host: ep.host,
      port: ep.port,
      username,
      password,
      tls: ep.tls,
      serverName: ep.serverName
    })
  }));

  const pythonRequests = `# 代理池轮换请求示例（需安装 requests；若走 SOCKS 需 pip install "requests[socks]"）
import random
import requests

PROXIES_POOL = [
${endpointUris.map((u) => `    "${u.uri}",  # ${u.name}`).join('\n')}
]

# 1. 随机轮换模式：每次请求从代理池中随机选取一个节点
proxy_url = random.choice(PROXIES_POOL)
proxies = {
    "http": proxy_url,
    "https": proxy_url,
}
resp = requests.get("https://httpbin.org/ip", proxies=proxies, timeout=15)
print("当前出网 IP:", resp.json())

# 2. 批量测试模式（可选）：遍历所有节点验证连通性
# for proxy in PROXIES_POOL:
#     r = requests.get("https://httpbin.org/ip", proxies={"http": proxy, "https": proxy}, timeout=10)
#     print(f"[{proxy}] -> {r.json()['origin']}")`;

  const playwright = `# Playwright 代理池多开与轮换示例：pip install playwright
import random
from playwright.sync_api import sync_playwright

PROXIES_POOL = [
${endpoints.map((ep) => {
  const scheme = isSocks ? 'socks5' : (ep.tls ? 'https' : 'http');
  return `    {"server": "${scheme}://${ep.host}:${ep.port}", "username": "${username}", "password": "${password}"},  # ${ep.name}`;
}).join('\n')}
]

# 为每个浏览器实例随机分发代理
proxy_config = random.choice(PROXIES_POOL)

with sync_playwright() as p:
    browser = p.chromium.launch(proxy=proxy_config)
    page = browser.new_page()
    page.goto("https://httpbin.org/ip")
    print(page.text_content("body"))
    browser.close()`;

  const nodeAxios = isSocks
    ? `// 需先安装：npm i axios socks-proxy-agent
const axios = require('axios');
const { SocksProxyAgent } = require('socks-proxy-agent');

const PROXIES_POOL = [
${endpoints.map((ep) => `  'socks5h://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${ep.host}:${ep.port}', // ${ep.name}`).join('\n')}
];

// 随机轮换出网代理
const chosen = PROXIES_POOL[Math.floor(Math.random() * PROXIES_POOL.length)];
const agent = new SocksProxyAgent(chosen);
axios
  .get('https://httpbin.org/ip', { httpAgent: agent, httpsAgent: agent, proxy: false, timeout: 15000 })
  .then((res) => console.log('当前出网 IP:', res.data));`
    : `// 只需安装：npm i axios
const axios = require('axios');

const PROXIES_POOL = [
${endpoints.map((ep) => {
  const scheme = ep.tls ? 'https' : 'http';
  return `  { protocol: '${scheme}', host: '${ep.host}', port: ${ep.port}, auth: { username: '${username}', password: '${password}' } }, // ${ep.name}`;
}).join('\n')}
];

// 随机轮换出网代理
const chosen = PROXIES_POOL[Math.floor(Math.random() * PROXIES_POOL.length)];
axios
  .get('https://httpbin.org/ip', { proxy: chosen, timeout: 15000 })
  .then((res) => console.log('当前出网 IP:', res.data));`;

  const curl = `# 直连代理池：Bash 数组定义（已选 ${endpoints.length} 个出网节点）
PROXIES=(
${endpointUris.map((u) => `  "${u.uri}" # ${u.name}`).join('\n')}
)

# 1. 批量测试模式：依次对所有已选节点测试连通性与出网 IP
echo "=== 正在批量测试已选代理出网 IP ==="
for proxy in "\${PROXIES[@]}"; do
  echo -n "测试代理 [$proxy] -> "
  curl -s -x "$proxy" --max-time 10 https://httpbin.org/ip | grep "origin" || echo "连接失败"
done

# 2. 单次随机轮换：从代理池中随机选取一个代理执行命令
RANDOM_PROXY="\${PROXIES[$RANDOM % \${#PROXIES[@]}]}"
curl -x "$RANDOM_PROXY" https://httpbin.org/ip`;

  return [
    { id: 'python-requests', label: 'Python requests', code: pythonRequests },
    { id: 'playwright', label: 'Playwright', code: playwright },
    { id: 'node-axios', label: 'Node.js axios', code: nodeAxios },
    { id: 'curl', label: 'Shell cURL', code: curl }
  ];
}
