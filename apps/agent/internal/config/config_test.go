package config

import "testing"

func TestLoadRequiresToken(t *testing.T) {
	t.Setenv("AGENT_TOKEN", "")
	if _, err := Load(); err == nil {
		t.Fatal("expected error when AGENT_TOKEN missing")
	}
}

func TestLoadDefaults(t *testing.T) {
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
	if cfg.SingboxBinPath != "sing-box" {
		t.Fatalf("unexpected default sing-box path: %s", cfg.SingboxBinPath)
	}
	if cfg.PollIntervalSecs != 15 {
		t.Fatalf("unexpected default poll interval: %d", cfg.PollIntervalSecs)
	}
}

func TestLoadInfersHTTPModeAndSupportsExplicitMode(t *testing.T) {
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

func TestLoadRejectsInvalidPollInterval(t *testing.T) {
	t.Setenv("AGENT_TOKEN", "tok")
	t.Setenv("MASTER_URL", "http://localhost:3000")
	t.Setenv("AGENT_MODE", "http")
	t.Setenv("POLL_INTERVAL_SECS", "2")
	if _, err := Load(); err == nil {
		t.Fatal("expected invalid poll interval error")
	}
}
