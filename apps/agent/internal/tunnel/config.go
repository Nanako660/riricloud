package tunnel

import (
	"fmt"
	"time"
)

// Role 定义节点在穿透隧道中的角色
type Role string

const (
	RoleServer Role = "SERVER" // 入口 VPS 运行服务端，监听公网穿透端口并桥接本地入站
	RoleClient Role = "CLIENT" // 内网落地主机运行客户端，主动拨号连接入口 VPS 并泵入落地 Sing-box
)

const (
	ProtocolMagic   = "RIRI_TUNNEL"
	ProtocolVersion = 1

	DefaultKeepAliveInterval = 25 * time.Second
	DefaultConnectionTimeout = 10 * time.Second
	MaxClockSkew             = 5 * time.Minute
)

// PortMapping 定义单条线路在聚合隧道中的端口映射关系
type PortMapping struct {
	LineID     string `json:"lineId"`
	LocalPort  int    `json:"localPort"`  // 在 Server 上为 BridgePort (127.0.0.1:BridgePort)
	TargetPort int    `json:"targetPort"` // 在 Client 上为 LandingPort (127.0.0.1:LandingPort)
}

// Config 定义单条聚合隧道的配置规格
type Config struct {
	ID         string        `json:"id"`         // 聚合隧道唯一 ID (例如 "entryNodeId:landingNodeId")
	Role       Role          `json:"role"`       // SERVER | CLIENT
	ListenPort int           `json:"listenPort"` // Server 模式：公网监听端口 (如 29000)
	ServerAddr string        `json:"serverAddr"` // Client 模式：入口 VPS 公网地址 (如 "vps.example.com:29000")
	Secret     string        `json:"secret"`     // 鉴权 Token
	Mappings   []PortMapping `json:"mappings"`   // 挂载在该聚合隧道上的所有线路端口映射
}

// Validate 校验配置合法性
func (c *Config) Validate() error {
	if c.ID == "" {
		return fmt.Errorf("tunnel id cannot be empty")
	}
	if c.Secret == "" {
		return fmt.Errorf("tunnel secret cannot be empty")
	}
	switch c.Role {
	case RoleServer:
		if c.ListenPort <= 0 || c.ListenPort > 65535 {
			return fmt.Errorf("invalid server listenPort: %d", c.ListenPort)
		}
	case RoleClient:
		if c.ServerAddr == "" {
			return fmt.Errorf("client serverAddr cannot be empty")
		}
	default:
		return fmt.Errorf("unknown tunnel role: %s", c.Role)
	}
	return nil
}

// HandshakeRequest 客户端发起的鉴权握手帧
type HandshakeRequest struct {
	Magic     string `json:"magic"`
	Version   int    `json:"version"`
	TunnelID  string `json:"tunnelId"`
	Secret    string `json:"secret"`
	Timestamp int64  `json:"timestamp"`
}

// HandshakeResponse 服务端返回的握手响应帧
type HandshakeResponse struct {
	Status  string `json:"status"` // "OK" 或错误描述
	Message string `json:"message,omitempty"`
}
