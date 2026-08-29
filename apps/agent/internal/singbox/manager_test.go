package singbox

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"testing"
	"time"

	"github.com/sirupsen/logrus"
)

// stub 内核源码：读取 -c 配置中的 crashAfterMs，首次运行后崩溃并留标记，验证 supervisor 拉起逻辑
const stubSource = `package main

import (
	"encoding/json"
	"os"
	"os/signal"
	"syscall"
	"time"
)

func main() {
	conf := ""
	for i, a := range os.Args {
		if a == "-c" && i+1 < len(os.Args) {
			conf = os.Args[i+1]
		}
	}
	if conf != "" {
		if b, err := os.ReadFile(conf); err == nil {
			var cfg struct {
				CrashAfterMs int ` + "`json:\"crashAfterMs\"`" + `
			}
			if json.Unmarshal(b, &cfg) == nil && cfg.CrashAfterMs > 0 {
				marker := conf + ".crashed"
				if _, err := os.Stat(marker); err != nil {
					_ = os.WriteFile(marker, []byte("1"), 0o600)
					time.Sleep(time.Duration(cfg.CrashAfterMs) * time.Millisecond)
					os.Exit(1)
				}
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
	if err := m.ApplyConfig(json.RawMessage(`{"log":{"level":"info"}}`)); err != nil {
		t.Fatalf("ApplyConfig: %v", err)
	}
	waitFor(t, 15*time.Second, m.Running)
	if m.Pid() <= 0 {
		t.Fatalf("expected positive pid, got %d", m.Pid())
	}
}

func TestApplySameConfigSkipsRestart(t *testing.T) {
	m := newStubManager(t)
	cfg := json.RawMessage(`{"log":{"level":"info"}}`)
	if err := m.ApplyConfig(cfg); err != nil {
		t.Fatalf("ApplyConfig: %v", err)
	}
	waitFor(t, 15*time.Second, m.Running)
	pid := m.Pid()

	if err := m.ApplyConfig(cfg); err != nil {
		t.Fatalf("re-ApplyConfig: %v", err)
	}
	time.Sleep(500 * time.Millisecond)
	if !m.Running() || m.Pid() != pid {
		t.Fatalf("identical config should not restart kernel: running=%v pid %d -> %d", m.Running(), pid, m.Pid())
	}
}

func TestApplyChangedConfigRestartsKernel(t *testing.T) {
	m := newStubManager(t)
	if err := m.ApplyConfig(json.RawMessage(`{"log":{"level":"info"}}`)); err != nil {
		t.Fatalf("ApplyConfig: %v", err)
	}
	waitFor(t, 15*time.Second, m.Running)
	oldPid := m.Pid()

	if err := m.ApplyConfig(json.RawMessage(`{"log":{"level":"debug"}}`)); err != nil {
		t.Fatalf("ApplyConfig changed: %v", err)
	}
	waitFor(t, 8*time.Second, func() bool { return m.Running() && m.Pid() != oldPid })
}

func TestKernelCrashAutoRestart(t *testing.T) {
	m := newStubManager(t)
	// 配置携带 crashAfterMs：stub 首次运行崩溃并写 .crashed 标记，重启后标记存在则常驻
	if err := m.ApplyConfig(json.RawMessage(`{"crashAfterMs":150}`)); err != nil {
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

func TestShutdownStopsKernel(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	m := NewManager(ctx, filepath.Join(t.TempDir(), "config.json"), stubBin, silentLog())
	if err := m.ApplyConfig(json.RawMessage(`{"log":{"level":"info"}}`)); err != nil {
		t.Fatalf("ApplyConfig: %v", err)
	}
	waitFor(t, 15*time.Second, m.Running)

	cancel()
	m.Shutdown(5 * time.Second)
	if m.Running() {
		t.Fatal("kernel should be stopped after shutdown")
	}
}
