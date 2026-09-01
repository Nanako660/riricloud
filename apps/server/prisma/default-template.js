// 内嵌默认订阅分流模板；完整 seed 会幂等写入数据库默认模板。
const DEFAULT_TEMPLATE = {
  "name": "默认通用全能分流模板",
  "description": "通用开箱即用模板，包含常用地区分流、AI 工具、流媒体、国内外 DNS 与广告拦截",
  "isDefault": true,
  "proxyGroups": [
    {
      "name": "🚀 节点选择",
      "type": "select",
      "proxies": "all"
    },
    {
      "name": "⚡ 自动优选",
      "type": "url-test",
      "url": "https://www.gstatic.com/generate_204",
      "interval": 300,
      "tolerance": 50,
      "proxies": "all"
    },
    {
      "name": "🤖 AI 服务",
      "type": "select",
      "proxies": "all"
    },
    {
      "name": "🎬 国际流媒体",
      "type": "select",
      "proxies": "all"
    },
    {
      "name": "📲 电报消息",
      "type": "select",
      "proxies": "all"
    },
    {
      "name": "🇭🇰 香港节点",
      "type": "url-test",
      "filter": "香港|HK|HongKong|Hong Kong",
      "url": "https://www.gstatic.com/generate_204",
      "interval": 300,
      "tolerance": 50
    },
    {
      "name": "🇯🇵 日本节点",
      "type": "url-test",
      "filter": "日本|JP|Japan|Tokyo|Osaka",
      "url": "https://www.gstatic.com/generate_204",
      "interval": 300,
      "tolerance": 50
    },
    {
      "name": "🇺🇸 美国节点",
      "type": "url-test",
      "filter": "美国|US|United States|USA",
      "url": "https://www.gstatic.com/generate_204",
      "interval": 300,
      "tolerance": 50
    },
    {
      "name": "🇸🇬 狮城节点",
      "type": "url-test",
      "filter": "新加坡|SG|Singapore",
      "url": "https://www.gstatic.com/generate_204",
      "interval": 300,
      "tolerance": 50
    },
    {
      "name": "🛑 广告拦截",
      "type": "select",
      "proxies": [
        "REJECT",
        "DIRECT"
      ]
    },
    {
      "name": "🎯 全球直连",
      "type": "select",
      "proxies": [
        "DIRECT",
        "🚀 节点选择"
      ]
    },
    {
      "name": "🐟 漏网之鱼",
      "type": "select",
      "proxies": [
        "🚀 节点选择",
        "⚡ 自动优选",
        "DIRECT"
      ]
    }
  ],
  "ruleSets": [
    {
      "name": "广告拦截",
      "type": "domain-suffix",
      "rules": [
        "doubleclick.net",
        "adservice.google.com",
        "adcolony.com",
        "applvn.com",
        "appsflyer.com",
        "pangolin-sdk-toutiao.com",
        "ad.toutiao.com"
      ],
      "target": "REJECT",
      "enabled": true
    },
    {
      "name": "AI 服务分流 (OpenAI / Claude / Gemini / Copilot)",
      "type": "domain-suffix",
      "rules": [
        "openai.com",
        "chatgpt.com",
        "oaistatic.com",
        "oaiusercontent.com",
        "anthropic.com",
        "claude.ai",
        "gemini.google.com",
        "generativelanguage.googleapis.com",
        "x.ai",
        "grok.com",
        "copilot.microsoft.com",
        "sora.com"
      ],
      "target": "🤖 AI 服务",
      "enabled": true
    },
    {
      "name": "Telegram 专用",
      "type": "domain-suffix",
      "rules": [
        "telegram.org",
        "t.me",
        "tdesktop.com",
        "telegram.me",
        "telesco.pe"
      ],
      "target": "📲 电报消息",
      "enabled": true
    },
    {
      "name": "国际主流流媒体",
      "type": "domain-suffix",
      "rules": [
        "netflix.com",
        "nflxext.com",
        "nflximg.net",
        "nflxvideo.net",
        "youtube.com",
        "googlevideo.com",
        "ytimg.com",
        "disneyplus.com",
        "disney-portal.my.onetrust.com",
        "dssott.com",
        "spotify.com",
        "scdn.co",
        "spotifycdn.com",
        "twitch.tv",
        "ttvnw.net",
        "hbo.com",
        "hbomax.com",
        "max.com"
      ],
      "target": "🎬 国际流媒体",
      "enabled": true
    },
    {
      "name": "国际开发与常用站点",
      "type": "domain-suffix",
      "rules": [
        "github.com",
        "githubassets.com",
        "githubusercontent.com",
        "gitlab.com",
        "docker.com",
        "docker.io",
        "npmjs.org",
        "npmjs.com",
        "pypi.org",
        "google.com",
        "googleapis.com",
        "gstatic.com",
        "twitter.com",
        "x.com",
        "twimg.com",
        "facebook.com",
        "instagram.com",
        "reddit.com",
        "wikipedia.org"
      ],
      "target": "🚀 节点选择",
      "enabled": true
    },
    {
      "name": "局域网与国内常见直连",
      "type": "domain-suffix",
      "rules": [
        "local",
        "localhost",
        "lan",
        "bilibili.com",
        "hdslb.com",
        "baidu.com",
        "bdimg.com",
        "qq.com",
        "tencent.com",
        "taobao.com",
        "tmall.com",
        "alipay.com",
        "alibaba.com",
        "aliyun.com",
        "jd.com",
        "zhihu.com",
        "163.com",
        "126.net",
        "weibo.com",
        "douyin.com",
        "bytedance.com"
      ],
      "target": "DIRECT",
      "enabled": true
    },
    {
      "name": "GeoSite 中国直连",
      "type": "geosite",
      "rules": [
        "cn",
        "private"
      ],
      "target": "DIRECT",
      "enabled": true
    },
    {
      "name": "私有与国内 IP-CIDR 直连",
      "type": "ip-cidr",
      "rules": [
        "127.0.0.0/8",
        "10.0.0.0/8",
        "172.16.0.0/12",
        "192.168.0.0/16",
        "100.64.0.0/10",
        "224.0.0.0/4"
      ],
      "target": "DIRECT",
      "enabled": true
    },
    {
      "name": "兜底匹配 Final",
      "type": "match",
      "rules": [],
      "target": "🐟 漏网之鱼",
      "enabled": true
    }
  ],
  "dnsConfig": {
    "enable": true,
    "ipv6": false,
    "enhanced-mode": "fake-ip",
    "fake-ip-range": "198.18.0.1/16",
    "default-nameserver": [
      "223.5.5.5",
      "119.29.29.29"
    ],
    "nameserver": [
      "https://223.5.5.5/dns-query",
      "https://1.1.1.1/dns-query",
      "https://8.8.8.8/dns-query"
    ],
    "fallback": [
      "https://1.1.1.1/dns-query",
      "https://8.8.8.8/dns-query",
      "https://9.9.9.9/dns-query"
    ],
    "fallback-filter": {
      "geoip": true,
      "geoip-code": "CN",
      "ipcidr": [
        "240.0.0.0/4"
      ]
    }
  },
  "customInjectYaml": "mixed-port: 7890\nallow-lan: false\nmode: rule\nlog-level: info\nipv6: false\ntun:\n  enable: true\n  stack: mixed\n  dns-hijack:\n    - 'any:53'\n  auto-route: true\n  auto-detect-interface: true\nprofile:\n  store-selected: true\n  store-fake-ip: true",
  "customInjectJson": "{\n  \"log\": {\n    \"level\": \"info\"\n  },\n  \"experimental\": {\n    \"clash_api\": {\n      \"external_controller\": \"127.0.0.1:9090\",\n      \"secret\": \"\"\n    }\n  }\n}"
};

module.exports = { DEFAULT_TEMPLATE };

