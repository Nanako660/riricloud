package install

import (
	"archive/tar"
	"archive/zip"
	"bytes"
	"compress/gzip"
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/Nanako660/riricloud/apps/agent/internal/config"
	"github.com/Nanako660/riricloud/apps/agent/internal/system"
)

const maxDownloadSize = 100 * 1024 * 1024

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
	source := strings.ToLower(strings.TrimSpace(options.SingboxSource))
	if source == "" {
		source = "auto"
	}
	if source != "auto" && source != "master" && source != "github" {
		return fmt.Errorf("--singbox-source must be auto, master, or github")
	}
	if options.SingboxURL != "" {
		body, err := fetch(ctx, options.SingboxURL, "")
		if err != nil {
			return fmt.Errorf("download sing-box: %w", err)
		}
		return writeBinary(destination, body)
	}
	if source != "github" {
		target := fmt.Sprintf("singbox-%s-%s", assetOS(), assetArch())
		body, err := fetch(ctx, masterHTTPBase(masterURL)+"/api/v1/downloads/binaries/"+target, options.Token)
		if err == nil {
			return writeBinary(destination, body)
		}
		if source == "master" {
			return fmt.Errorf("download sing-box from Master: %w", err)
		}
	}
	version := strings.TrimSpace(options.SingboxVersion)
	if version == "" {
		version = strings.TrimPrefix(os.Getenv("SINGBOX_VERSION"), "v")
	}
	if version == "" {
		version = "1.14.0"
	}
	extension := "tar.gz"
	if runtime.GOOS == "windows" {
		extension = "zip"
	}
	archiveURL := fmt.Sprintf("https://github.com/SagerNet/sing-box/releases/download/v%s/sing-box-%s-%s-%s.%s", version, version, githubOS(), assetArch(), extension)
	body, err := fetch(ctx, archiveURL, "")
	if err != nil {
		return fmt.Errorf("download sing-box from GitHub: %w", err)
	}
	return writeArchiveOrBinary(destination, body)
}

func fetch(ctx context.Context, rawURL, token string) ([]byte, error) {
	parsed, err := url.Parse(rawURL)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return nil, fmt.Errorf("invalid download URL")
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return nil, err
	}
	if token != "" {
		request.Header.Set("X-Agent-Token", token)
	}
	response, err := (&http.Client{Timeout: 2 * time.Minute}).Do(request)
	if err != nil {
		return nil, err
	}
	defer func() {
		if err := response.Body.Close(); err != nil {
			// 响应体已完整读取或已在状态码检查阶段被拒绝。
		}
	}()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return nil, fmt.Errorf("HTTP %d", response.StatusCode)
	}
	if response.ContentLength > maxDownloadSize {
		return nil, fmt.Errorf("download exceeds %d bytes", maxDownloadSize)
	}
	body, err := io.ReadAll(io.LimitReader(response.Body, maxDownloadSize+1))
	if err != nil {
		return nil, err
	}
	if int64(len(body)) > maxDownloadSize {
		return nil, fmt.Errorf("download exceeds %d bytes", maxDownloadSize)
	}
	return body, nil
}

func writeArchiveOrBinary(destination string, body []byte) error {
	if len(body) >= 2 && body[0] == 'P' && body[1] == 'K' {
		archive, err := zip.NewReader(bytes.NewReader(body), int64(len(body)))
		if err != nil {
			return fmt.Errorf("open sing-box zip: %w", err)
		}
		for _, file := range archive.File {
			if filepath.Base(file.Name) != executableName("sing-box") {
				continue
			}
			reader, err := file.Open()
			if err != nil {
				return err
			}
			content, readErr := io.ReadAll(io.LimitReader(reader, maxDownloadSize+1))
			closeErr := reader.Close()
			if readErr != nil {
				return readErr
			}
			if closeErr != nil {
				return closeErr
			}
			return writeBinary(destination, content)
		}
		return fmt.Errorf("sing-box executable not found in archive")
	}
	if len(body) >= 2 && body[0] == 0x1f && body[1] == 0x8b {
		reader, err := gzip.NewReader(bytes.NewReader(body))
		if err != nil {
			return fmt.Errorf("open sing-box tarball: %w", err)
		}
		archive := tar.NewReader(reader)
		for {
			header, err := archive.Next()
			if err == io.EOF {
				break
			}
			if err != nil {
				_ = reader.Close()
				return err
			}
			if filepath.Base(header.Name) != executableName("sing-box") {
				continue
			}
			content, readErr := io.ReadAll(io.LimitReader(archive, maxDownloadSize+1))
			if readErr != nil {
				_ = reader.Close()
				return readErr
			}
			closeErr := reader.Close()
			if closeErr != nil {
				return closeErr
			}
			return writeBinary(destination, content)
		}
		if err := reader.Close(); err != nil {
			return err
		}
		return fmt.Errorf("sing-box executable not found in archive")
	}
	return writeBinary(destination, body)
}

func writeBinary(destination string, body []byte) error {
	if len(body) == 0 || len(body) > maxDownloadSize {
		return fmt.Errorf("invalid sing-box binary size")
	}
	dir := filepath.Dir(destination)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(dir, ".sing-box-*.tmp")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()
	defer func() { _ = os.Remove(tmpName) }()
	if err := tmp.Chmod(0o755); err != nil {
		_ = tmp.Close()
		return err
	}
	if _, err := tmp.Write(body); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	if err := os.Rename(tmpName, destination); err != nil {
		return err
	}
	return nil
}

func masterHTTPBase(masterURL string) string {
	parsed, err := url.Parse(masterURL)
	if err != nil {
		return strings.TrimRight(masterURL, "/")
	}
	scheme := parsed.Scheme
	if scheme == "ws" {
		scheme = "http"
	}
	if scheme == "wss" {
		scheme = "https"
	}
	return fmt.Sprintf("%s://%s", scheme, parsed.Host)
}

func executableName(name string) string {
	if runtime.GOOS == "windows" {
		return name + ".exe"
	}
	return name
}

func assetOS() string {
	if runtime.GOOS == "darwin" {
		return "macos"
	}
	return runtime.GOOS
}

func githubOS() string {
	if runtime.GOOS == "darwin" {
		return "darwin"
	}
	return runtime.GOOS
}

func assetArch() string {
	return runtime.GOARCH
}
