package logging

import (
	"fmt"
	"os"
	"path/filepath"
	"sync"
)

const (
	DefaultLogMaxSizeMb = 50
	DefaultLogMaxFiles  = 5
)

// RotationConfig 是 Master 通过 config_sync 下发的本地日志轮转策略。
type RotationConfig struct {
	MaxSizeMb int `json:"maxSizeMb"`
	MaxFiles  int `json:"maxFiles"`
}

// RotatingWriter 是按字节数轮转的线程安全日志 writer。MaxFiles 包含当前文件。
type RotatingWriter struct {
	mu       sync.Mutex
	path     string
	file     *os.File
	size     int64
	maxBytes int64
	maxFiles int
}

func NewRotatingWriter(path string, maxSizeMb, maxFiles int) (*RotatingWriter, error) {
	w := &RotatingWriter{path: path}
	if err := w.Update(maxSizeMb, maxFiles); err != nil {
		return nil, err
	}
	if err := w.openLocked(); err != nil {
		return nil, err
	}
	return w, nil
}

func (w *RotatingWriter) Update(maxSizeMb, maxFiles int) error {
	if maxSizeMb < 1 || maxSizeMb > 1024 {
		return fmt.Errorf("log max size must be between 1 and 1024 MiB")
	}
	if maxFiles < 1 || maxFiles > 20 {
		return fmt.Errorf("log max files must be between 1 and 20")
	}
	w.mu.Lock()
	defer w.mu.Unlock()
	w.maxBytes = int64(maxSizeMb) * 1024 * 1024
	w.maxFiles = maxFiles
	return nil
}

func (w *RotatingWriter) Write(p []byte) (int, error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.file == nil {
		if err := w.openLocked(); err != nil {
			return 0, err
		}
	}
	var rotationErr error
	if w.size > 0 && w.size+int64(len(p)) > w.maxBytes {
		rotationErr = w.rotateLocked()
	}
	if w.file == nil {
		if err := w.openLocked(); err != nil {
			if rotationErr != nil {
				return 0, fmt.Errorf("rotate log file: %v; reopen current log: %w", rotationErr, err)
			}
			return 0, err
		}
	}
	n, writeErr := w.file.Write(p)
	w.size += int64(n)
	if writeErr != nil {
		return n, writeErr
	}
	if rotationErr != nil {
		// 当前文件仍然可用时保留日志内容；logrus 会继续工作，错误通过 stderr 暴露。
		_, _ = fmt.Fprintf(os.Stderr, "riri-agent log rotation failed: %v\n", rotationErr)
	}
	return n, nil
}

func (w *RotatingWriter) Close() error {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.file == nil {
		return nil
	}
	err := w.file.Close()
	w.file = nil
	return err
}

func (w *RotatingWriter) openLocked() error {
	if err := os.MkdirAll(filepath.Dir(w.path), 0o755); err != nil {
		return err
	}
	file, err := os.OpenFile(w.path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600)
	if err != nil {
		return err
	}
	info, statErr := file.Stat()
	if statErr != nil {
		_ = file.Close()
		return statErr
	}
	w.file = file
	w.size = info.Size()
	return nil
}

func (w *RotatingWriter) rotateLocked() error {
	closeErr := w.file.Close()
	w.file = nil
	w.size = 0
	if closeErr != nil {
		_ = w.openLocked()
		return closeErr
	}
	if w.maxFiles == 1 {
		file, err := os.OpenFile(w.path, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o600)
		if err != nil {
			_ = w.openLocked()
			return err
		}
		w.file = file
		return nil
	}
	_ = os.Remove(fmt.Sprintf("%s.%d", w.path, w.maxFiles))
	for index := w.maxFiles - 2; index >= 1; index-- {
		oldPath := fmt.Sprintf("%s.%d", w.path, index)
		newPath := fmt.Sprintf("%s.%d", w.path, index+1)
		if err := os.Rename(oldPath, newPath); err != nil && !os.IsNotExist(err) {
			_ = w.openLocked()
			return err
		}
	}
	if err := os.Rename(w.path, w.path+".1"); err != nil {
		_ = w.openLocked()
		return err
	}
	if err := w.openLocked(); err != nil {
		return err
	}
	return nil
}
