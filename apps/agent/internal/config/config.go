package config

import (
	"fmt"
	"net/url"
	"os"
	"strconv"
	"strings"
)

type Mode string

const (
	ModeWS   Mode = "ws"
	ModeHTTP Mode = "http"
)

// Agent 运行配置：环境变量优先，带开发用默认值
type Config struct {
	MasterURL        string // Master 地址：WS 模式为 /ws/agent，HTTP 模式可为主控根地址
	MasterWsURL      string // 兼容旧版调用方的 WS 地址字段
	Mode             Mode   // 通信模式：ws 或 http
	AgentToken       string // 节点凭证（由主控派发）
	SingboxConfPath  string // config_sync 落盘路径
	SingboxBinPath   string // sing-box 内核二进制路径（默认走 PATH）
	HeartbeatSecs    int    // 心跳周期（秒），协议约定 5~10
	PollIntervalSecs int    // HTTP 轮询周期（秒）
}

func Load() (*Config, error) {
	masterURL := os.Getenv("MASTER_URL")
	if masterURL == "" {
		masterURL = os.Getenv("MASTER_WS_URL")
	}
	if masterURL == "" {
		masterURL = "ws://localhost:3000/ws/agent"
	}
	mode, err := resolveMode(masterURL, os.Getenv("AGENT_MODE"))
	if err != nil {
		return nil, err
	}
	pollInterval, err := loadSeconds("POLL_INTERVAL_SECS", 15, 5, 300)
	if err != nil {
		return nil, err
	}
	c := &Config{
		MasterURL:        masterURL,
		MasterWsURL:      masterURL,
		Mode:             mode,
		AgentToken:       os.Getenv("AGENT_TOKEN"),
		SingboxConfPath:  getenv("SINGBOX_CONFIG_PATH", "./config.json"),
		SingboxBinPath:   getenv("SINGBOX_BINARY_PATH", "sing-box"),
		HeartbeatSecs:    5,
		PollIntervalSecs: pollInterval,
	}
	if c.AgentToken == "" {
		return nil, fmt.Errorf("AGENT_TOKEN is required")
	}
	return c, nil
}

func resolveMode(rawURL, explicit string) (Mode, error) {
	parsed, err := url.Parse(rawURL)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return "", fmt.Errorf("MASTER_URL must be an absolute URL")
	}
	if explicit != "" {
		switch Mode(strings.ToLower(strings.TrimSpace(explicit))) {
		case ModeWS:
			if parsed.Scheme != "ws" && parsed.Scheme != "wss" {
				return "", fmt.Errorf("AGENT_MODE=ws requires MASTER_URL with ws or wss scheme")
			}
			return ModeWS, nil
		case ModeHTTP:
			if parsed.Scheme != "http" && parsed.Scheme != "https" {
				return "", fmt.Errorf("AGENT_MODE=http requires MASTER_URL with http or https scheme")
			}
			return ModeHTTP, nil
		default:
			return "", fmt.Errorf("AGENT_MODE must be ws or http")
		}
	}
	switch parsed.Scheme {
	case "ws", "wss":
		return ModeWS, nil
	case "http", "https":
		return ModeHTTP, nil
	default:
		return "", fmt.Errorf("MASTER_URL scheme must be ws, wss, http, or https")
	}
}

func loadSeconds(key string, fallback, minValue, maxValue int) (int, error) {
	raw := os.Getenv(key)
	if raw == "" {
		return fallback, nil
	}
	value, err := strconv.Atoi(raw)
	if err != nil || value < minValue || value > maxValue {
		return 0, fmt.Errorf("%s must be an integer between %d and %d", key, minValue, maxValue)
	}
	return value, nil
}

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
