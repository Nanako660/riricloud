// Package ws 实现 Agent 与 Master 的 WebSocket 长连接（协议见 docs/API_AND_PROTOCOLS.md）。
package ws

import (
	"context"
	"encoding/json"
	"fmt"
	"math/rand"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/sirupsen/logrus"

	"github.com/Nanako660/riricloud/apps/agent/internal/singbox"
	"github.com/Nanako660/riricloud/apps/agent/internal/telemetry"
)

// 消息帧：{ "type": "...", "data": {...} }
type message struct {
	Type string          `json:"type"`
	Data json.RawMessage `json:"data"`
}

type authResult struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
	NodeID  string `json:"nodeId"`
}

type configSync struct {
	Version       int             `json:"version"`
	SingboxConfig json.RawMessage `json:"singboxConfig"`
}

type heartbeatTraffic struct {
	UserUUID string `json:"userUuid"`
	Upload   uint64 `json:"upload"`
	Download uint64 `json:"download"`
}

type heartbeatData struct {
	CPUUsage       float64            `json:"cpuUsage"`
	MemoryUsage    float64            `json:"memoryUsage"`
	BandwidthRate  float64            `json:"bandwidthRate"`
	TrafficRecords []heartbeatTraffic `json:"trafficRecords"`
}

// Client 长连接客户端：负责连接、鉴权、心跳与配置接收
type Client struct {
	masterURL  string
	token      string
	heartbeat  time.Duration
	singboxMgr *singbox.Manager
	log        *logrus.Entry
	writeMu    sync.Mutex
}

func NewClient(masterURL, token string, heartbeat time.Duration, singboxMgr *singbox.Manager, log *logrus.Entry) *Client {
	return &Client{
		masterURL:  masterURL,
		token:      token,
		heartbeat:  heartbeat,
		singboxMgr: singboxMgr,
		log:        log,
	}
}

// Run 主循环：断线后指数退避重连（上限 60s + 抖动），ctx 取消即退出
func (c *Client) Run(ctx context.Context) {
	backoff := time.Second
	for {
		if ctx.Err() != nil {
			return
		}
		if err := c.runOnce(ctx); err != nil {
			c.log.WithError(err).Warn("connection ended")
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(jitter(backoff)):
		}
		backoff = min(backoff*2, 60*time.Second)
	}
}

// runOnce 单次连接生命周期：连接成功且正常断开时重置退避
func (c *Client) runOnce(ctx context.Context) error {
	c.log.Info("connecting to master")
	dialer := websocket.Dialer{HandshakeTimeout: 10 * time.Second}
	conn, _, err := dialer.DialContext(ctx, c.masterURL+"?token="+c.token, nil)
	if err != nil {
		return fmt.Errorf("dial master: %w", err)
	}
	defer conn.Close()
	c.log.Info("connected")

	// 鉴权结果与配置在消息处理前不可用，先同步读首帧 auth_result
	authed := false
	_, raw, err := conn.ReadMessage()
	if err != nil {
		return fmt.Errorf("read auth_result: %w", err)
	}
	var msg message
	if err := json.Unmarshal(raw, &msg); err != nil {
		return fmt.Errorf("decode auth_result: %w", err)
	}
	if msg.Type != "auth_result" {
		return fmt.Errorf("expect auth_result, got %s", msg.Type)
	}
	var auth authResult
	if err := json.Unmarshal(msg.Data, &auth); err != nil {
		return fmt.Errorf("decode auth payload: %w", err)
	}
	if !auth.Success {
		return fmt.Errorf("auth rejected: %s", auth.Message)
	}
	authed = true
	c.log.WithField("nodeId", auth.NodeID).Info("authenticated")

	// 读取循环（含 config_sync）；心跳独立 goroutine，ctx 退出
	errCh := make(chan error, 2)
	go func() {
		errCh <- c.readLoop(conn)
	}()
	go func() {
		errCh <- c.heartbeatLoop(ctx, conn)
	}()

	select {
	case <-ctx.Done():
		conn.Close()
		return nil
	case err := <-errCh:
		conn.Close()
		if err != nil && authed {
			return err
		}
		return err
	}
}

// readLoop 持续读取服务端消息（当前仅 config_sync）
func (c *Client) readLoop(conn *websocket.Conn) error {
	for {
		_, raw, err := conn.ReadMessage()
		if err != nil {
			return fmt.Errorf("read message: %w", err)
		}
		var msg message
		if err := json.Unmarshal(raw, &msg); err != nil {
			c.log.WithError(err).Warn("invalid message")
			continue
		}
		switch msg.Type {
		case "config_sync":
			var sync configSync
			if err := json.Unmarshal(msg.Data, &sync); err != nil {
				c.log.WithError(err).Warn("invalid config_sync payload")
				continue
			}
			if err := c.singboxMgr.ApplyConfig(sync.SingboxConfig); err != nil {
				c.log.WithError(err).Error("apply singbox config failed")
				continue
			}
			c.log.WithField("version", sync.Version).Info("singbox config applied")
		default:
			c.log.WithField("type", msg.Type).Debug("unknown message")
		}
	}
}

// heartbeatLoop 周期上报系统指标；goroutine 随 ctx 退出
func (c *Client) heartbeatLoop(ctx context.Context, conn *websocket.Conn) error {
	ticker := time.NewTicker(c.heartbeat)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return nil
		case <-ticker.C:
			// 采集含 1 秒采样窗口，放行到 goroutine 避免阻塞 ticker
			sample := telemetry.Collect()
			payload := heartbeatData{
				CPUUsage:       sample.CPUUsage,
				MemoryUsage:    sample.MemoryUsage,
				BandwidthRate:  sample.BandwidthRate,
				TrafficRecords: []heartbeatTraffic{}, // 按用户流量统计受 sing-box 上游能力限制暂未采集（docs/ROADMAP.md）
			}
			data, err := json.Marshal(payload)
			if err != nil {
				c.log.WithError(err).Warn("marshal heartbeat")
				continue
			}
			frame, err := json.Marshal(message{Type: "heartbeat", Data: data})
			if err != nil {
				continue
			}
			c.writeMu.Lock()
			err = conn.WriteMessage(websocket.TextMessage, frame)
			c.writeMu.Unlock()
			if err != nil {
				return fmt.Errorf("send heartbeat: %w", err)
			}
			c.log.WithFields(logrus.Fields{
				"cpu": fmt.Sprintf("%.1f%%", payload.CPUUsage),
				"mem": fmt.Sprintf("%.1f%%", payload.MemoryUsage),
			}).Debug("heartbeat sent")
		}
	}
}

// jitter 指数退避加 ±25% 抖动（G5 约束）
func jitter(d time.Duration) time.Duration {
	spread := float64(d) * 0.25
	delta := time.Duration(spread * (2*rand.Float64() - 1))
	return d + delta
}

func min(a, b time.Duration) time.Duration {
	if a < b {
		return a
	}
	return b
}
