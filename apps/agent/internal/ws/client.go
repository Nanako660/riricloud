// Package ws 实现 Agent 与 Master 的 WebSocket 长连接（协议见 docs/API_AND_PROTOCOLS.md）。
package ws

import (
	"context"
	"encoding/json"
	"fmt"
	"math/rand"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/sirupsen/logrus"

	"github.com/Nanako660/riricloud/apps/agent/internal/probe"
	"github.com/Nanako660/riricloud/apps/agent/internal/singbox"
	"github.com/Nanako660/riricloud/apps/agent/internal/telemetry"
	"github.com/Nanako660/riricloud/apps/agent/internal/upgrade"
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
	KernelRunning  bool               `json:"kernelRunning"`        // 内核进程存活（可选字段，向后兼容）
	AppliedVersion int64              `json:"appliedConfigVersion"` // 当前生效配置版本（可选字段）
	LastError      string             `json:"lastError"`            // 最近一次失败原因（可选字段，空串省略）
	TrafficRecords []heartbeatTraffic `json:"trafficRecords"`
}

// configApplyResult config_sync 的处理回执（Agent -> Master）
type configApplyResult struct {
	Version int64  `json:"version"`
	Success bool   `json:"success"`
	Message string `json:"message"`
}

type upgradeTask struct {
	TaskID  string `json:"taskId"`
	Target  string `json:"target"`
	Version string `json:"version"`
	URL     string `json:"url"`
	SHA256  string `json:"sha256"`
}

type upgradeResult struct {
	TaskID  string `json:"taskId"`
	Target  string `json:"target"`
	Version string `json:"version"`
	Success bool   `json:"success"`
	Message string `json:"message"`
}

type probeTask struct {
	TaskID string         `json:"taskId"`
	Probes []probeRequest `json:"probes"`
}

type probeRequest struct {
	Type      string `json:"type"`
	Target    string `json:"target"`
	Port      int    `json:"port"`
	TimeoutMs int    `json:"timeoutMs"`
}

type probeResultData struct {
	TaskID  string         `json:"taskId"`
	Success bool           `json:"success"`
	Results []probe.Result `json:"results"`
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
		errCh <- c.readLoop(ctx, conn)
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

// readLoop 持续读取服务端消息；升级与探针任务在该连接的可取消上下文中执行。
func (c *Client) readLoop(ctx context.Context, conn *websocket.Conn) error {
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
				c.sendApplyResult(conn, sync.Version, false, "invalid config_sync payload")
				continue
			}
			if err := c.singboxMgr.ApplyConfig(sync.SingboxConfig, int64(sync.Version)); err != nil {
				c.log.WithError(err).Error("apply singbox config failed")
				c.sendApplyResult(conn, sync.Version, false, err.Error())
				continue
			}
			c.log.WithField("version", sync.Version).Info("singbox config applied")
			c.sendApplyResult(conn, sync.Version, true, "ok")
		case "upgrade_task":
			var task upgradeTask
			if err := json.Unmarshal(msg.Data, &task); err != nil {
				c.sendUpgradeResult(conn, task, false, "invalid upgrade_task payload")
				continue
			}
			c.handleUpgrade(ctx, conn, task)
		case "probe_task":
			var task probeTask
			if err := json.Unmarshal(msg.Data, &task); err != nil {
				c.sendProbeResult(conn, task.TaskID, nil, false)
				continue
			}
			c.handleProbe(ctx, conn, task)
		default:
			c.log.WithField("type", msg.Type).Debug("unknown message")
		}
	}
}

func (c *Client) handleUpgrade(parent context.Context, conn *websocket.Conn, task upgradeTask) {
	ctx, cancel := context.WithTimeout(parent, 10*time.Minute)
	defer cancel()
	var err error
	switch task.Target {
	case "singbox":
		err = c.singboxMgr.UpgradeKernel(ctx, task.URL, task.SHA256)
	case "agent":
		err = c.upgradeSelf(ctx, task)
	default:
		err = fmt.Errorf("unsupported upgrade target %q", task.Target)
	}
	if err != nil {
		c.log.WithError(err).Warn("upgrade task failed")
		c.sendUpgradeResult(conn, task, false, err.Error())
		return
	}
	c.sendUpgradeResult(conn, task, true, "ok")
	if task.Target == "agent" {
		go c.restartSelf()
	}
}

func (c *Client) upgradeSelf(ctx context.Context, task upgradeTask) error {
	target, err := os.Executable()
	if err != nil {
		return fmt.Errorf("resolve agent executable: %w", err)
	}
	temp, err := upgrade.DownloadAndVerify(ctx, task.URL, task.SHA256, filepath.Dir(target))
	if err != nil {
		return err
	}
	defer func() {
		if removeErr := os.Remove(temp); removeErr != nil && !os.IsNotExist(removeErr) {
			c.log.WithError(removeErr).Warn("remove agent upgrade temp file failed")
		}
	}()
	return upgrade.AtomicReplace(temp, target)
}

func (c *Client) restartSelf() {
	time.Sleep(250 * time.Millisecond)
	target, err := os.Executable()
	if err != nil {
		c.log.WithError(err).Error("resolve agent executable for restart failed")
		return
	}
	cmd := exec.Command(target, os.Args[1:]...)
	cmd.Env = os.Environ()
	if err := cmd.Start(); err != nil {
		c.log.WithError(err).Error("restart agent failed")
		return
	}
	os.Exit(0)
}

func (c *Client) handleProbe(ctx context.Context, conn *websocket.Conn, task probeTask) {
	requests := make([]probe.Request, 0, len(task.Probes))
	for _, item := range task.Probes {
		requests = append(requests, probe.Request{
			Type: probe.Type(item.Type), Target: item.Target, Port: item.Port, TimeoutMs: item.TimeoutMs,
		})
	}
	results := probe.Run(ctx, requests)
	success := len(results) > 0
	for _, result := range results {
		if !result.Success {
			success = false
			break
		}
	}
	c.sendProbeResult(conn, task.TaskID, results, success)
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
			kernel := c.singboxMgr.Status()
			payload := heartbeatData{
				CPUUsage:       sample.CPUUsage,
				MemoryUsage:    sample.MemoryUsage,
				BandwidthRate:  sample.BandwidthRate,
				KernelRunning:  kernel.Running,
				AppliedVersion: kernel.AppliedConfigVersion,
				LastError:      kernel.LastError,
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

// sendApplyResult 回执 config_sync 处理结果（写失败仅记日志：回执是尽力而为的增强信息）
func (c *Client) sendApplyResult(conn *websocket.Conn, version int, success bool, resultMsg string) {
	data, err := json.Marshal(configApplyResult{Version: int64(version), Success: success, Message: resultMsg})
	if err != nil {
		return
	}
	frame, err := json.Marshal(message{Type: "config_apply_result", Data: data})
	if err != nil {
		return
	}
	c.writeMu.Lock()
	defer c.writeMu.Unlock()
	if err := conn.WriteMessage(websocket.TextMessage, frame); err != nil {
		c.log.WithError(err).Warn("send config_apply_result failed")
	}
}

func (c *Client) sendUpgradeResult(conn *websocket.Conn, task upgradeTask, success bool, resultMsg string) {
	data, err := json.Marshal(upgradeResult{TaskID: task.TaskID, Target: task.Target, Version: task.Version, Success: success, Message: resultMsg})
	if err != nil {
		c.log.WithError(err).Warn("marshal upgrade_result failed")
		return
	}
	c.sendFrame(conn, "upgrade_result", data)
}

func (c *Client) sendProbeResult(conn *websocket.Conn, taskID string, results []probe.Result, success bool) {
	data, err := json.Marshal(probeResultData{TaskID: taskID, Success: success, Results: results})
	if err != nil {
		c.log.WithError(err).Warn("marshal probe_result failed")
		return
	}
	c.sendFrame(conn, "probe_result", data)
}

func (c *Client) sendFrame(conn *websocket.Conn, messageType string, data json.RawMessage) {
	frame, err := json.Marshal(message{Type: messageType, Data: data})
	if err != nil {
		c.log.WithError(err).Warn("marshal agent frame failed")
		return
	}
	c.writeMu.Lock()
	defer c.writeMu.Unlock()
	if err := conn.WriteMessage(websocket.TextMessage, frame); err != nil {
		c.log.WithError(err).Warn("send agent frame failed")
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
