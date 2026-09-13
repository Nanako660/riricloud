package runner

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestNewLoggerFileOnlyReceivesLogs(t *testing.T) {
	path := filepath.Join(t.TempDir(), "agent.log")
	log, closeLog, err := newLogger(path, false)
	if err != nil {
		t.Fatalf("newLogger: %v", err)
	}
	log.Info("service-mode log line")
	closeLog()

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(data), "service-mode log line") {
		t.Fatalf("expected log line in file, got: %q", string(data))
	}
}

func TestNewLoggerFileFirstSurvivesStdout(t *testing.T) {
	path := filepath.Join(t.TempDir(), "agent.log")
	log, closeLog, err := newLogger(path, true)
	if err != nil {
		t.Fatalf("newLogger: %v", err)
	}
	log.Info("foreground log line")
	closeLog()

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(data), "foreground log line") {
		t.Fatalf("expected log line in file, got: %q", string(data))
	}
}

func TestStdoutUsableMatchesPlatformExpectation(t *testing.T) {
	// 测试进程总是运行在交互上下文（非 SCM 服务），任何平台都应判定 stdout 可用。
	if !stdoutUsable() {
		t.Fatal("expected stdout usable in interactive test process")
	}
}
