package doctor

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/gorilla/websocket"

	"github.com/Nanako660/riricloud/apps/agent/internal/config"
	"github.com/Nanako660/riricloud/apps/agent/internal/system"
)

type Check struct {
	Name   string
	OK     bool
	Detail string
}

func Run(ctx context.Context, cfg *config.Config) []Check {
	checks := []Check{
		checkConfigFile(cfg),
		checkMasterDNS(ctx, cfg.MasterURL),
		checkMasterHandshake(ctx, cfg),
		checkSingbox(ctx, cfg),
	}
	checks = append(checks, checkPorts(cfg)...)
	return checks
}

func AllOK(checks []Check) bool {
	for _, check := range checks {
		if !check.OK {
			return false
		}
	}
	return true
}

func checkConfigFile(cfg *config.Config) Check {
	if _, err := os.Stat(cfg.ConfigPath); err != nil {
		return Check{Name: "配置文件", Detail: err.Error()}
	}
	return Check{Name: "配置文件", OK: true, Detail: cfg.ConfigPath}
}

func checkMasterDNS(ctx context.Context, rawURL string) Check {
	parsed, err := url.Parse(rawURL)
	if err != nil || parsed.Hostname() == "" {
		return Check{Name: "Master DNS", Detail: "Master URL 无效"}
	}
	lookupCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	addresses, err := net.DefaultResolver.LookupHost(lookupCtx, parsed.Hostname())
	if err != nil {
		return Check{Name: "Master DNS", Detail: err.Error()}
	}
	return Check{Name: "Master DNS", OK: true, Detail: strings.Join(addresses, ", ")}
}

func checkMasterHandshake(ctx context.Context, cfg *config.Config) Check {
	if cfg.Mode == config.ModeWS {
		return checkWSHandshake(ctx, cfg)
	}
	return checkHTTPHandshake(ctx, cfg)
}

func checkWSHandshake(ctx context.Context, cfg *config.Config) Check {
	parsed, err := url.Parse(cfg.MasterURL)
	if err != nil {
		return Check{Name: "Master 握手", Detail: err.Error()}
	}
	query := parsed.Query()
	query.Set("token", cfg.AgentToken)
	parsed.RawQuery = query.Encode()
	dialCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	conn, _, err := (&websocket.Dialer{HandshakeTimeout: 10 * time.Second}).DialContext(dialCtx, parsed.String(), nil)
	if err != nil {
		return Check{Name: "Master 握手", Detail: err.Error()}
	}
	defer conn.Close()
	_, body, err := conn.ReadMessage()
	if err != nil {
		return Check{Name: "Master 握手", Detail: err.Error()}
	}
	var message struct {
		Type string `json:"type"`
		Data struct {
			Success bool   `json:"success"`
			Message string `json:"message"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &message); err != nil || message.Type != "auth_result" {
		return Check{Name: "Master 握手", Detail: "未收到有效 auth_result"}
	}
	if !message.Data.Success {
		return Check{Name: "Master 握手", Detail: message.Data.Message}
	}
	return Check{Name: "Master 握手", OK: true, Detail: "WS/WSS 鉴权成功"}
}

func checkHTTPHandshake(ctx context.Context, cfg *config.Config) Check {
	base, err := masterHTTPBase(cfg.MasterURL)
	if err != nil {
		return Check{Name: "Master 握手", Detail: err.Error()}
	}
	body := strings.NewReader(`{"cpuUsage":0,"memoryUsage":0,"bandwidthRate":0,"trafficRecords":[],"agentVersion":"doctor"}`)
	requestCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	request, err := http.NewRequestWithContext(requestCtx, http.MethodPost, base+"/api/v1/agent/poll", body)
	if err != nil {
		return Check{Name: "Master 握手", Detail: err.Error()}
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("X-Agent-Token", cfg.AgentToken)
	response, err := (&http.Client{Timeout: 10 * time.Second}).Do(request)
	if err != nil {
		return Check{Name: "Master 握手", Detail: err.Error()}
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return Check{Name: "Master 握手", Detail: fmt.Sprintf("HTTP %d", response.StatusCode)}
	}
	return Check{Name: "Master 握手", OK: true, Detail: "HTTP/HTTPS 轮询鉴权成功"}
}

func checkSingbox(ctx context.Context, cfg *config.Config) Check {
	if _, err := os.Stat(cfg.SingboxBinPath); err != nil {
		return Check{Name: "Sing-box 语法", Detail: "内核不存在：" + cfg.SingboxBinPath}
	}
	if _, err := os.Stat(cfg.SingboxConfPath); err != nil {
		return Check{Name: "Sing-box 语法", Detail: "配置不存在：" + cfg.SingboxConfPath}
	}
	checkCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	command := exec.CommandContext(checkCtx, cfg.SingboxBinPath, "check", "-c", cfg.SingboxConfPath, "-D", filepath.Dir(cfg.SingboxConfPath))
	output, err := command.CombinedOutput()
	if err != nil {
		if checkCtx.Err() != nil {
			return Check{Name: "Sing-box 语法", Detail: "检查超时"}
		}
		return Check{Name: "Sing-box 语法", Detail: tail(string(output), 512)}
	}
	return Check{Name: "Sing-box 语法", OK: true, Detail: "配置检查通过"}
}

func checkPorts(cfg *config.Config) []Check {
	data, err := os.ReadFile(cfg.SingboxConfPath)
	if err != nil {
		return []Check{{Name: "端口冲突", Detail: err.Error()}}
	}
	var root struct {
		Inbounds []struct {
			Listen string `json:"listen"`
			Port   int    `json:"listen_port"`
		} `json:"inbounds"`
	}
	if err := json.Unmarshal(data, &root); err != nil {
		return []Check{{Name: "端口冲突", Detail: "无法解析入站配置"}}
	}
	checks := make([]Check, 0, len(root.Inbounds))
	seen := map[int]bool{}
	for _, inbound := range root.Inbounds {
		if inbound.Port <= 0 || seen[inbound.Port] {
			continue
		}
		seen[inbound.Port] = true
		availableTCP := canBind("tcp", inbound.Port)
		availableUDP := canBind("udp", inbound.Port)
		if availableTCP && availableUDP {
			checks = append(checks, Check{Name: fmt.Sprintf("端口 %d", inbound.Port), OK: true, Detail: "可用"})
			continue
		}
		if running, err := system.ProcessRunning(cfg.SingboxBinPath); err == nil && running {
			checks = append(checks, Check{Name: fmt.Sprintf("端口 %d", inbound.Port), OK: true, Detail: "已被运行中的 Sing-box 使用"})
			continue
		}
		checks = append(checks, Check{Name: fmt.Sprintf("端口 %d", inbound.Port), Detail: "端口已被其他进程占用"})
	}
	if len(checks) == 0 {
		return []Check{{Name: "端口冲突", OK: true, Detail: "未发现监听端口"}}
	}
	return checks
}

func canBind(network string, port int) bool {
	address := fmt.Sprintf("127.0.0.1:%d", port)
	if network == "udp" {
		listener, err := net.ListenPacket("udp", address)
		if err != nil {
			return false
		}
		if err := listener.Close(); err != nil {
			return false
		}
		return true
	}
	listener, err := net.Listen("tcp", address)
	if err != nil {
		return false
	}
	if err := listener.Close(); err != nil {
		return false
	}
	return true
}

func masterHTTPBase(raw string) (string, error) {
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Host == "" {
		return "", fmt.Errorf("Master URL 无效")
	}
	scheme := parsed.Scheme
	if scheme == "ws" {
		scheme = "http"
	} else if scheme == "wss" {
		scheme = "https"
	}
	return fmt.Sprintf("%s://%s", scheme, parsed.Host), nil
}

func tail(value string, limit int) string {
	value = strings.TrimSpace(value)
	if len(value) <= limit {
		return value
	}
	return value[len(value)-limit:]
}
