package config

import (
	"fmt"
	"os"
)

// Agent 运行配置：环境变量优先，带开发用默认值
type Config struct {
	MasterWsURL     string // Master WS 网关地址
	AgentToken      string // 节点凭证（由主控派发）
	SingboxConfPath string // config_sync 落盘路径
	SingboxBinPath  string // sing-box 内核二进制路径（默认走 PATH）
	HeartbeatSecs   int    // 心跳周期（秒），协议约定 5~10
}

func Load() (*Config, error) {
	c := &Config{
		MasterWsURL:     getenv("MASTER_WS_URL", "ws://localhost:3000/ws/agent"),
		AgentToken:      os.Getenv("AGENT_TOKEN"),
		SingboxConfPath: getenv("SINGBOX_CONFIG_PATH", "./config.json"),
		SingboxBinPath:  getenv("SINGBOX_BINARY_PATH", "sing-box"),
		HeartbeatSecs:   5,
	}
	if c.AgentToken == "" {
		return nil, fmt.Errorf("AGENT_TOKEN is required")
	}
	return c, nil
}

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
