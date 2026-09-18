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
    ? '# ⚠️ Warning: TLS is enabled on this node; standard SOCKS5 handshake will fail. Consider switching to HTTP (HTTPS) protocol.\n'
    : '';

  const pythonRequests = isSocks
    ? `${tlsSocksWarning}# Install SOCKS dependency first: pip install "requests[socks]"
import requests

proxies = {
    "http": "socks5h://${username}:${password}@${hostPort}",
    "https": "socks5h://${username}:${password}@${hostPort}",
}
resp = requests.get("https://httpbin.org/ip", proxies=proxies, timeout=15)
print(resp.json())`
    : `# ${tls ? 'Node TLS enabled (Standard HTTPS Proxy)' : 'Standard HTTP Proxy'}
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
    ? `${tlsSocksWarning ? tlsSocksWarning.replace(/^#/, '//') : ''}// Install dependencies first: npm i axios socks-proxy-agent
const axios = require('axios');
const { SocksProxyAgent } = require('socks-proxy-agent');

const agent = new SocksProxyAgent('socks5h://${username}:${password}@${hostPort}');
axios
  .get('https://httpbin.org/ip', { httpAgent: agent, httpsAgent: agent, proxy: false, timeout: 15000 })
  .then((res) => console.log(res.data));`
    : `// Install dependency first: npm i axios
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

  const pythonRequests = `# Proxy pool rotation example (requires requests; for SOCKS install requests[socks])
import random
import requests

PROXIES_POOL = [
${endpointUris.map((u) => `    "${u.uri}",  # ${u.name}`).join('\n')}
]

# 1. Random rotation mode: randomly pick one proxy from the pool
proxy_url = random.choice(PROXIES_POOL)
proxies = {
    "http": proxy_url,
    "https": proxy_url,
}
resp = requests.get("https://httpbin.org/ip", proxies=proxies, timeout=15)
print("Current egress IP:", resp.json())

# 2. Batch test mode (optional): iterate through all nodes to test connectivity
# for proxy in PROXIES_POOL:
#     r = requests.get("https://httpbin.org/ip", proxies={"http": proxy, "https": proxy}, timeout=10)
#     print(f"[{proxy}] -> {r.json()['origin']}")`;

  const playwright = `# Playwright proxy pool rotation example: pip install playwright
import random
from playwright.sync_api import sync_playwright

PROXIES_POOL = [
${endpoints.map((ep) => {
  const scheme = isSocks ? 'socks5' : (ep.tls ? 'https' : 'http');
  return `    {"server": "${scheme}://${ep.host}:${ep.port}", "username": "${username}", "password": "${password}"},  # ${ep.name}`;
}).join('\n')}
]

# Randomly assign a proxy for each browser instance
proxy_config = random.choice(PROXIES_POOL)

with sync_playwright() as p:
    browser = p.chromium.launch(proxy=proxy_config)
    page = browser.new_page()
    page.goto("https://httpbin.org/ip")
    print(page.text_content("body"))
    browser.close()`;

  const nodeAxios = isSocks
    ? `// Install dependencies first: npm i axios socks-proxy-agent
const axios = require('axios');
const { SocksProxyAgent } = require('socks-proxy-agent');

const PROXIES_POOL = [
${endpoints.map((ep) => `  'socks5h://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${ep.host}:${ep.port}', // ${ep.name}`).join('\n')}
];

// Randomly rotate proxy
const chosen = PROXIES_POOL[Math.floor(Math.random() * PROXIES_POOL.length)];
const agent = new SocksProxyAgent(chosen);
axios
  .get('https://httpbin.org/ip', { httpAgent: agent, httpsAgent: agent, proxy: false, timeout: 15000 })
  .then((res) => console.log('Current egress IP:', res.data));`
    : `// Install dependency first: npm i axios
const axios = require('axios');

const PROXIES_POOL = [
${endpoints.map((ep) => {
  const scheme = ep.tls ? 'https' : 'http';
  return `  { protocol: '${scheme}', host: '${ep.host}', port: ${ep.port}, auth: { username: '${username}', password: '${password}' } }, // ${ep.name}`;
}).join('\n')}
];

// Randomly rotate proxy
const chosen = PROXIES_POOL[Math.floor(Math.random() * PROXIES_POOL.length)];
axios
  .get('https://httpbin.org/ip', { proxy: chosen, timeout: 15000 })
  .then((res) => console.log('Current egress IP:', res.data));`;

  const curl = `# Direct proxy pool: Bash array definition (${endpoints.length} endpoints selected)
PROXIES=(
${endpointUris.map((u) => `  "${u.uri}" # ${u.name}`).join('\n')}
)

# 1. Batch test mode: sequentially test connectivity and egress IP for all selected proxies
echo "=== Testing selected proxy egress IPs ==="
for proxy in "\${PROXIES[@]}"; do
  echo -n "Testing proxy [$proxy] -> "
  curl -s -x "$proxy" --max-time 10 https://httpbin.org/ip | grep "origin" || echo "Connection failed"
done

# 2. Single random rotation: randomly pick one proxy from pool to execute command
RANDOM_PROXY="\${PROXIES[$RANDOM % \${#PROXIES[@]}]}"
curl -x "$RANDOM_PROXY" https://httpbin.org/ip`;

  return [
    { id: 'python-requests', label: 'Python requests', code: pythonRequests },
    { id: 'playwright', label: 'Playwright', code: playwright },
    { id: 'node-axios', label: 'Node.js axios', code: nodeAxios },
    { id: 'curl', label: 'Shell cURL', code: curl }
  ];
}
