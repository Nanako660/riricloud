// Package singbox 负责 Sing-box 配置的持久化与（后续阶段的）内核生命周期管理。
package singbox

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

// Manager 配置落盘器：config_sync 到达后原子写入
type Manager struct {
	confPath string
}

func NewManager(confPath string) *Manager {
	return &Manager{confPath: confPath}
}

// WriteConfig 临时文件 + rename 原子写入（G7 约束），缩进便于人工排查
func (m *Manager) WriteConfig(singboxConfig json.RawMessage) error {
	if len(singboxConfig) == 0 {
		return fmt.Errorf("empty singbox config")
	}
	var buf []byte
	var err error
	if buf, err = json.MarshalIndent(singboxConfig, "", "  "); err != nil {
		return fmt.Errorf("marshal singbox config: %w", err)
	}
	dir := filepath.Dir(m.confPath)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return fmt.Errorf("mkdir config dir: %w", err)
	}
	tmp, err := os.CreateTemp(dir, ".config-*.json.tmp")
	if err != nil {
		return fmt.Errorf("create temp file: %w", err)
	}
	tmpName := tmp.Name()
	defer os.Remove(tmpName) // rename 成功后 Remove 是 no-op

	if _, err := tmp.Write(buf); err != nil {
		tmp.Close()
		return fmt.Errorf("write temp file: %w", err)
	}
	if err := tmp.Close(); err != nil {
		return fmt.Errorf("close temp file: %w", err)
	}
	if err := os.Rename(tmpName, m.confPath); err != nil {
		return fmt.Errorf("rename config: %w", err)
	}
	return nil
}
