// Package poll 实现 Agent 与 Master 的 HTTP/HTTPS 主动轮询通信。
package poll

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/sirupsen/logrus"

	"github.com/Nanako660/riricloud/apps/agent/internal/probe"
	"github.com/Nanako660/riricloud/apps/agent/internal/singbox"
	trafficstats "github.com/Nanako660/riricloud/apps/agent/internal/stats"
	"github.com/Nanako660/riricloud/apps/agent/internal/telemetry"
	"github.com/Nanako660/riricloud/apps/agent/internal/upgrade"
)

type taskMessage struct {
	Type string          `json:"type"`
	Data json.RawMessage `json:"data"`
}

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
	Port      int    `json:"port,omitempty"`
	TimeoutMs int    `json:"timeoutMs,omitempty"`
}

type probeResultData struct {
	TaskID  string         `json:"taskId"`
	Success bool           `json:"success"`
	Results []probe.Result `json:"results"`
}

type restartAgentResult struct {
	TaskID  string `json:"taskId"`
	Success bool   `json:"success"`
	Message string `json:"message"`
}

type pollTrafficRecord struct {
	UserUUID string `json:"userUuid"`
	Upload   uint64 `json:"upload"`
	Download uint64 `json:"download"`
}

type pollPayload struct {
	CPUUsage            float64             `json:"cpuUsage"`
	MemoryUsage         float64             `json:"memoryUsage"`
	BandwidthRate       float64             `json:"bandwidthRate"`
	UploadRate          float64             `json:"uploadRate"`
	DownloadRate        float64             `json:"downloadRate"`
	KernelRunning       bool                `json:"kernelRunning"`
	AppliedVersion      int64               `json:"appliedConfigVersion"`
	LastError           string              `json:"lastError"`
	AgentVersion        string              `json:"agentVersion"`
	OSArch              string              `json:"osArch"`
	KernelVersion       string              `json:"kernelVersion"`
	TrafficRecords      []pollTrafficRecord `json:"trafficRecords"`
	ConfigApplyResults  []json.RawMessage   `json:"configApplyResults,omitempty"`
	UpgradeResults      []json.RawMessage   `json:"upgradeResults,omitempty"`
	ProbeResults        []json.RawMessage   `json:"probeResults,omitempty"`
	RestartAgentResults []json.RawMessage   `json:"restartAgentResults,omitempty"`
}

type pollResponse struct {
	NeedUpdate    bool            `json:"needUpdate"`
	Version       int64           `json:"version"`
	SingboxConfig json.RawMessage `json:"singboxConfig"`
	Tasks         []taskMessage   `json:"tasks"`
	NextPollSecs  int             `json:"nextPollSecs"`
}

type pendingResult struct {
	id   uint64
	kind string
	data json.RawMessage
}

// Client 负责 HTTP 轮询、配置应用和任务异步执行。所有后台任务都绑定 Run 的根 Context。
type Client struct {
	masterURL  string
	token      string
	interval   time.Duration
	httpClient *http.Client
	singboxMgr *singbox.Manager
	version    string
	osArch     string
	log        *logrus.Entry

	resultMu         sync.Mutex
	resultSeq        uint64
	pendingResults   []pendingResult
	runningTasks     map[string]struct{}
	completedTasks   map[string]struct{}
	restartRequested bool
	traffic          *trafficstats.Collector
	tasks            sync.WaitGroup
}

func NewClient(masterURL, token string, interval time.Duration, singboxMgr *singbox.Manager, version, osArch string, log *logrus.Entry) *Client {
	return &Client{
		masterURL:      masterURL,
		token:          token,
		interval:       interval,
		httpClient:     &http.Client{Timeout: 20 * time.Second},
		singboxMgr:     singboxMgr,
		version:        version,
		osArch:         osArch,
		log:            log,
		runningTasks:   make(map[string]struct{}),
		completedTasks: make(map[string]struct{}),
		traffic:        trafficstats.NewCollector(log),
	}
}

// Run 先立即轮询一次，随后采用服务端建议周期；请求失败时短暂指数退避，成功后恢复协商周期。
func (c *Client) Run(ctx context.Context) {
	interval := c.interval
	for {
		if ctx.Err() != nil {
			break
		}
		if err := c.pollOnce(ctx); err != nil {
			c.log.WithError(err).Warn("poll request failed")
			interval = minDuration(interval*2, 60*time.Second)
		} else {
			interval = c.interval
		}
		timer := time.NewTimer(interval)
		select {
		case <-ctx.Done():
			if !timer.Stop() {
				<-timer.C
			}
		case <-timer.C:
		}
	}
	c.tasks.Wait()
}

func (c *Client) pollOnce(ctx context.Context) error {
	endpoint, err := resolvePollURL(c.masterURL)
	if err != nil {
		return err
	}
	sample := telemetry.Collect()
	kernel := c.singboxMgr.Status()
	trafficRecords, err := c.traffic.Collect(ctx, c.singboxMgr.StatsAddress())
	if err != nil {
		c.log.WithError(err).Debug("collect sing-box user traffic failed")
	}
	payload := pollPayload{
		CPUUsage:       sample.CPUUsage,
		MemoryUsage:    sample.MemoryUsage,
		BandwidthRate:  sample.BandwidthRate,
		UploadRate:     sample.UploadRate,
		DownloadRate:   sample.DownloadRate,
		KernelRunning:  kernel.Running,
		AppliedVersion: kernel.AppliedConfigVersion,
		LastError:      kernel.LastError,
		AgentVersion:   c.version,
		OSArch:         c.osArch,
		KernelVersion:  kernel.Version,
		TrafficRecords: make([]pollTrafficRecord, 0, len(trafficRecords)),
	}
	for _, record := range trafficRecords {
		payload.TrafficRecords = append(payload.TrafficRecords, pollTrafficRecord{
			UserUUID: record.UserID,
			Upload:   record.Upload,
			Download: record.Download,
		})
	}
	sentResults := c.appendPendingResults(&payload)
	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal poll payload: %w", err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, strings.NewReader(string(body)))
	if err != nil {
		return fmt.Errorf("create poll request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Agent-Token", c.token)
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("send poll request: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		message, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return fmt.Errorf("poll request: HTTP %s: %s", resp.Status, strings.TrimSpace(string(message)))
	}
	var response pollResponse
	if err := json.NewDecoder(io.LimitReader(resp.Body, 20*1024*1024)).Decode(&response); err != nil {
		return fmt.Errorf("decode poll response: %w", err)
	}
	c.removePendingResults(sentResults)
	if response.NextPollSecs >= 5 && response.NextPollSecs <= 300 {
		c.interval = time.Duration(response.NextPollSecs) * time.Second
	}
	if response.NeedUpdate && len(response.SingboxConfig) > 0 {
		if err := c.singboxMgr.ApplyConfig(response.SingboxConfig, response.Version); err != nil {
			c.addResult("config", configApplyResult{Version: response.Version, Success: false, Message: err.Error()})
			c.log.WithError(err).Warn("apply polled sing-box config failed")
		} else {
			c.addResult("config", configApplyResult{Version: response.Version, Success: true, Message: "ok"})
			c.log.WithField("version", response.Version).Info("polled sing-box config applied")
		}
	}
	for _, task := range response.Tasks {
		c.startTask(ctx, task)
	}
	if c.consumeRestartRequest() {
		go c.restartSelf()
	}
	return nil
}

func (c *Client) appendPendingResults(payload *pollPayload) []uint64 {
	c.resultMu.Lock()
	defer c.resultMu.Unlock()
	ids := make([]uint64, 0, len(c.pendingResults))
	for _, result := range c.pendingResults {
		ids = append(ids, result.id)
		switch result.kind {
		case "config":
			payload.ConfigApplyResults = append(payload.ConfigApplyResults, result.data)
		case "upgrade":
			payload.UpgradeResults = append(payload.UpgradeResults, result.data)
		case "probe":
			payload.ProbeResults = append(payload.ProbeResults, result.data)
		case "restart":
			payload.RestartAgentResults = append(payload.RestartAgentResults, result.data)
		}
	}
	return ids
}

func (c *Client) removePendingResults(ids []uint64) {
	if len(ids) == 0 {
		return
	}
	seen := make(map[uint64]struct{}, len(ids))
	for _, id := range ids {
		seen[id] = struct{}{}
	}
	c.resultMu.Lock()
	defer c.resultMu.Unlock()
	remaining := c.pendingResults[:0]
	for _, result := range c.pendingResults {
		if _, ok := seen[result.id]; !ok {
			remaining = append(remaining, result)
		}
	}
	c.pendingResults = remaining
}

func (c *Client) addResult(kind string, value any) {
	data, err := json.Marshal(value)
	if err != nil {
		c.log.WithError(err).Warn("marshal poll task result failed")
		return
	}
	c.resultMu.Lock()
	c.resultSeq++
	c.pendingResults = append(c.pendingResults, pendingResult{id: c.resultSeq, kind: kind, data: data})
	c.resultMu.Unlock()
}

func (c *Client) startTask(parent context.Context, task taskMessage) {
	taskID := extractTaskID(task.Data)
	if taskID == "" {
		c.log.WithField("type", task.Type).Warn("ignore task without taskId")
		return
	}
	c.resultMu.Lock()
	if _, ok := c.runningTasks[taskID]; ok {
		c.resultMu.Unlock()
		return
	}
	if _, ok := c.completedTasks[taskID]; ok {
		c.resultMu.Unlock()
		return
	}
	c.runningTasks[taskID] = struct{}{}
	c.resultMu.Unlock()

	c.tasks.Add(1)
	go func() {
		defer c.tasks.Done()
		defer func() {
			c.resultMu.Lock()
			delete(c.runningTasks, taskID)
			c.completedTasks[taskID] = struct{}{}
			c.resultMu.Unlock()
		}()
		switch task.Type {
		case "upgrade_task":
			c.runUpgrade(parent, task.Data)
		case "probe_task":
			c.runProbe(parent, task.Data)
		case "restart_agent_task":
			c.runRestart(task.Data)
		default:
			c.log.WithField("type", task.Type).Warn("unsupported poll task")
		}
	}()
}

func (c *Client) runUpgrade(parent context.Context, raw json.RawMessage) {
	var task upgradeTask
	if err := json.Unmarshal(raw, &task); err != nil {
		return
	}
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
	result := upgradeResult{TaskID: task.TaskID, Target: task.Target, Version: task.Version, Success: err == nil, Message: "ok"}
	if err != nil {
		result.Message = err.Error()
		c.log.WithError(err).Warn("poll upgrade task failed")
	} else if task.Target == "agent" {
		c.resultMu.Lock()
		c.restartRequested = true
		c.resultMu.Unlock()
	}
	c.addResult("upgrade", result)
}

func (c *Client) runProbe(parent context.Context, raw json.RawMessage) {
	var task probeTask
	if err := json.Unmarshal(raw, &task); err != nil {
		return
	}
	ctx, cancel := context.WithTimeout(parent, 10*time.Minute)
	defer cancel()
	requests := make([]probe.Request, 0, len(task.Probes))
	for _, item := range task.Probes {
		requests = append(requests, probe.Request{Type: probe.Type(item.Type), Target: item.Target, Port: item.Port, TimeoutMs: item.TimeoutMs})
	}
	results := probe.Run(ctx, requests)
	success := len(results) > 0
	for _, result := range results {
		if !result.Success {
			success = false
			break
		}
	}
	c.addResult("probe", probeResultData{TaskID: task.TaskID, Success: success, Results: results})
}

func (c *Client) runRestart(raw json.RawMessage) {
	var task struct {
		TaskID string `json:"taskId"`
	}
	if err := json.Unmarshal(raw, &task); err != nil || task.TaskID == "" {
		return
	}
	c.addResult("restart", restartAgentResult{TaskID: task.TaskID, Success: true, Message: "ok"})
	c.resultMu.Lock()
	c.restartRequested = true
	c.resultMu.Unlock()
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

func (c *Client) consumeRestartRequest() bool {
	c.resultMu.Lock()
	defer c.resultMu.Unlock()
	requested := c.restartRequested
	if requested {
		c.restartRequested = false
	}
	return requested
}

func extractTaskID(raw json.RawMessage) string {
	var value struct {
		TaskID string `json:"taskId"`
	}
	if json.Unmarshal(raw, &value) != nil {
		return ""
	}
	return value.TaskID
}

func resolvePollURL(rawURL string) (string, error) {
	parsed, err := url.Parse(rawURL)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return "", fmt.Errorf("MASTER_URL must be an absolute URL")
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return "", fmt.Errorf("HTTP mode requires MASTER_URL with http or https scheme")
	}
	if parsed.Path == "" || parsed.Path == "/" {
		parsed.Path = "/api/v1/agent/poll"
	} else if strings.HasSuffix(parsed.Path, "/ws/agent") {
		parsed.Path = strings.TrimSuffix(parsed.Path, "/ws/agent") + "/api/v1/agent/poll"
	}
	parsed.RawQuery = ""
	return parsed.String(), nil
}

func minDuration(a, b time.Duration) time.Duration {
	if a < b {
		return a
	}
	return b
}
