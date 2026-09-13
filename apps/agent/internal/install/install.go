package install

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"

	"github.com/Nanako660/riricloud/apps/agent/internal/config"
	"github.com/Nanako660/riricloud/apps/agent/internal/kernel"
	"github.com/Nanako660/riricloud/apps/agent/internal/system"
)

type Options struct {
	Token          string
	Master         string
	Mode           string
	ConfigPath     string
	DataDir        string
	SingboxURL     string
	SingboxSource  string
	SingboxVersion string
	NoStart        bool
}

func Run(ctx context.Context, options Options) (*config.Config, error) {
	if strings.TrimSpace(options.Token) == "" {
		return nil, fmt.Errorf("--token is required")
	}
	if strings.TrimSpace(options.Master) == "" {
		return nil, fmt.Errorf("--master is required")
	}
	mode, err := config.ResolveMode(options.Master, options.Mode)
	if err != nil {
		return nil, err
	}
	masterURL, err := config.NormalizeMasterURL(options.Master, mode)
	if err != nil {
		return nil, err
	}
	paths := config.DefaultPaths()
	configPath := strings.TrimSpace(options.ConfigPath)
	if configPath == "" {
		configPath = paths.ConfigPath
	}
	dataDir := strings.TrimSpace(options.DataDir)
	if dataDir == "" {
		dataDir = paths.DataDir
		if configPath != paths.ConfigPath {
			dataDir = filepath.Dir(configPath)
		}
	}
	if err := os.MkdirAll(dataDir, 0o755); err != nil {
		return nil, fmt.Errorf("create Agent data directory: %w", err)
	}
	singboxPath := filepath.Join(dataDir, executableName("sing-box"))
	if err := downloadSingbox(ctx, options, masterURL, singboxPath); err != nil {
		return nil, err
	}

	cfg := &config.Config{
		MasterURL:        masterURL,
		Mode:             mode,
		AgentToken:       options.Token,
		SingboxConfPath:  filepath.Join(dataDir, "config.json"),
		SingboxBinPath:   singboxPath,
		HeartbeatSecs:    5,
		PollIntervalSecs: 15,
		LogPath:          filepath.Join(dataDir, "agent.log"),
		ConfigPath:       configPath,
	}
	if err := config.Save(configPath, cfg); err != nil {
		return nil, err
	}

	executable, err := os.Executable()
	if err != nil {
		return nil, fmt.Errorf("resolve Agent executable: %w", err)
	}
	manager := system.NewServiceManager(executable, configPath)
	// 重复安装保持幂等，便于轮换凭证或替换 Agent 二进制。
	serviceState, err := manager.Status()
	if err != nil {
		return nil, err
	}
	if serviceState != "not-installed" {
		if err := manager.Stop(); err != nil && serviceState == "running" {
			return nil, err
		}
		if err := manager.Uninstall(); err != nil {
			return nil, err
		}
	}
	if err := manager.Install(); err != nil {
		return nil, err
	}
	if !options.NoStart {
		if err := manager.Start(); err != nil {
			return nil, err
		}
	}
	return cfg, nil
}

func downloadSingbox(ctx context.Context, options Options, masterURL, destination string) error {
	return kernel.Download(ctx, kernel.Options{
		Source:      options.SingboxSource,
		URL:         options.SingboxURL,
		Version:     options.SingboxVersion,
		MasterURL:   masterURL,
		Token:       options.Token,
		Destination: destination,
	})
}

func executableName(name string) string {
	if runtime.GOOS == "windows" {
		return name + ".exe"
	}
	return name
}
