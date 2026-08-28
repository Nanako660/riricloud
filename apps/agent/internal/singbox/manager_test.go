package singbox

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestWriteConfigAtomicPersist(t *testing.T) {
	dir := t.TempDir()
	confPath := filepath.Join(dir, "config.json")
	m := NewManager(confPath)

	payload := json.RawMessage(`{"log":{"level":"info"},"inbounds":[]}`)
	if err := m.WriteConfig(payload); err != nil {
		t.Fatalf("WriteConfig: %v", err)
	}

	raw, err := os.ReadFile(confPath)
	if err != nil {
		t.Fatalf("read persisted config: %v", err)
	}
	var parsed map[string]any
	if err := json.Unmarshal(raw, &parsed); err != nil {
		t.Fatalf("persisted config invalid JSON: %v", err)
	}
	if _, ok := parsed["log"]; !ok {
		t.Fatal("persisted config lost 'log' field")
	}

	// 无残留临时文件
	entries, _ := os.ReadDir(dir)
	for _, e := range entries {
		if e.Name() != "config.json" {
			t.Fatalf("unexpected leftover file: %s", e.Name())
		}
	}
}

func TestWriteConfigRejectsEmpty(t *testing.T) {
	m := NewManager(filepath.Join(t.TempDir(), "config.json"))
	if err := m.WriteConfig(nil); err == nil {
		t.Fatal("expected error for empty config")
	}
}
