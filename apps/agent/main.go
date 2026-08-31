package main

import (
	"context"
	"os"
	"os/signal"
	"runtime"
	"syscall"
	"time"

	"github.com/sirupsen/logrus"

	"github.com/Nanako660/riricloud/apps/agent/internal/config"
	"github.com/Nanako660/riricloud/apps/agent/internal/poll"
	"github.com/Nanako660/riricloud/apps/agent/internal/singbox"
	"github.com/Nanako660/riricloud/apps/agent/internal/upgrade"
	"github.com/Nanako660/riricloud/apps/agent/internal/ws"
)

// Version 由构建时注入：-ldflags "-X main.Version=$(node -p "require('./package.json').version")"
var Version = "dev"

func main() {
	log := logrus.New()
	log.SetFormatter(&logrus.TextFormatter{FullTimestamp: true})
	log.Infof("riri-agent starting, version=%s", Version)

	cfg, err := config.Load()
	if err != nil {
		log.WithError(err).Fatal("load config")
	}
	if executable, err := os.Executable(); err == nil {
		if err := upgrade.CleanupStaleBackup(executable); err != nil {
			log.WithError(err).Warn("cleanup stale agent backup failed")
		}
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	singboxMgr := singbox.NewManager(ctx, cfg.SingboxConfPath, cfg.SingboxBinPath, logrus.NewEntry(log))
	if cfg.Mode == config.ModeHTTP {
		client := poll.NewClient(
			cfg.MasterURL,
			cfg.AgentToken,
			time.Duration(cfg.PollIntervalSecs)*time.Second,
			singboxMgr,
			Version,
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
			Version,
			runtime.GOOS+"/"+runtime.GOARCH,
			logrus.NewEntry(log),
		)
		client.Run(ctx)
	}
	// WS 已断开：终止内核子进程并等待 supervisor 退出，避免孤儿进程（G6）
	singboxMgr.Shutdown(5 * time.Second)
	log.Info("riri-agent stopped")
	os.Exit(0)
}
