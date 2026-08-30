// Package upgrade 提供 Agent 与 Sing-box 共用的流式下载、校验和原子替换能力。
package upgrade

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

const maxDownloadSize int64 = 100 * 1024 * 1024

var sha256Pattern = regexp.MustCompile(`^[a-fA-F0-9]{64}$`)

// DownloadAndVerify 将远端文件流式下载到目标目录，并在落盘前完成 SHA-256 校验。
func DownloadAndVerify(ctx context.Context, rawURL, expectedSHA, dir string) (string, error) {
	if !strings.HasPrefix(strings.ToLower(rawURL), "https://") && !strings.HasPrefix(strings.ToLower(rawURL), "http://") {
		return "", fmt.Errorf("upgrade URL must use http or https")
	}
	expectedSHA = strings.TrimSpace(expectedSHA)
	if !sha256Pattern.MatchString(expectedSHA) {
		return "", fmt.Errorf("invalid sha256 checksum")
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", fmt.Errorf("create upgrade directory: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return "", fmt.Errorf("create upgrade request: %w", err)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("download upgrade: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return "", fmt.Errorf("download upgrade: unexpected HTTP status %s", resp.Status)
	}

	tmp, err := os.CreateTemp(dir, ".riri-upgrade-*")
	if err != nil {
		return "", fmt.Errorf("create upgrade temp file: %w", err)
	}
	tmpName := tmp.Name()
	keep := false
	defer func() {
		if !keep {
			_ = os.Remove(tmpName)
		}
	}()

	hash := sha256.New()
	limited := io.LimitReader(resp.Body, maxDownloadSize+1)
	n, err := io.Copy(io.MultiWriter(tmp, hash), limited)
	if err != nil {
		if closeErr := tmp.Close(); closeErr != nil {
			return "", fmt.Errorf("download upgrade: %w (close temp: %v)", err, closeErr)
		}
		return "", fmt.Errorf("download upgrade: %w", err)
	}
	if n > maxDownloadSize {
		if closeErr := tmp.Close(); closeErr != nil {
			return "", fmt.Errorf("upgrade file exceeds size limit (close temp: %v)", closeErr)
		}
		return "", fmt.Errorf("upgrade file exceeds size limit")
	}
	if err := tmp.Chmod(0o755); err != nil {
		if closeErr := tmp.Close(); closeErr != nil {
			return "", fmt.Errorf("chmod upgrade temp: %w (close temp: %v)", err, closeErr)
		}
		return "", fmt.Errorf("chmod upgrade temp: %w", err)
	}
	if err := tmp.Close(); err != nil {
		return "", fmt.Errorf("close upgrade temp: %w", err)
	}
	actual := hex.EncodeToString(hash.Sum(nil))
	if !strings.EqualFold(actual, expectedSHA) {
		return "", fmt.Errorf("upgrade checksum mismatch: got %s", actual)
	}
	keep = true
	return tmpName, nil
}

// AtomicReplace 用备份文件保护已有二进制，替换失败时恢复旧文件。
func AtomicReplace(source, target string) error {
	backup, err := AtomicReplaceWithBackup(source, target)
	if err != nil {
		return err
	}
	if err := CommitBackup(backup); err != nil {
		return err
	}
	return nil
}

// AtomicReplaceWithBackup 替换二进制但保留旧文件备份，供调用方在启动新进程失败时回滚。
func AtomicReplaceWithBackup(source, target string) (string, error) {
	if source == "" || target == "" {
		return "", fmt.Errorf("source and target are required")
	}
	if err := os.Chmod(source, 0o755); err != nil {
		return "", fmt.Errorf("chmod replacement: %w", err)
	}
	if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
		return "", fmt.Errorf("create target directory: %w", err)
	}

	backup := target + ".riri-old"
	if err := os.Remove(backup); err != nil && !os.IsNotExist(err) {
		return "", fmt.Errorf("remove stale backup: %w", err)
	}
	movedOld := false
	if err := os.Rename(target, backup); err == nil {
		movedOld = true
	} else if !os.IsNotExist(err) {
		return "", fmt.Errorf("move existing binary: %w", err)
	}
	if err := os.Rename(source, target); err != nil {
		if movedOld {
			if restoreErr := os.Rename(backup, target); restoreErr != nil {
				return "", fmt.Errorf("replace binary failed: %w; restore failed: %v", err, restoreErr)
			}
		}
		return "", fmt.Errorf("replace binary: %w", err)
	}
	if !movedOld {
		return "", nil
	}
	return backup, nil
}

// CommitBackup 删除已经确认不再需要的旧二进制备份。
func CommitBackup(backup string) error {
	if backup == "" {
		return nil
	}
	if err := os.Remove(backup); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("remove old binary backup: %w", err)
	}
	return nil
}

// RestoreBackup 将失败的新二进制移走并恢复旧二进制。
func RestoreBackup(target, backup string) error {
	if target == "" || backup == "" {
		return fmt.Errorf("target and backup are required")
	}
	failed := target + ".riri-failed"
	if err := os.Remove(failed); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("remove stale failed binary: %w", err)
	}
	if err := os.Rename(target, failed); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("move failed binary: %w", err)
	}
	if err := os.Rename(backup, target); err != nil {
		if restoreErr := os.Rename(failed, target); restoreErr != nil {
			return fmt.Errorf("restore old binary failed: %w; restore new binary failed: %v", err, restoreErr)
		}
		return fmt.Errorf("restore old binary: %w", err)
	}
	if err := os.Remove(failed); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("remove failed binary: %w", err)
	}
	return nil
}
