package restart

import (
	"errors"
	"io"
	"strings"
	"testing"

	"github.com/sirupsen/logrus"
)

type fakeRestarter struct {
	status        string
	statusErr     error
	restartErr    error
	restartCalled bool
}

func (f *fakeRestarter) Status() (string, error) { return f.status, f.statusErr }

func (f *fakeRestarter) Restart() error {
	f.restartCalled = true
	return f.restartErr
}

func quietEntry() *logrus.Entry {
	log := logrus.New()
	log.SetOutput(io.Discard)
	return logrus.NewEntry(log)
}

func newTestManager(t *testing.T, factory ServiceFactory, selfSpawn func() error) *Manager {
	t.Helper()
	manager := NewManager(factory, selfSpawn, quietEntry())
	manager.delay = 0
	return manager
}

func TestRestartAndExitPrefersServiceRestart(t *testing.T) {
	restarter := &fakeRestarter{status: "running", restartErr: errors.New("restart failed")}
	var selfSpawnCalls int
	manager := newTestManager(t,
		func() (Restarter, error) { return restarter, nil },
		func() error { selfSpawnCalls++; return nil },
	)
	if err := manager.RestartAndExit(); err != nil {
		t.Fatalf("expected nil error when self spawn succeeds, got %v", err)
	}
	if !restarter.restartCalled {
		t.Fatal("expected service restart to be attempted first")
	}
	if selfSpawnCalls != 1 {
		t.Fatalf("expected self spawn fallback after service restart failure, calls=%d", selfSpawnCalls)
	}
}

func TestRestartAndExitSelfSpawnWhenServiceNotInstalled(t *testing.T) {
	restarter := &fakeRestarter{status: "not-installed"}
	var selfSpawnCalls int
	manager := newTestManager(t,
		func() (Restarter, error) { return restarter, nil },
		func() error { selfSpawnCalls++; return nil },
	)
	if err := manager.RestartAndExit(); err != nil {
		t.Fatalf("expected nil error when self spawn succeeds, got %v", err)
	}
	if restarter.restartCalled {
		t.Fatal("expected service restart to be skipped for not-installed service")
	}
	if selfSpawnCalls != 1 {
		t.Fatalf("expected self spawn to be invoked, calls=%d", selfSpawnCalls)
	}
}

func TestRestartAndExitSelfSpawnWhenStatusCheckFails(t *testing.T) {
	restarter := &fakeRestarter{statusErr: errors.New("systemctl unavailable")}
	var selfSpawnCalls int
	manager := newTestManager(t,
		func() (Restarter, error) { return restarter, nil },
		func() error { selfSpawnCalls++; return nil },
	)
	if err := manager.RestartAndExit(); err != nil {
		t.Fatalf("expected nil error when self spawn succeeds, got %v", err)
	}
	if restarter.restartCalled {
		t.Fatal("expected service restart to be skipped when status check fails")
	}
	if selfSpawnCalls != 1 {
		t.Fatalf("expected self spawn to be invoked, calls=%d", selfSpawnCalls)
	}
}

func TestRestartAndExitFallsThroughWhenServiceRestartSucceeds(t *testing.T) {
	// 服务重启返回但进程仍存活（异常环境）时，必须继续自拉起，确保新二进制接管。
	restarter := &fakeRestarter{status: "running"}
	var selfSpawnCalls int
	manager := newTestManager(t,
		func() (Restarter, error) { return restarter, nil },
		func() error { selfSpawnCalls++; return nil },
	)
	if err := manager.RestartAndExit(); err != nil {
		t.Fatalf("expected nil error when self spawn succeeds, got %v", err)
	}
	if !restarter.restartCalled || selfSpawnCalls != 1 {
		t.Fatalf("expected fall-through to self spawn, restart=%v calls=%d", restarter.restartCalled, selfSpawnCalls)
	}
}

func TestRestartAndExitReturnsErrorWhenBothPathsFail(t *testing.T) {
	restarter := &fakeRestarter{status: "running", restartErr: errors.New("restart failed")}
	manager := newTestManager(t,
		func() (Restarter, error) { return restarter, nil },
		func() error { return errors.New("spawn failed") },
	)
	err := manager.RestartAndExit()
	if err == nil {
		t.Fatal("expected aggregated error when both restart paths fail")
	}
	if !strings.Contains(err.Error(), "restart failed") || !strings.Contains(err.Error(), "spawn failed") {
		t.Fatalf("expected aggregated error to contain both failures, got %v", err)
	}
}
