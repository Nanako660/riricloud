package config

import (
	"errors"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"

	"gopkg.in/yaml.v3"
)

type Mode string

const (
	ModeWS   Mode = "ws"
	ModeHTTP Mode = "http"
)

const (
	unixConfigDir = "/etc/riri-agent"
	unixDataDir   = "/var/lib/riri-agent"
)

// Config 是落盘保存的 Agent 运行配置，环境变量仍可作为兼容与容器覆盖层。
type Config struct {
	MasterURL        string `yaml:"masterUrl"`
	Mode             Mode   `yaml:"mode"`
	AgentToken       string `yaml:"agentToken"`
	SingboxConfPath  string `yaml:"singboxConfPath"`
	SingboxBinPath   string `yaml:"singboxBinPath"`
	HeartbeatSecs    int    `yaml:"heartbeatSecs"`
	PollIntervalSecs int    `yaml:"pollIntervalSecs"`
	LogPath          string `yaml:"logPath"`

	// MasterWsURL 为旧调用方保留，不会持久化。
	MasterWsURL string `yaml:"-"`
	ConfigPath  string `yaml:"-"`
}

type Paths struct {
	ConfigPath      string
	DataDir         string
	LogPath         string
	SingboxConfPath string
	SingboxBinPath  string
}

func DefaultPaths() Paths {
	configDir := unixConfigDir
	dataDir := unixDataDir
	if runtime.GOOS == "windows" {
		programData := os.Getenv("ProgramData")
		if programData == "" {
			programData = filepath.Join(os.TempDir(), "RiriCloud")
		}
		configDir = filepath.Join(programData, "RiriCloud")
		dataDir = configDir
	}
	if value := strings.TrimSpace(os.Getenv("RIRICLOUD_CONFIG_DIR")); value != "" {
		configDir = value
	}
	if value := strings.TrimSpace(os.Getenv("RIRICLOUD_DATA_DIR")); value != "" {
		dataDir = value
	}
	configPath := filepath.Join(configDir, "config.yaml")
	if value := strings.TrimSpace(os.Getenv("RIRICLOUD_CONFIG_PATH")); value != "" {
		configPath = value
	}
	return Paths{
		ConfigPath:      configPath,
		DataDir:         dataDir,
		LogPath:         filepath.Join(dataDir, "agent.log"),
		SingboxConfPath: filepath.Join(dataDir, "config.json"),
		SingboxBinPath:  filepath.Join(dataDir, executableName("sing-box")),
	}
}

func Load() (*Config, error) {
	return LoadFrom(DefaultPaths().ConfigPath)
}

func LoadFrom(path string) (*Config, error) {
	path = strings.TrimSpace(path)
	if path == "" {
		path = DefaultPaths().ConfigPath
	}
	paths := DefaultPaths()
	dataDir := paths.DataDir
	if path != paths.ConfigPath {
		dataDir = filepath.Dir(path)
	}
	c := &Config{
		MasterURL:        "ws://localhost:3000/ws/agent",
		Mode:             "",
		SingboxConfPath:  filepath.Join(dataDir, "config.json"),
		SingboxBinPath:   filepath.Join(dataDir, executableName("sing-box")),
		HeartbeatSecs:    5,
		PollIntervalSecs: 15,
		LogPath:          filepath.Join(dataDir, "agent.log"),
		ConfigPath:       path,
	}

	data, err := os.ReadFile(path)
	if err == nil {
		if err := yaml.Unmarshal(data, c); err != nil {
			return nil, fmt.Errorf("decode config %s: %w", path, err)
		}
	} else if !errors.Is(err, os.ErrNotExist) {
		return nil, fmt.Errorf("read config %s: %w", path, err)
	}

	applyEnvironment(c)
	if c.SingboxConfPath == "" {
		c.SingboxConfPath = filepath.Join(dataDir, "config.json")
	}
	if c.SingboxBinPath == "" {
		c.SingboxBinPath = filepath.Join(dataDir, executableName("sing-box"))
	}
	if c.LogPath == "" {
		c.LogPath = filepath.Join(dataDir, "agent.log")
	}
	mode, err := resolveMode(c.MasterURL, string(c.Mode))
	if err != nil {
		return nil, err
	}
	c.Mode = mode
	c.MasterWsURL = c.MasterURL
	if c.AgentToken == "" {
		return nil, fmt.Errorf("AGENT_TOKEN is required")
	}
	if c.HeartbeatSecs < 1 || c.HeartbeatSecs > 300 {
		return nil, fmt.Errorf("heartbeatSecs must be an integer between 1 and 300")
	}
	if c.PollIntervalSecs < 5 || c.PollIntervalSecs > 300 {
		return nil, fmt.Errorf("POLL_INTERVAL_SECS must be an integer between 5 and 300")
	}
	return c, nil
}

func Save(path string, c *Config) error {
	if c == nil {
		return fmt.Errorf("config is nil")
	}
	if _, err := resolveMode(c.MasterURL, string(c.Mode)); err != nil {
		return err
	}
	if strings.TrimSpace(c.AgentToken) == "" {
		return fmt.Errorf("AGENT_TOKEN is required")
	}
	data, err := yaml.Marshal(c)
	if err != nil {
		return fmt.Errorf("encode config: %w", err)
	}
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return fmt.Errorf("create config directory: %w", err)
	}
	tmp, err := os.CreateTemp(dir, ".config-*.yaml.tmp")
	if err != nil {
		return fmt.Errorf("create config temp file: %w", err)
	}
	tmpName := tmp.Name()
	defer func() { _ = os.Remove(tmpName) }()
	if err := tmp.Chmod(0o600); err != nil {
		_ = tmp.Close()
		return fmt.Errorf("protect config temp file: %w", err)
	}
	if _, err := tmp.Write(data); err != nil {
		_ = tmp.Close()
		return fmt.Errorf("write config temp file: %w", err)
	}
	if err := tmp.Close(); err != nil {
		return fmt.Errorf("close config temp file: %w", err)
	}
	if err := os.Rename(tmpName, path); err != nil {
		return fmt.Errorf("replace config: %w", err)
	}
	return nil
}

func ResolveMode(rawURL, explicit string) (Mode, error) {
	return resolveMode(rawURL, explicit)
}

func NormalizeMasterURL(rawURL string, mode Mode) (string, error) {
	parsed, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return "", fmt.Errorf("MASTER_URL must be an absolute URL")
	}
	scheme := parsed.Scheme
	switch mode {
	case ModeWS:
		if scheme == "http" {
			scheme = "ws"
		} else if scheme == "https" {
			scheme = "wss"
		} else if scheme != "ws" && scheme != "wss" {
			return "", fmt.Errorf("WS mode requires ws, wss, http, or https URL")
		}
		return fmt.Sprintf("%s://%s/ws/agent", scheme, parsed.Host), nil
	case ModeHTTP:
		if scheme == "ws" {
			scheme = "http"
		} else if scheme == "wss" {
			scheme = "https"
		} else if scheme != "http" && scheme != "https" {
			return "", fmt.Errorf("HTTP mode requires http, https, ws, or wss URL")
		}
		return fmt.Sprintf("%s://%s", scheme, parsed.Host), nil
	default:
		return "", fmt.Errorf("mode must be ws or http")
	}
}

func applyEnvironment(c *Config) {
	masterURL := strings.TrimSpace(os.Getenv("MASTER_URL"))
	if masterURL == "" {
		masterURL = strings.TrimSpace(os.Getenv("MASTER_WS_URL"))
	}
	if masterURL != "" {
		c.MasterURL = masterURL
	}
	if value := strings.TrimSpace(os.Getenv("AGENT_MODE")); value != "" {
		c.Mode = Mode(strings.ToLower(value))
	}
	if value := os.Getenv("AGENT_TOKEN"); value != "" {
		c.AgentToken = value
	}
	if value := os.Getenv("SINGBOX_CONFIG_PATH"); value != "" {
		c.SingboxConfPath = value
	}
	if value := os.Getenv("SINGBOX_BINARY_PATH"); value != "" {
		c.SingboxBinPath = value
	}
	if value := os.Getenv("RIRICLOUD_LOG_PATH"); value != "" {
		c.LogPath = value
	}
	if value := os.Getenv("POLL_INTERVAL_SECS"); value != "" {
		if seconds, err := strconv.Atoi(value); err == nil {
			c.PollIntervalSecs = seconds
		} else {
			c.PollIntervalSecs = -1
		}
	}
	if value := os.Getenv("HEARTBEAT_SECS"); value != "" {
		if seconds, err := strconv.Atoi(value); err == nil {
			c.HeartbeatSecs = seconds
		} else {
			c.HeartbeatSecs = -1
		}
	}
}

func resolveMode(rawURL, explicit string) (Mode, error) {
	parsed, err := url.Parse(rawURL)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return "", fmt.Errorf("MASTER_URL must be an absolute URL")
	}
	if explicit != "" {
		switch Mode(strings.ToLower(strings.TrimSpace(explicit))) {
		case ModeWS:
			if parsed.Scheme != "ws" && parsed.Scheme != "wss" {
				return "", fmt.Errorf("AGENT_MODE=ws requires MASTER_URL with ws or wss scheme")
			}
			return ModeWS, nil
		case ModeHTTP:
			if parsed.Scheme != "http" && parsed.Scheme != "https" {
				return "", fmt.Errorf("AGENT_MODE=http requires MASTER_URL with http or https scheme")
			}
			return ModeHTTP, nil
		default:
			return "", fmt.Errorf("AGENT_MODE must be ws or http")
		}
	}
	switch parsed.Scheme {
	case "ws", "wss":
		return ModeWS, nil
	case "http", "https":
		return ModeHTTP, nil
	default:
		return "", fmt.Errorf("MASTER_URL scheme must be ws, wss, http, or https")
	}
}

func executableName(name string) string {
	if runtime.GOOS == "windows" {
		return name + ".exe"
	}
	return name
}
