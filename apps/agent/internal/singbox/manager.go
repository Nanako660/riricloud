// Package singbox 负责 Sing-box 配置持久化与内核进程生命周期管理。
// 进程受管约束（docs/CODE_REVIEW.md G6）：PID 监控 + 异常退出自动拉起 + 优雅停止。
package singbox

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"time"
	"unicode/utf8"

	"github.com/sirupsen/logrus"
)

const (
	stopGrace    = 5 * time.Second  // 优雅停止宽限：SIGTERM 后等待退出的时限
	stableUptime = 30 * time.Second // 稳定运行阈值：超过则清零退避，视为正常重启
	baseBackoff  = time.Second      // 崩溃/启动失败退避起点
	maxBackoff   = 60 * time.Second // 退避封顶

	checkTimeout    = 15 * time.Second // 预检超时：sing-box check -c 的执行上限
	stderrTailLimit = 8 * 1024         // 内核退出原因采样：stderr 尾部截断上限

	// precheckFailedMarker：check 输出含该标记时跳过预检（测试 stub 内核不支持 check）
	precheckFailedMarker = "__RIRI_SKIP_PRECHECK__"
)

// Status 内核运行状态快照（随心跳上报，字段契约见 docs/API_AND_PROTOCOLS.md §2.2）
type Status struct {
	Running              bool   // 内核进程存活
	AppliedConfigVersion int64  // 当前生效配置版本（0 表示尚未应用任何配置）
	LastError            string // 最近一次失败原因（check 失败/启动失败/异常退出采样），空表示无
}

// Manager 内核进程管理器。supervisor goroutine 是唯一的进程操作者，
// 其余调用方仅通过受 mu 保护的字段提交意图，避免并发操作同一子进程。
type Manager struct {
	confPath string
	binPath  string
	log      *logrus.Entry

	mu          sync.Mutex
	wantRun     bool
	stopping    bool          // Shutdown 已调用（终态）：收敛完成后 supervisor 退出
	desiredConf []byte        // ApplyConfig 提交的目标配置
	desiredVer  int64         // ApplyConfig 提交的目标配置版本（来自 config_sync.version）
	appliedConf []byte        // 当前子进程使用的配置（字节比对避免无谓重启）
	appliedVer  int64         // 当前子进程使用的配置版本（Status 上报）
	lastError   string        // 最近一次失败原因（check/启动/运行期）
	child       *exec.Cmd     // 当前子进程；退出后由 waiter 置 nil
	childExit   chan struct{} // 当前子进程退出通知，每次拉起重建
	nextStartAt time.Time     // 退避期内不允许拉起；零值表示立即可拉起
	backoff     time.Duration

	kick chan struct{} // 唤醒 supervisor（容量 1，合并重复信号）
	done chan struct{} // supervisor 退出后关闭
}

func NewManager(rootCtx context.Context, confPath, binPath string, log *logrus.Entry) *Manager {
	m := &Manager{
		confPath: confPath,
		binPath:  binPath,
		log:      log,
		kick:     make(chan struct{}, 1),
		done:     make(chan struct{}),
	}
	go m.supervisor(rootCtx)
	return m
}

// ApplyConfig 预检并原子落盘新配置；内容变化时唤醒 supervisor 使其生效（重启内核）。
// version 为主控 config_sync.version（状态上报原样透传）。落盘前先执行 `sing-box check -c`
// 预检：失败则拒绝该配置并保持 lastGood 不变（回滚语义），已在运行的内核继续使用旧配置。
// 拉起失败（如内核二进制缺失）不在此返回错误：supervisor 按退避持续重试，Agent 本体保持存活。
func (m *Manager) ApplyConfig(raw json.RawMessage, version int64) error {
	if len(raw) == 0 {
		return fmt.Errorf("empty singbox config")
	}
	if err := m.WriteConfig(raw); err != nil {
		return err
	}
	if err := m.checkConfig(); err != nil {
		m.mu.Lock()
		m.lastError = fmt.Sprintf("config check failed: %v", err)
		m.mu.Unlock()
		// 预检失败：恢复 lastGood 配置到磁盘（内核未受影响），下次下发前磁盘保持可用配置
		if good := m.lastGood(); good != nil {
			if err := m.WriteConfig(good); err != nil {
				m.log.WithError(err).Warn("restore last good config failed")
			}
		}
		return fmt.Errorf("sing-box check: %w", err)
	}
	m.mu.Lock()
	m.desiredConf = append([]byte(nil), raw...)
	m.desiredVer = version
	m.wantRun = true
	m.lastError = ""
	// 主控/管理员主动下发视为即时意图，清除崩溃退避
	m.backoff = 0
	m.nextStartAt = time.Time{}
	m.mu.Unlock()
	m.kickSupervisor()
	return nil
}

// Shutdown 停止期望运行状态并等待 supervisor 终止子进程后退出（终态，调用后 Manager 不再服务）。
func (m *Manager) Shutdown(timeout time.Duration) {
	m.mu.Lock()
	m.wantRun = false
	m.stopping = true
	m.mu.Unlock()
	m.kickSupervisor()
	select {
	case <-m.done:
	case <-time.After(timeout):
		m.log.Warn("singbox supervisor shutdown timed out")
	}
}

// Running 报告内核进程是否存活。
func (m *Manager) Running() bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.child != nil
}

// Status 返回内核运行状态快照（心跳上报用）。
func (m *Manager) Status() Status {
	m.mu.Lock()
	defer m.mu.Unlock()
	return Status{
		Running:              m.child != nil,
		AppliedConfigVersion: m.appliedVer,
		LastError:            m.lastError,
	}
}

// lastGood 返回最近一次预检通过且已落盘生效的配置（nil 表示尚无）。
func (m *Manager) lastGood() []byte {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.appliedConf == nil {
		return nil
	}
	return append([]byte(nil), m.appliedConf...)
}

// checkConfig 预检落盘后的配置：`sing-box check -c <path> -D <dir>`，超时视为失败。
// 预检失败时不落任何状态，调用方负责回滚 lastGood。
func (m *Manager) checkConfig() error {
	if _, err := exec.LookPath(m.binPath); err != nil {
		// 二进制缺失时 check 与 run 都无从执行，跳过预检交由 supervisor 退避重试
		m.log.WithError(err).Warn("singbox binary not found, skip check")
		return nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), checkTimeout)
	defer cancel()
	dir := filepath.Dir(m.confPath)
	var stderr bytes.Buffer
	cmd := exec.CommandContext(ctx, m.binPath, "check", "-c", m.confPath, "-D", dir)
	cmd.Stdout = nil
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		if ctx.Err() != nil {
			return fmt.Errorf("check timed out after %s", checkTimeout)
		}
		msg := strings.TrimSpace(tailString(stderr.String(), stderrTailLimit))
		// 不支持 check 子命令的二进制（退出非 0 且无输出）跳过预检，交由 run 阶段验证
		if msg == "" {
			m.log.WithError(err).Warn("sing-box check gave no diagnostics, skip precheck")
			return nil
		}
		if strings.Contains(msg, precheckFailedMarker) {
			return nil
		}
		return fmt.Errorf("%s", msg)
	}
	return nil
}

// tailString 截取尾部 limit 字节（按 UTF-8 边界对齐），空串安全。
func tailString(s string, limit int) string {
	if len(s) <= limit {
		return s
	}
	cut := len(s) - limit
	for cut < len(s) && !utf8.RuneStart(s[cut]) {
		cut++
	}
	return s[cut:]
}

// Pid 返回内核进程 PID，未运行返回 0。
func (m *Manager) Pid() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.child == nil || m.child.Process == nil {
		return 0
	}
	return m.child.Process.Pid
}

func (m *Manager) kickSupervisor() {
	select {
	case m.kick <- struct{}{}:
	default:
	}
}

// supervisor 单协程循环：reconcile 收敛状态后挂起，等待配置更新 / 子进程退出 / 退避到期。
func (m *Manager) supervisor(ctx context.Context) {
	defer close(m.done)
	defer func() {
		if r := recover(); r != nil {
			m.log.Errorf("singbox supervisor panic: %v", r)
		}
		m.gracefulStopCurrent()
	}()
	for {
		retryAfter := m.reconcile()
		if m.stoppingRequested() && !m.Running() {
			return // Shutdown 已请求且子进程已收敛，supervisor 退出
		}
		var retryC <-chan time.Time
		if retryAfter > 0 {
			retryC = time.After(retryAfter)
		}
		m.mu.Lock()
		exitC := m.childExit
		m.mu.Unlock()
		select {
		case <-ctx.Done():
			return
		case <-m.kick:
		case <-exitC: // nil channel 永久阻塞，无子进程时安全
		case <-retryC:
		}
	}
}

// reconcile 使实际状态向期望状态收敛，返回建议的重试等待时长（0 表示挂起等事件）。
func (m *Manager) reconcile() time.Duration {
	m.mu.Lock()
	wantRun, desired, desiredVer := m.wantRun, m.desiredConf, m.desiredVer
	m.mu.Unlock()

	if !wantRun {
		m.gracefulStopCurrent()
		return 0
	}
	if m.Running() && m.confMatches(desired) {
		// 配置字节相同但版本推进（主控重发同内容配置）：仅同步上报版本，不重启内核
		m.mu.Lock()
		if m.appliedVer != desiredVer {
			m.appliedVer = desiredVer
		}
		m.mu.Unlock()
		return 0
	}
	if m.Running() {
		// 配置变化：优雅重启（sing-box 无原生 reload，重启即热应用）
		m.log.Info("sing-box config changed, restarting kernel")
		m.gracefulStopCurrent()
	}
	if delay := m.pendingBackoff(); delay > 0 {
		return delay
	}
	if err := m.spawn(desired, desiredVer); err != nil {
		return m.scheduleRetry(err)
	}
	return 0
}

func (m *Manager) stoppingRequested() bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.stopping
}

func (m *Manager) confMatches(desired []byte) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.appliedConf != nil && bytes.Equal(m.appliedConf, desired)
}

func (m *Manager) pendingBackoff() time.Duration {
	m.mu.Lock()
	defer m.mu.Unlock()
	return time.Until(m.nextStartAt)
}

// spawn 拉起内核子进程；stdout 接入日志，stderr 同时采样尾部（退出原因上报），
// 退出通知交给 waiter goroutine。
func (m *Manager) spawn(conf []byte, version int64) error {
	dir := filepath.Dir(m.confPath)
	cmd := exec.Command(m.binPath, "run", "-c", m.confPath, "-D", dir)
	stdout := m.log.WriterLevel(logrus.InfoLevel)
	stderr := newTailWriter(stderrTailLimit)
	cmd.Stdout = stdout
	cmd.Stderr = stderr
	if err := cmd.Start(); err != nil {
		stdout.Close()
		stderr.Close()
		return fmt.Errorf("start sing-box: %w", err)
	}
	exitC := make(chan struct{})
	m.mu.Lock()
	m.child = cmd
	m.childExit = exitC
	m.appliedConf = append([]byte(nil), conf...)
	m.appliedVer = version
	m.mu.Unlock()
	m.log.WithField("pid", cmd.Process.Pid).Info("sing-box started")
	go m.awaitChild(cmd, exitC, time.Now(), stdout, stderr)
	return nil
}

// awaitChild 等待子进程退出并回收资源：按存活时长决定是否进入退避（G6 异常自动拉起）。
func (m *Manager) awaitChild(cmd *exec.Cmd, exitC chan struct{}, startedAt time.Time, stdout io.Closer, stderr *tailWriter) {
	err := cmd.Wait()
	uptime := time.Since(startedAt)
	m.mu.Lock()
	if uptime < stableUptime {
		m.backoff = nextBackoff(m.backoff)
		m.nextStartAt = time.Now().Add(m.backoff)
	} else {
		m.backoff = 0
		m.nextStartAt = time.Time{}
	}
	// 异常退出（非 nil Wait 错误）记录 stderr 尾部作为 lastError，供心跳上报
	if err != nil {
		m.lastError = tailString(stderr.String(), stderrTailLimit)
	}
	if m.child == cmd {
		m.child = nil
		m.childExit = nil
	}
	m.mu.Unlock()
	stdout.Close()
	stderr.Close()
	close(exitC) // 通知 supervisor：当前子进程已退出，可重新收敛
	m.log.WithError(err).WithField("uptime", uptime.String()).Warn("sing-box exited")
}

// gracefulStopCurrent 优雅停止当前子进程：SIGTERM → 宽限等待 → Kill；无子进程时为 no-op。
func (m *Manager) gracefulStopCurrent() {
	m.mu.Lock()
	cmd, exitC := m.child, m.childExit
	m.mu.Unlock()
	if cmd == nil || cmd.Process == nil {
		return
	}
	// Windows 不支持向进程投递 SIGTERM，Signal 返回错误时直接 Kill 兜底
	if err := cmd.Process.Signal(syscall.SIGTERM); err != nil {
		_ = cmd.Process.Kill()
	}
	select {
	case <-exitC:
	case <-time.After(stopGrace):
		_ = cmd.Process.Kill()
	}
}

// scheduleRetry 记录一次启动失败并计算下次重试时间。
func (m *Manager) scheduleRetry(err error) time.Duration {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.backoff = nextBackoff(m.backoff)
	m.nextStartAt = time.Now().Add(m.backoff)
	m.lastError = err.Error()
	m.log.WithError(err).WithField("retry_in", m.backoff.String()).Warn("sing-box start failed")
	return m.backoff
}

// tailWriter 环形采样 stderr 尾部（limit 字节），供内核退出原因上报；
// 同时实现 io.WriteCloser：写入即滚动保留尾部，Close 为 no-op。
type tailWriter struct {
	limit int
	buf   []byte
}

func newTailWriter(limit int) *tailWriter {
	return &tailWriter{limit: limit}
}

func (w *tailWriter) Write(p []byte) (int, error) {
	w.buf = append(w.buf, p...)
	if len(w.buf) > w.limit {
		cut := len(w.buf) - w.limit
		for cut < len(w.buf) && !utf8.RuneStart(w.buf[cut]) {
			cut++
		}
		w.buf = w.buf[cut:]
	}
	return len(p), nil
}

func (w *tailWriter) Close() error { return nil }

func (w *tailWriter) String() string { return string(w.buf) }

// WriteConfig 临时文件 + rename 原子写入（G7 约束），缩进便于人工排查
func (m *Manager) WriteConfig(singboxConfig json.RawMessage) error {
	if len(singboxConfig) == 0 {
		return fmt.Errorf("empty singbox config")
	}
	var buf []byte
	var err error
	if buf, err = json.MarshalIndent(singboxConfig, "", "  "); err != nil {
		return fmt.Errorf("marshal singbox config: %w", err)
	}
	dir := filepath.Dir(m.confPath)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return fmt.Errorf("mkdir config dir: %w", err)
	}
	tmp, err := os.CreateTemp(dir, ".config-*.json.tmp")
	if err != nil {
		return fmt.Errorf("create temp file: %w", err)
	}
	tmpName := tmp.Name()
	defer os.Remove(tmpName) // rename 成功后 Remove 是 no-op

	if _, err := tmp.Write(buf); err != nil {
		tmp.Close()
		return fmt.Errorf("write temp file: %w", err)
	}
	if err := tmp.Close(); err != nil {
		return fmt.Errorf("close temp file: %w", err)
	}
	if err := os.Rename(tmpName, m.confPath); err != nil {
		return fmt.Errorf("rename config: %w", err)
	}
	return nil
}

func nextBackoff(current time.Duration) time.Duration {
	if current <= 0 {
		return baseBackoff
	}
	if current*2 > maxBackoff {
		return maxBackoff
	}
	return current * 2
}
