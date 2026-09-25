package runner

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"context"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/sirupsen/logrus"

	"github.com/Nanako660/riricloud/apps/agent/internal/config"
	"github.com/Nanako660/riricloud/apps/agent/internal/embedded"
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

func TestNewLoggerWithRotationLimitsFiles(t *testing.T) {
	path := filepath.Join(t.TempDir(), "agent.log")
	log, closeLog, _, err := newLoggerWithRotation(path, false, 1, 2)
	if err != nil {
		t.Fatalf("newLoggerWithRotation: %v", err)
	}
	for i := 0; i < 3; i++ {
		log.Info(strings.Repeat("x", 700_000))
	}
	closeLog()

	entries, err := os.ReadDir(filepath.Dir(path))
	if err != nil {
		t.Fatal(err)
	}
	count := 0
	for _, entry := range entries {
		if strings.HasPrefix(entry.Name(), "agent.log") {
			count++
		}
	}
	if count > 2 {
		t.Fatalf("expected at most two log files, got %d", count)
	}
}

func TestStdoutUsableMatchesPlatformExpectation(t *testing.T) {
	// 测试进程总是运行在交互上下文（非 SCM 服务），任何平台都应判定 stdout 可用。
	if !stdoutUsable() {
		t.Fatal("expected stdout usable in interactive test process")
	}
}

func TestStartKernelBootstrapOverwritesStaleOnDiskKernelFromEmbedded(t *testing.T) {
	t.Setenv("SINGBOX_BINARY_PATH", "")
	dir := t.TempDir()
	binPath := filepath.Join(dir, embedded.MainExecutableName())

	// 模拟存量节点磁盘上已有旧版未打补丁的 sing-box
	if err := os.WriteFile(binPath, []byte("legacy-unpatched-singbox"), 0o755); err != nil {
		t.Fatal(err)
	}

	// 构造内嵌新内核归档
	var buf bytes.Buffer
	gw := gzip.NewWriter(&buf)
	tw := tar.NewWriter(gw)
	newKernelPayload := []byte("patched-embedded-singbox-v2")
	hdr := &tar.Header{
		Name:     "sing-box",
		Mode:     0o755,
		Size:     int64(len(newKernelPayload)),
		Typeflag: tar.TypeReg,
	}
	if err := tw.WriteHeader(hdr); err != nil {
		t.Fatal(err)
	}
	if _, err := tw.Write(newKernelPayload); err != nil {
		t.Fatal(err)
	}
	if err := tw.Close(); err != nil {
		t.Fatal(err)
	}
	if err := gw.Close(); err != nil {
		t.Fatal(err)
	}

	restore := embedded.SetArchiveBytesForTest(buf.Bytes())
	defer restore()

	logger := logrus.New()
	logger.SetOutput(io.Discard)
	cfg := &config.Config{SingboxBinPath: binPath}
	startKernelBootstrap(context.Background(), cfg, Options{}, logrus.NewEntry(logger))

	actual, err := os.ReadFile(binPath)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(actual, newKernelPayload) {
		t.Fatalf("expected stale on-disk sing-box to be overwritten by embedded kernel, got %q", string(actual))
	}
}
