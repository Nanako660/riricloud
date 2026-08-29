package singbox

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/sirupsen/logrus"
)

// stub 内核源码：check 子命令按配置校验（thisWillFailCheck 触发诊断输出）；run 读取
// crashAfterMs，首次运行后崩溃并留标记，验证 supervisor 拉起逻辑
const stubSource = `package main

import (
	"encoding/json"
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"
)

func readConf() []byte {
	conf := ""
	for i, a := range os.Args {
		if a == "-c" && i+1 < len(os.Args) {
			conf = os.Args[i+1]
		}
	}
	if conf == "" {
		return nil
	}
	b, err := os.ReadFile(conf)
	if err != nil {
		return nil
	}
	return b
}

func main() {
	for _, a := range os.Args {
		if a == "check" {
			b := readConf()
			if b != nil {
				var cfg struct {
					ThisWillFailCheck bool ` + "`json:\"thisWillFailCheck\"`" + `
				}
				if json.Unmarshal(b, &cfg) == nil && cfg.ThisWillFailCheck {
					fmt.Fprintln(os.Stderr, "ERROR: decode inbound: thisWillFailCheck=true")
					os.Exit(1)
				}
			}
			os.Exit(0)
		}
	}
	if b := readConf(); b != nil {
		var cfg struct {
			CrashAfterMs int ` + "`json:\"crashAfterMs\"`" + `
		}
		if json.Unmarshal(b, &cfg) == nil && cfg.CrashAfterMs > 0 {
			marker := ""
			for i, a := range os.Args {
				if a == "-c" && i+1 < len(os.Args) {
					marker = os.Args[i+1]
				}
			}
			marker += ".crashed"
			if _, err := os.Stat(marker); err != nil {
				_ = os.WriteFile(marker, []byte("1"), 0o600)
				time.Sleep(time.Duration(cfg.CrashAfterMs) * time.Millisecond)
				fmt.Fprintln(os.Stderr, "ERROR: stub kernel crashed by config")
				os.Exit(1)
			}
		}
	}
	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	select {
	case <-sig:
		os.Exit(0)
	case <-time.After(2 * time.Minute):
		os.Exit(2)
	}
}
`

var stubBin string

func TestMain(m *testing.M) {
	dir, err := os.MkdirTemp("", "singbox-stub")
	if err != nil {
		fmt.Fprintln(os.Stderr, "temp dir:", err)
		os.Exit(1)
	}
	src := filepath.Join(dir, "stub_kernel.go")
	if err := os.WriteFile(src, []byte(stubSource), 0o600); err != nil {
		fmt.Fprintln(os.Stderr, "write stub:", err)
		os.Exit(1)
	}
	out := filepath.Join(dir, "stub-kernel")
	if runtime.GOOS == "windows" {
		out += ".exe"
	}
	if b, err := exec.Command("go", "build", "-o", out, src).CombinedOutput(); err != nil {
		fmt.Fprintf(os.Stderr, "build stub kernel: %v\n%s", err, b)
		os.Exit(1)
	}
	stubBin = out
	code := m.Run()
	_ = os.RemoveAll(dir)
	os.Exit(code)
}

func silentLog() *logrus.Entry {
	l := logrus.New()
	l.SetLevel(logrus.PanicLevel)
	return logrus.NewEntry(l)
}

// newStubManager 构建使用 stub 内核的 Manager，测试结束后停止内核并回收 supervisor
func newStubManager(t *testing.T) *Manager {
	t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	m := NewManager(ctx, filepath.Join(t.TempDir(), "config.json"), stubBin, silentLog())
	t.Cleanup(func() {
		cancel()
		m.Shutdown(3 * time.Second)
	})
	return m
}

func waitFor(t *testing.T, timeout time.Duration, cond func() bool) {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if cond() {
			return
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatal("condition not met before timeout")
}

func TestWriteConfigAtomicPersist(t *testing.T) {
	dir := t.TempDir()
	confPath := filepath.Join(dir, "config.json")
	m := &Manager{confPath: confPath}

	payload := json.RawMessage(`{"log":{"level":"info"},"inbounds":[]}`)
	if err := m.WriteConfig(payload); err != nil {
		t.Fatalf("WriteConfig: %v", err)
	}

	raw, err := os.ReadFile(confPath)
	if err != nil {
		t.Fatalf("read persisted config: %v", err)
	}
	var parsed map[string]any
	if err := json.Unmarshal(raw, &parsed); err != nil {
		t.Fatalf("persisted config invalid JSON: %v", err)
	}
	if _, ok := parsed["log"]; !ok {
		t.Fatal("persisted config lost 'log' field")
	}

	// 无残留临时文件
	entries, _ := os.ReadDir(dir)
	for _, e := range entries {
		if e.Name() != "config.json" {
			t.Fatalf("unexpected leftover file: %s", e.Name())
		}
	}
}

func TestWriteConfigRejectsEmpty(t *testing.T) {
	m := &Manager{confPath: filepath.Join(t.TempDir(), "config.json")}
	if err := m.WriteConfig(nil); err == nil {
		t.Fatal("expected error for empty config")
	}
}

func TestApplyConfigStartsKernel(t *testing.T) {
	m := newStubManager(t)
	if err := m.ApplyConfig(json.RawMessage(`{"log":{"level":"info"}}`), 1); err != nil {
		t.Fatalf("ApplyConfig: %v", err)
	}
	waitFor(t, 15*time.Second, m.Running)
	if m.Pid() <= 0 {
		t.Fatalf("expected positive pid, got %d", m.Pid())
	}
	st := m.Status()
	if !st.Running || st.AppliedConfigVersion != 1 || st.LastError != "" {
		t.Fatalf("unexpected status: %+v", st)
	}
}

func TestApplySameConfigSkipsRestart(t *testing.T) {
	m := newStubManager(t)
	cfg := json.RawMessage(`{"log":{"level":"info"}}`)
	if err := m.ApplyConfig(cfg, 1); err != nil {
		t.Fatalf("ApplyConfig: %v", err)
	}
	waitFor(t, 15*time.Second, m.Running)
	pid := m.Pid()

	if err := m.ApplyConfig(cfg, 2); err != nil {
		t.Fatalf("re-ApplyConfig: %v", err)
	}
	time.Sleep(500 * time.Millisecond)
	if !m.Running() || m.Pid() != pid {
		t.Fatalf("identical config should not restart kernel: running=%v pid %d -> %d", m.Running(), pid, m.Pid())
	}
}

func TestApplyChangedConfigRestartsKernel(t *testing.T) {
	m := newStubManager(t)
	if err := m.ApplyConfig(json.RawMessage(`{"log":{"level":"info"}}`), 1); err != nil {
		t.Fatalf("ApplyConfig: %v", err)
	}
	waitFor(t, 15*time.Second, m.Running)
	oldPid := m.Pid()

	if err := m.ApplyConfig(json.RawMessage(`{"log":{"level":"debug"}}`), 2); err != nil {
		t.Fatalf("ApplyConfig changed: %v", err)
	}
	waitFor(t, 8*time.Second, func() bool { return m.Running() && m.Pid() != oldPid })
}

// 配置变更引发的主动重启：旧内核被杀退出码非 0（Windows Kill 路径），
// 但属预期停止——不得写 lastError、不得计入崩溃退避
func TestPlannedRestartNotRecordedAsError(t *testing.T) {
	m := newStubManager(t)
	if err := m.ApplyConfig(json.RawMessage(`{"log":{"level":"info"}}`), 1); err != nil {
		t.Fatalf("ApplyConfig: %v", err)
	}
	waitFor(t, 15*time.Second, m.Running)

	// 连续两次配置变更：第一次重启后 5 秒内再变（uptime < stableUptime，旧逻辑必计退避）
	time.Sleep(2 * time.Second)
	if err := m.ApplyConfig(json.RawMessage(`{"log":{"level":"warn"}}`), 2); err != nil {
		t.Fatalf("ApplyConfig changed: %v", err)
	}
	waitFor(t, 8*time.Second, func() bool {
		st := m.Status()
		return st.Running && st.LastError == ""
	})
	st := m.Status()
	if st.LastError != "" {
		t.Fatalf("planned restart must not set lastError, got %q", st.LastError)
	}
	// 主动重启不退避：新内核应立即拉起而非等 backoff
	if delay := m.pendingBackoff(); delay > 0 {
		t.Fatalf("planned restart must not schedule backoff, got %v", delay)
	}

	// 5 秒内再次变更：确认重启路径持续干净（覆盖 backoff 已清零的分支）
	time.Sleep(2 * time.Second)
	if err := m.ApplyConfig(json.RawMessage(`{"log":{"level":"error"}}`), 3); err != nil {
		t.Fatalf("ApplyConfig changed again: %v", err)
	}
	waitFor(t, 8*time.Second, func() bool {
		st := m.Status()
		return st.Running && st.LastError == "" && st.AppliedConfigVersion == 3
	})
}

// 非预期崩溃仍要记录 lastError（回归保护）；退避重拉成功后错误清除，
// 避免内核已恢复正常时面板显示陈旧失败原因
func TestCrashRecordsErrorThenClearsOnRecovery(t *testing.T) {
	m := newStubManager(t)
	if err := m.ApplyConfig(json.RawMessage(`{"crashAfterMs":150}`), 1); err != nil {
		t.Fatalf("ApplyConfig: %v", err)
	}
	// 等崩溃已被记录（不能以 !Running 判定：拉起前的间隙也满足，且重拉是立即的）
	waitFor(t, 8*time.Second, func() bool { return m.Status().LastError != "" })
	// 退避（1s）后重拉成功：marker 已存在，stub 常驻；lastError 被清除
	waitFor(t, 8*time.Second, func() bool {
		st := m.Status()
		return st.Running && st.LastError == ""
	})
}

func TestKernelCrashAutoRestart(t *testing.T) {
	m := newStubManager(t)
	// 配置携带 crashAfterMs：stub 首次运行崩溃并写 .crashed 标记，重启后标记存在则常驻
	if err := m.ApplyConfig(json.RawMessage(`{"crashAfterMs":150}`), 1); err != nil {
		t.Fatalf("ApplyConfig: %v", err)
	}
	marker := filepath.Join(filepath.Dir(m.confPath), "config.json.crashed")
	waitFor(t, 8*time.Second, func() bool {
		_, err := os.Stat(marker)
		return err == nil
	})
	// 必须先观察到内核真的退出（排除原进程尚未崩溃的空洞通过），再等 supervisor 重拉
	waitFor(t, 8*time.Second, func() bool { return !m.Running() })
	waitFor(t, 15*time.Second, m.Running)
	if m.Pid() <= 0 {
		t.Fatalf("expected kernel respawned, pid=%d", m.Pid())
	}
}

func TestApplyConfigCheckFailRollsBackToLastGood(t *testing.T) {
	m := newStubManager(t)
	good := json.RawMessage(`{"log":{"level":"info"}}`)
	if err := m.ApplyConfig(good, 1); err != nil {
		t.Fatalf("ApplyConfig good: %v", err)
	}
	waitFor(t, 15*time.Second, m.Running)
	pid := m.Pid()

	// stub 内核对未知子命令一律以退出码 2 结束：check 阶段即失败
	bad := json.RawMessage(`{"crashAfterMs":0,"thisWillFailCheck":true}`)
	err := m.ApplyConfig(bad, 2)
	if err == nil {
		t.Fatal("expected check failure for bad config")
	}

	// 内核不受影响：仍在运行且 PID 未变
	time.Sleep(300 * time.Millisecond)
	if !m.Running() || m.Pid() != pid {
		t.Fatalf("kernel should keep running with last good config: running=%v pid %d -> %d", m.Running(), pid, m.Pid())
	}
	st := m.Status()
	if st.AppliedConfigVersion != 1 {
		t.Fatalf("applied version = %d, want stay at 1", st.AppliedConfigVersion)
	}
	if st.LastError == "" {
		t.Fatal("expected lastError recorded for check failure")
	}
	// 磁盘回滚为 lastGood 配置
	raw, readErr := os.ReadFile(m.confPath)
	if readErr != nil {
		t.Fatalf("read config: %v", readErr)
	}
	var persisted map[string]any
	if err := json.Unmarshal(raw, &persisted); err != nil {
		t.Fatalf("persisted config invalid: %v", err)
	}
	if _, ok := persisted["thisWillFailCheck"]; ok {
		t.Fatal("bad config should not persist on disk")
	}
	if _, ok := persisted["log"]; !ok {
		t.Fatal("last good config should be restored on disk")
	}

	// 下发合法配置可恢复：lastError 清空、新配置生效且上报版本推进
	if err := m.ApplyConfig(json.RawMessage(`{"log":{"level":"warn"}}`), 3); err != nil {
		t.Fatalf("ApplyConfig recover: %v", err)
	}
	waitFor(t, 8*time.Second, func() bool {
		st := m.Status()
		return st.Running && st.LastError == "" && st.AppliedConfigVersion == 3
	})
}

func TestTailStringKeepsTailUTF8(t *testing.T) {
	long := strings.Repeat("a", 100) + "尾部消息"
	// limit 落在多字节符中间时按 UTF-8 边界向后收缩，保证结果由完整字符组成
	got := tailString(long, 9)
	for _, r := range got {
		if r == 0xFFFD {
			t.Fatalf("tail contains replacement char: %q", got)
		}
	}
	if !strings.HasSuffix(long, got) {
		t.Fatalf("tail %q must be a suffix of input", got)
	}
	if !strings.Contains(got, "消息") {
		t.Fatalf("tail %q should keep the trailing characters", got)
	}
	if got := tailString("short", 8); got != "short" {
		t.Fatalf("short string should pass through, got %q", got)
	}
	if got := tailString("", 8); got != "" {
		t.Fatalf("empty string should pass through, got %q", got)
	}
}

func TestTailWriterDropsHead(t *testing.T) {
	w := newTailWriter(16)
	for i := 0; i < 10; i++ {
		if _, err := w.Write([]byte("0123456789")); err != nil {
			t.Fatalf("write: %v", err)
		}
	}
	if got := len(w.String()); got > 16 {
		t.Fatalf("tail writer buffer = %d bytes, want <= 16", got)
	}
	if !strings.HasSuffix(w.String(), "0123456789") {
		t.Fatalf("tail writer should keep the most recent writes, got %q", w.String())
	}
}

func TestShutdownStopsKernel(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	m := NewManager(ctx, filepath.Join(t.TempDir(), "config.json"), stubBin, silentLog())
	if err := m.ApplyConfig(json.RawMessage(`{"log":{"level":"info"}}`), 1); err != nil {
		t.Fatalf("ApplyConfig: %v", err)
	}
	waitFor(t, 15*time.Second, m.Running)

	cancel()
	m.Shutdown(5 * time.Second)
	if m.Running() {
		t.Fatal("kernel should be stopped after shutdown")
	}
}
