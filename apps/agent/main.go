package main

import (
	"context"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/sirupsen/logrus"

	"github.com/Nanako660/riricloud/apps/agent/internal/config"
	"github.com/Nanako660/riricloud/apps/agent/internal/singbox"
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

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	singboxMgr := singbox.NewManager(cfg.SingboxConfPath)
	client := ws.NewClient(
		cfg.MasterWsURL,
		cfg.AgentToken,
		time.Duration(cfg.HeartbeatSecs)*time.Second,
		singboxMgr,
		logrus.NewEntry(log),
	)

	client.Run(ctx)
	log.Info("riri-agent stopped")
	os.Exit(0)
}
