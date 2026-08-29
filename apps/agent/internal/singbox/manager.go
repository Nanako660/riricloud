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
	"sync"
	"syscall"
	"time"

	"github.com/sirupsen/logrus"
)

const (
	stopGrace    = 5 * time.Second  // 优雅停止宽限：SIGTERM 后等待退出的时限
	stableUptime = 30 * time.Second // 稳定运行阈值：超过则清零退避，视为正常重启
	baseBackoff  = time.Second      // 崩溃/启动失败退避起点
	maxBackoff   = 60 * time.Second // 退避封顶
)

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
	appliedConf []byte        // 当前子进程使用的配置（字节比对避免无谓重启）
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

// ApplyConfig 校验并原子落盘新配置；内容变化时唤醒 supervisor 使其生效（重启内核）。
// 拉起失败（如内核二进制缺失）不在此返回错误：supervisor 按退避持续重试，Agent 本体保持存活。
func (m *Manager) ApplyConfig(raw json.RawMessage) error {
	if len(raw) == 0 {
		return fmt.Errorf("empty singbox config")
	}
	if err := m.WriteConfig(raw); err != nil {
		return err
	}
	m.mu.Lock()
	m.desiredConf = append([]byte(nil), raw...)
	m.wantRun = true
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
	wantRun, desired := m.wantRun, m.desiredConf
	m.mu.Unlock()

	if !wantRun {
		m.gracefulStopCurrent()
		return 0
	}
	if m.Running() && m.confMatches(desired) {
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
	if err := m.spawn(desired); err != nil {
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

// spawn 拉起内核子进程；stdout/stderr 接入日志，退出通知交给 waiter goroutine。
func (m *Manager) spawn(conf []byte) error {
	dir := filepath.Dir(m.confPath)
	cmd := exec.Command(m.binPath, "run", "-c", m.confPath, "-D", dir)
	stdout := m.log.WriterLevel(logrus.InfoLevel)
	stderr := m.log.WriterLevel(logrus.WarnLevel)
	cmd.Stdout, cmd.Stderr = stdout, stderr
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
	m.mu.Unlock()
	m.log.WithField("pid", cmd.Process.Pid).Info("sing-box started")
	go m.awaitChild(cmd, exitC, time.Now(), stdout, stderr)
	return nil
}

// awaitChild 等待子进程退出并回收资源：按存活时长决定是否进入退避（G6 异常自动拉起）。
func (m *Manager) awaitChild(cmd *exec.Cmd, exitC chan struct{}, startedAt time.Time, stdout, stderr io.Closer) {
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
	m.log.WithError(err).WithField("retry_in", m.backoff.String()).Warn("sing-box start failed")
	return m.backoff
}

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
