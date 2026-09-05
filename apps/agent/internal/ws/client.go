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
	"github.com/Nanako660/riricloud/apps/agent/internal/protocol"
	"github.com/Nanako660/riricloud/apps/agent/internal/singbox"
	trafficstats "github.com/Nanako660/riricloud/apps/agent/internal/stats"
	"github.com/Nanako660/riricloud/apps/agent/internal/telemetry"
	"github.com/Nanako660/riricloud/apps/agent/internal/upgrade"
)

// 消息帧：{ "type": "...", "data": {...} }
type message struct {
	Type string          `json:"type"`
	Data json.RawMessage `json:"data"`
}

type authResult struct {
	Success         bool   `json:"success"`
	Message         string `json:"message"`
	NodeID          string `json:"nodeId"`
	ProtocolVersion int    `json:"protocolVersion"`
}

type configSync struct {
	Version       int             `json:"version"`
	SingboxConfig json.RawMessage `json:"singboxConfig"`
}

type heartbeatTraffic struct {
	UserUUID      string `json:"userUuid"`
	UploadTotal   uint64 `json:"uploadTotal,string"`
	DownloadTotal uint64 `json:"downloadTotal,string"`
}

type heartbeatData struct {
	ProtocolVersion  int                `json:"protocolVersion"`
	CPUUsage         float64            `json:"cpuUsage"`
	MemoryUsage      float64            `json:"memoryUsage"`
	BandwidthRate    float64            `json:"bandwidthRate"`
	UploadRate       float64            `json:"uploadRate"`
	DownloadRate     float64            `json:"downloadRate"`
	KernelRunning    bool               `json:"kernelRunning"`        // 内核进程存活（可选字段，向后兼容）
	AppliedVersion   int64              `json:"appliedConfigVersion"` // 当前生效配置版本（可选字段）
	LastError        string             `json:"lastError"`            // 最近一次失败原因（可选字段，空串省略）
	AgentVersion     string             `json:"agentVersion"`
	OSArch           string             `json:"osArch"`
	KernelVersion    string             `json:"kernelVersion"`
	TrafficSnapshots []heartbeatTraffic `json:"trafficSnapshots"`
}

// configApplyResult config_sync 的处理回执（Agent -> Master）
type configApplyResult struct {
	Version int64  `json:"version"`
	Success bool   `json:"success"`
	Message string `json:"message"`
}

type upgradeTask struct {
	TaskID     string        `json:"taskId"`
	Target     string        `json:"target"`
	Version    string        `json:"version"`
	URL        string        `json:"url"`
	SHA256     string        `json:"sha256"`
	ResourceID string        `json:"resourceId,omitempty"`
	AssetID    string        `json:"assetId,omitempty"`
	Operation  string        `json:"operation,omitempty"`
	Files      []upgradeFile `json:"files,omitempty"`
}

type upgradeFile struct {
	Name   string `json:"name"`
	Role   string `json:"role,omitempty"`
	URL    string `json:"url"`
	SHA256 string `json:"sha256"`
	Size   int64  `json:"size,omitempty"`
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

type restartAgentTask struct {
	TaskID string `json:"taskId"`
}

type restartAgentResult struct {
	TaskID  string `json:"taskId"`
	Success bool   `json:"success"`
	Message string `json:"message"`
}

type agentLogItem struct {
	Level    string                 `json:"level"`
	Module   string                 `json:"module"`
	Source   string                 `json:"source,omitempty"`
	Message  string                 `json:"message"`
	Metadata map[string]interface{} `json:"metadata,omitempty"`
}

type logReportData struct {
	Logs []agentLogItem `json:"logs"`
}

// Client 长连接客户端：负责连接、鉴权、心跳与配置接收
type Client struct {
	masterURL  string
	token      string
	heartbeat  time.Duration
	singboxMgr *singbox.Manager
	version    string
	osArch     string
	log        *logrus.Entry
	traffic    *trafficstats.Collector
	writeMu    sync.Mutex
}

func NewClient(masterURL, token string, heartbeat time.Duration, singboxMgr *singbox.Manager, version, osArch string, log *logrus.Entry) *Client {
	return &Client{
		masterURL:  masterURL,
		token:      token,
		heartbeat:  heartbeat,
		singboxMgr: singboxMgr,
		version:    version,
		osArch:     osArch,
		log:        log,
		traffic:    trafficstats.NewCollector(log),
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
	if auth.ProtocolVersion != protocol.Version {
		return fmt.Errorf("unsupported master protocol version %d, expected %d", auth.ProtocolVersion, protocol.Version)
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
				c.sendLogReport(conn, []agentLogItem{{
					Level:   "ERROR",
					Module:  "Singbox",
					Source:  "SINGBOX",
					Message: fmt.Sprintf("Apply singbox config v%d failed: %v", sync.Version, err),
				}})
				continue
			}
			c.log.WithField("version", sync.Version).Info("singbox config applied")
			c.sendApplyResult(conn, sync.Version, true, "ok")
			c.sendLogReport(conn, []agentLogItem{{
				Level:   "INFO",
				Module:  "Singbox",
				Source:  "SINGBOX",
				Message: fmt.Sprintf("Singbox config v%d applied successfully", sync.Version),
			}})
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
		case "restart_agent_task":
			var task restartAgentTask
			if err := json.Unmarshal(msg.Data, &task); err != nil || task.TaskID == "" {
				c.sendRestartResult(conn, task.TaskID, false, "invalid restart_agent_task payload")
				continue
			}
			c.handleRestart(conn, task)
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
		if len(task.Files) > 0 {
			files := make([]singbox.UpgradeFile, 0, len(task.Files))
			for _, file := range task.Files {
				files = append(files, singbox.UpgradeFile{Name: file.Name, Role: file.Role, URL: file.URL, SHA256: file.SHA256})
			}
			err = c.singboxMgr.UpgradeKernelFiles(ctx, files)
		} else {
			err = c.singboxMgr.UpgradeKernel(ctx, task.URL, task.SHA256)
		}
	case "agent":
		err = c.upgradeSelf(ctx, task)
	default:
		err = fmt.Errorf("unsupported upgrade target %q", task.Target)
	}
	if err != nil {
		c.log.WithError(err).Warn("upgrade task failed")
		c.sendUpgradeResult(conn, task, false, err.Error())
		c.sendLogReport(conn, []agentLogItem{{
			Level:   "ERROR",
			Module:  "Upgrade",
			Source:  "AGENT",
			Message: fmt.Sprintf("Upgrade %s to %s failed: %v", task.Target, task.Version, err),
		}})
		return
	}
	c.sendUpgradeResult(conn, task, true, "ok")
	c.sendLogReport(conn, []agentLogItem{{
		Level:   "INFO",
		Module:  "Upgrade",
		Source:  "AGENT",
		Message: fmt.Sprintf("Upgrade %s to %s succeeded", task.Target, task.Version),
	}})
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

func (c *Client) handleRestart(conn *websocket.Conn, task restartAgentTask) {
	c.sendRestartResult(conn, task.TaskID, true, "ok")
	go c.restartSelf()
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
			trafficSnapshots, err := c.traffic.Collect(ctx, c.singboxMgr.StatsAddress())
			if err != nil {
				c.log.WithError(err).Debug("collect sing-box user traffic failed")
			}
			payload := heartbeatData{
				ProtocolVersion:  protocol.Version,
				CPUUsage:         sample.CPUUsage,
				MemoryUsage:      sample.MemoryUsage,
				BandwidthRate:    sample.BandwidthRate,
				UploadRate:       sample.UploadRate,
				DownloadRate:     sample.DownloadRate,
				KernelRunning:    kernel.Running,
				AppliedVersion:   kernel.AppliedConfigVersion,
				LastError:        kernel.LastError,
				AgentVersion:     c.version,
				OSArch:           c.osArch,
				KernelVersion:    kernel.Version,
				TrafficSnapshots: make([]heartbeatTraffic, 0, len(trafficSnapshots)),
			}
			for _, record := range trafficSnapshots {
				payload.TrafficSnapshots = append(payload.TrafficSnapshots, heartbeatTraffic{
					UserUUID:      record.UserID,
					UploadTotal:   record.UploadTotal,
					DownloadTotal: record.DownloadTotal,
				})
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

func (c *Client) sendRestartResult(conn *websocket.Conn, taskID string, success bool, resultMsg string) {
	data, err := json.Marshal(restartAgentResult{TaskID: taskID, Success: success, Message: resultMsg})
	if err != nil {
		return
	}
	c.sendFrame(conn, "restart_agent_result", data)
}

func (c *Client) sendLogReport(conn *websocket.Conn, logs []agentLogItem) {
	if len(logs) == 0 {
		return
	}
	data, err := json.Marshal(logReportData{Logs: logs})
	if err != nil {
		return
	}
	c.sendFrame(conn, "log_report", data)
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
