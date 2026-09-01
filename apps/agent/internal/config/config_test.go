package config

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func isolateConfig(t *testing.T) string {
	t.Helper()
	root := t.TempDir()
	t.Setenv("RIRICLOUD_CONFIG_DIR", filepath.Join(root, "etc"))
	t.Setenv("RIRICLOUD_CONFIG_PATH", filepath.Join(root, "etc", "config.yaml"))
	t.Setenv("RIRICLOUD_DATA_DIR", filepath.Join(root, "var"))
	return root
}

func TestLoadRequiresToken(t *testing.T) {
	isolateConfig(t)
	t.Setenv("AGENT_TOKEN", "")
	if _, err := Load(); err == nil {
		t.Fatal("expected error when AGENT_TOKEN missing")
	}
}

func TestLoadDefaults(t *testing.T) {
	root := isolateConfig(t)
	t.Setenv("AGENT_TOKEN", "tok")
	t.Setenv("MASTER_URL", "")
	t.Setenv("MASTER_WS_URL", "")
	t.Setenv("AGENT_MODE", "")
	t.Setenv("POLL_INTERVAL_SECS", "")
	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if cfg.MasterURL != "ws://localhost:3000/ws/agent" || cfg.MasterWsURL != cfg.MasterURL {
		t.Fatalf("unexpected default master url: %s", cfg.MasterURL)
	}
	if cfg.Mode != ModeWS {
		t.Fatalf("unexpected default mode: %s", cfg.Mode)
	}
	if cfg.HeartbeatSecs != 5 {
		t.Fatalf("unexpected default heartbeat: %d", cfg.HeartbeatSecs)
	}
	if cfg.SingboxBinPath != filepath.Join(root, "var", executableName("sing-box")) {
		t.Fatalf("unexpected default sing-box path: %s", cfg.SingboxBinPath)
	}
	if cfg.PollIntervalSecs != 15 {
		t.Fatalf("unexpected default poll interval: %d", cfg.PollIntervalSecs)
	}
	if runtime.GOOS == "windows" && !strings.HasSuffix(cfg.SingboxBinPath, "sing-box.exe") {
		t.Fatal("windows sing-box path must have exe suffix")
	}
}

func TestLoadFromYAMLAndEnvironmentOverride(t *testing.T) {
	root := isolateConfig(t)
	path := filepath.Join(root, "config.yaml")
	file := &Config{
		MasterURL:        "https://master.example.com",
		Mode:             ModeHTTP,
		AgentToken:       "file-token",
		SingboxConfPath:  filepath.Join(root, "config.json"),
		SingboxBinPath:   filepath.Join(root, executableName("sing-box")),
		HeartbeatSecs:    8,
		PollIntervalSecs: 30,
		LogPath:          filepath.Join(root, "agent.log"),
	}
	if err := Save(path, file); err != nil {
		t.Fatalf("Save: %v", err)
	}
	t.Setenv("RIRICLOUD_CONFIG_PATH", path)
	t.Setenv("AGENT_TOKEN", "env-token")
	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load saved YAML: %v", err)
	}
	if cfg.AgentToken != "env-token" || cfg.MasterURL != file.MasterURL || cfg.PollIntervalSecs != 30 {
		t.Fatalf("unexpected loaded config: %+v", cfg)
	}
	if runtime.GOOS != "windows" {
		if info, err := os.Stat(path); err != nil || info.Mode().Perm()&0o077 != 0 {
			t.Fatalf("config file is not private: %v", err)
		}
	}
}

func TestLoadInfersHTTPModeAndSupportsExplicitMode(t *testing.T) {
	isolateConfig(t)
	t.Setenv("AGENT_TOKEN", "tok")
	t.Setenv("MASTER_URL", "https://master.example.com")
	t.Setenv("MASTER_WS_URL", "")
	t.Setenv("AGENT_MODE", "")
	t.Setenv("POLL_INTERVAL_SECS", "30")
	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load HTTP: %v", err)
	}
	if cfg.Mode != ModeHTTP || cfg.PollIntervalSecs != 30 {
		t.Fatalf("unexpected HTTP config: %+v", cfg)
	}

	t.Setenv("AGENT_MODE", "ws")
	if _, err := Load(); err == nil {
		t.Fatal("expected explicit ws mode to reject HTTPS URL")
	}
}

func TestLoadRejectsInvalidIntervals(t *testing.T) {
	isolateConfig(t)
	t.Setenv("AGENT_TOKEN", "tok")
	t.Setenv("MASTER_URL", "http://localhost:3000")
	t.Setenv("AGENT_MODE", "http")
	t.Setenv("POLL_INTERVAL_SECS", "2")
	if _, err := Load(); err == nil {
		t.Fatal("expected invalid poll interval error")
	}
}

func TestNormalizeMasterURL(t *testing.T) {
	ws, err := NormalizeMasterURL("https://master.example.com", ModeWS)
	if err != nil || ws != "wss://master.example.com/ws/agent" {
		t.Fatalf("unexpected ws URL: %s (%v)", ws, err)
	}
	httpURL, err := NormalizeMasterURL("wss://master.example.com/ws/agent", ModeHTTP)
	if err != nil || httpURL != "https://master.example.com" {
		t.Fatalf("unexpected HTTP URL: %s (%v)", httpURL, err)
	}
}
