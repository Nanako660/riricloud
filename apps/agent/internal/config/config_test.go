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
	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if cfg.MasterWsURL != "ws://localhost:3000/ws/agent" {
		t.Fatalf("unexpected default master url: %s", cfg.MasterWsURL)
	}
	if cfg.HeartbeatSecs != 5 {
		t.Fatalf("unexpected default heartbeat: %d", cfg.HeartbeatSecs)
	}
}
