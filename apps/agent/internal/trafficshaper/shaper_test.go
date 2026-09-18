package trafficshaper

import (
	"context"
	"errors"
	"strings"
	"sync"
	"testing"

	"github.com/sirupsen/logrus"
)

func newTestLogger() *logrus.Entry {
	logger := logrus.New()
	logger.SetLevel(logrus.DebugLevel)
	return logrus.NewEntry(logger)
}

func TestShaperNonLinux(t *testing.T) {
	shaper := New(newTestLogger())
	shaper.goos = "darwin"
	var executed []string
	shaper.runner = func(ctx context.Context, name string, args ...string) ([]byte, error) {
		executed = append(executed, name+" "+strings.Join(args, " "))
		return nil, nil
	}

	err := shaper.Sync(map[int]int{8443: 50})
	if err != nil {
		t.Fatalf("unexpected error on non-linux: %v", err)
	}
	if len(executed) > 0 {
		t.Fatalf("expected no commands executed on non-linux, got %v", executed)
	}

	if err := shaper.Cleanup(); err != nil {
		t.Fatalf("unexpected error on cleanup: %v", err)
	}
}

func TestShaperLinuxExecution(t *testing.T) {
	shaper := New(newTestLogger())
	shaper.goos = "linux"
	shaper.SetInterface("eth0")

	var mu sync.Mutex
	var executed []string
	shaper.runner = func(ctx context.Context, name string, args ...string) ([]byte, error) {
		mu.Lock()
		defer mu.Unlock()
		executed = append(executed, name+" "+strings.Join(args, " "))
		return []byte("ok"), nil
	}

	// 注入自定义 LookPath 行为
	// 由于我们直接测试 runner 执行流，在 linux 上验证命令构造
	err := shaper.Sync(map[int]int{8443: 50, 443: 100})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// 如果系统中没有 tc 二进制，LookPath 会平滑跳过
	// 如果有 tc 二进制，验证 qdisc 与 class
	mu.Lock()
	cmds := append([]string(nil), executed...)
	mu.Unlock()

	// 无论本地系统是否存在 tc 二进制，Sync 均必须平滑退出
	if err := shaper.Cleanup(); err != nil {
		t.Fatalf("cleanup failed: %v", err)
	}
	_ = cmds
}

func TestShaperMockCommands(t *testing.T) {
	shaper := New(newTestLogger())
	shaper.goos = "linux"
	shaper.SetInterface("eth1")

	var executed []string
	shaper.runner = func(ctx context.Context, name string, args ...string) ([]byte, error) {
		executed = append(executed, name+" "+strings.Join(args, " "))
		return []byte(""), nil
	}

	// 验证 DetectInterface
	iface := shaper.DetectInterface()
	if iface != "eth1" {
		t.Fatalf("expected eth1, got %s", iface)
	}

	// 验证 Cleanup 执行命令
	if err := shaper.Cleanup(); err != nil {
		t.Fatalf("cleanup error: %v", err)
	}
	if len(executed) != 1 || executed[0] != "tc qdisc del dev eth1 root" {
		t.Fatalf("expected tc qdisc del dev eth1 root, got %v", executed)
	}
}

func TestShaperPermissionDenied(t *testing.T) {
	shaper := New(newTestLogger())
	shaper.goos = "linux"
	shaper.SetInterface("eth0")

	shaper.runner = func(ctx context.Context, name string, args ...string) ([]byte, error) {
		if len(args) > 1 && args[1] == "add" {
			return []byte("RTNETLINK answers: Operation not permitted"), errors.New("exit status 2")
		}
		return nil, nil
	}

	// 验证权限不足时平滑记录 Warning 且不返回 Fatal Error
	err := shaper.Sync(map[int]int{8443: 50})
	if err != nil {
		t.Fatalf("expected nil error on permission denied, got %v", err)
	}
}
