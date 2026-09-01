package runner

import (
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"time"

	"github.com/sirupsen/logrus"

	"github.com/Nanako660/riricloud/apps/agent/internal/config"
	"github.com/Nanako660/riricloud/apps/agent/internal/poll"
	"github.com/Nanako660/riricloud/apps/agent/internal/singbox"
	"github.com/Nanako660/riricloud/apps/agent/internal/upgrade"
	"github.com/Nanako660/riricloud/apps/agent/internal/ws"
)

// Run 以前台方式启动 Agent，取消信号由调用方负责。
func Run(ctx context.Context, configPath, version string) error {
	cfg, err := config.LoadFrom(configPath)
	if err != nil {
		return err
	}

	log, closeLog, err := newLogger(cfg.LogPath)
	if err != nil {
		return err
	}
	defer closeLog()
	log.Infof("riri-agent starting, version=%s", version)

	if executable, err := os.Executable(); err == nil {
		if err := upgrade.CleanupStaleBackup(executable); err != nil {
			log.WithError(err).Warn("cleanup stale agent backup failed")
		}
	}

	singboxMgr := singbox.NewManager(ctx, cfg.SingboxConfPath, cfg.SingboxBinPath, logrus.NewEntry(log))
	if cfg.Mode == config.ModeHTTP {
		client := poll.NewClient(
			cfg.MasterURL,
			cfg.AgentToken,
			time.Duration(cfg.PollIntervalSecs)*time.Second,
			singboxMgr,
			version,
			runtime.GOOS+"/"+runtime.GOARCH,
			logrus.NewEntry(log),
		)
		client.Run(ctx)
	} else {
		client := ws.NewClient(
			cfg.MasterURL,
			cfg.AgentToken,
			time.Duration(cfg.HeartbeatSecs)*time.Second,
			singboxMgr,
			version,
			runtime.GOOS+"/"+runtime.GOARCH,
			logrus.NewEntry(log),
		)
		client.Run(ctx)
	}
	singboxMgr.Shutdown(5 * time.Second)
	log.Info("riri-agent stopped")
	return nil
}

func newLogger(path string) (*logrus.Logger, func(), error) {
	log := logrus.New()
	log.SetFormatter(&logrus.TextFormatter{FullTimestamp: true})
	if path == "" {
		return log, func() {}, nil
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return nil, nil, fmt.Errorf("create log directory: %w", err)
	}
	file, err := os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600)
	if err != nil {
		return nil, nil, fmt.Errorf("open log file: %w", err)
	}
	log.SetOutput(io.MultiWriter(os.Stdout, file))
	return log, func() {
		if err := file.Close(); err != nil {
			log.WithError(err).Warn("close log file failed")
		}
	}, nil
}
