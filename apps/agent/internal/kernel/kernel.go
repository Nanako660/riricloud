package kernel

import (
	"archive/tar"
	"archive/zip"
	"bytes"
	"compress/gzip"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/Nanako660/riricloud/apps/agent/internal/security"
)

const maxDownloadSize = 100 * 1024 * 1024

// Options 描述一次 sing-box 内核获取任务。
type Options struct {
	// Source 为 auto、master 或 github；auto 先尝试 Master 再回退 GitHub。
	Source string
	// URL 为自定义下载地址，设置后忽略 Source 与 MasterURL。
	URL string
	// Version 为 GitHub Release 版本号（不带 v 前缀）。
	Version string
	// MasterURL 为完整 Master 地址（ws/wss/http/https 均可，内部归一为 HTTP 基址）。
	MasterURL string
	// Token 为访问 Master 二进制下载端点所需的 AgentToken。
	Token string
	// Destination 为内核二进制落盘路径。
	Destination string
}

// Ensure 确保 Destination 存在 sing-box 内核；已存在时直接返回 false 不重复下载。
func Ensure(ctx context.Context, options Options) (bool, error) {
	if strings.TrimSpace(options.Destination) == "" {
		return false, fmt.Errorf("kernel destination is required")
	}
	if _, err := os.Stat(options.Destination); err == nil {
		return false, nil
	} else if !errors.Is(err, os.ErrNotExist) {
		return false, fmt.Errorf("stat sing-box kernel: %w", err)
	}
	if err := Download(ctx, options); err != nil {
		return false, err
	}
	return true, nil
}

// Download 下载 sing-box 内核并写入 Destination。
func Download(ctx context.Context, options Options) error {
	source := strings.ToLower(strings.TrimSpace(options.Source))
	if source == "" {
		source = "auto"
	}
	if source != "auto" && source != "master" && source != "github" {
		return fmt.Errorf("singbox source must be auto, master, or github")
	}
	if options.URL != "" {
		body, err := fetch(ctx, options.URL, "")
		if err != nil {
			return fmt.Errorf("download sing-box: %w", err)
		}
		return writeBinary(options.Destination, body)
	}
	if source != "github" {
		target := fmt.Sprintf("singbox-%s-%s", assetOS(), assetArch())
		body, err := fetch(ctx, masterHTTPBase(options.MasterURL)+"/api/v1/downloads/binaries/"+target, options.Token)
		if err == nil {
			return writeBinary(options.Destination, body)
		}
		if source == "master" {
			return fmt.Errorf("download sing-box from Master: %w", err)
		}
	}
	version := strings.TrimSpace(options.Version)
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
	return writeArchiveOrBinary(options.Destination, body)
}

func fetch(ctx context.Context, rawURL, token string) ([]byte, error) {
	if err := security.ValidateHTTPURL(rawURL); err != nil {
		return nil, err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return nil, err
	}
	if token != "" {
		request.Header.Set("X-Agent-Token", token)
	}
	response, err := security.NewHTTPClient(2*time.Minute, token != "").Do(request)
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
			if closeErr := reader.Close(); closeErr != nil {
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
