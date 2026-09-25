package embedded

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"crypto/sha256"
	_ "embed"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"
)

//go:embed assets/singbox.tar.gz
var archiveBytes []byte

var (
	// ErrNoEmbeddedKernel 当内嵌资源为占位符且目标文件缺失时返回。
	ErrNoEmbeddedKernel = errors.New("embedded sing-box kernel not available")
)

type FileMeta struct {
	Name   string
	Size   int64
	SHA256 string
}

var (
	manifestOnce sync.Once
	manifestMap  map[string]FileMeta
	manifestErr  error
)

// MainExecutableName 返回当前平台下的 sing-box 可执行文件名。
func MainExecutableName() string {
	if runtime.GOOS == "windows" {
		return "sing-box.exe"
	}
	return "sing-box"
}

// ArchiveChecksum 返回当前内嵌归档的 SHA-256 哈希字符串。
func ArchiveChecksum() string {
	hash := sha256.Sum256(archiveBytes)
	return hex.EncodeToString(hash[:])
}

// InspectArchive 解析并返回内嵌归档中包含的所有有效文件元数据。
func InspectArchive() (map[string]FileMeta, error) {
	manifestOnce.Do(func() {
		manifestMap, manifestErr = parseArchiveManifest(archiveBytes)
	})
	return manifestMap, manifestErr
}

// SetArchiveBytesForTest 仅供单元测试注入模拟内嵌归档，返回恢复函数。
func SetArchiveBytesForTest(data []byte) func() {
	origBytes := archiveBytes
	archiveBytes = data
	manifestOnce = sync.Once{}
	manifestMap = nil
	manifestErr = nil
	return func() {
		archiveBytes = origBytes
		manifestOnce = sync.Once{}
		manifestMap = nil
		manifestErr = nil
	}
}

// HasEmbeddedKernel 检查内嵌归档中是否包含当前平台适用的 sing-box 内核。
func HasEmbeddedKernel() bool {
	meta, err := InspectArchive()
	if err != nil || meta == nil {
		return false
	}
	mainName := MainExecutableName()
	if _, ok := meta[mainName]; ok {
		return true
	}
	// 兼容未带 .exe 后缀的情况
	if runtime.GOOS == "windows" {
		if _, ok := meta["sing-box"]; ok {
			return true
		}
	}
	return false
}

// Ensure 保证 destDir 下存在最新且哈希匹配的 sing-box 内核及伴生文件。
// 若文件缺失、损坏或与内嵌哈希不一致，自动执行自愈覆盖释放。
// 返回主可执行文件绝对路径与可能的伴生文件路径列表。
func Ensure(destDir string) (string, []string, error) {
	mainTarget, auxFiles, _, err := EnsureWithStatus(destDir)
	return mainTarget, auxFiles, err
}

// EnsureWithStatus 与 Ensure 相同，但額外返回布尔值标识本次是否实际执行了文件释放更新。
func EnsureWithStatus(destDir string) (string, []string, bool, error) {
	destDir = strings.TrimSpace(destDir)
	if destDir == "" {
		return "", nil, false, errors.New("destination directory is required")
	}
	if err := os.MkdirAll(destDir, 0o755); err != nil {
		return "", nil, false, fmt.Errorf("create embedded destination dir: %w", err)
	}

	mainName := MainExecutableName()
	mainTarget := filepath.Join(destDir, mainName)

	meta, err := InspectArchive()
	if err != nil {
		return "", nil, false, fmt.Errorf("inspect embedded archive: %w", err)
	}

	// 若内嵌归档中没有 sing-box（例如开发态占位模式）
	if !HasEmbeddedKernel() {
		// 如果本地目标文件已存在（可能本地放了用于调试的二进制），直接复用
		if info, statErr := os.Stat(mainTarget); statErr == nil && !info.IsDir() && info.Size() > 0 {
			return mainTarget, nil, false, nil
		}
		return "", nil, false, ErrNoEmbeddedKernel
	}

	// 检查落盘文件是否齐全且 SHA-256 与内嵌一致
	allMatch := true
	auxFiles := make([]string, 0)
	for name, expected := range meta {
		targetName := name
		if runtime.GOOS == "windows" && name == "sing-box" {
			targetName = "sing-box.exe"
		}
		targetPath := filepath.Join(destDir, targetName)
		if targetName != mainName {
			auxFiles = append(auxFiles, targetPath)
		}
		match, _ := verifyFileChecksum(targetPath, expected.SHA256)
		if !match {
			allMatch = false
			break
		}
	}

	if allMatch {
		return mainTarget, auxFiles, false, nil
	}

	// 存在不匹配，执行自愈释放
	extracted, err := ExtractAll(destDir)
	if err != nil {
		return "", nil, false, fmt.Errorf("extract embedded sing-box: %w", err)
	}

	finalAux := make([]string, 0)
	for _, p := range extracted {
		if filepath.Base(p) != mainName {
			finalAux = append(finalAux, p)
		}
	}
	return mainTarget, finalAux, true, nil
}

// ExtractAll 将内嵌归档中的所有文件原子释放到 destDir。
func ExtractAll(destDir string) ([]string, error) {
	if err := os.MkdirAll(destDir, 0o755); err != nil {
		return nil, fmt.Errorf("create extraction directory: %w", err)
	}

	gzReader, err := gzip.NewReader(bytes.NewReader(archiveBytes))
	if err != nil {
		return nil, fmt.Errorf("open embedded gzip archive: %w", err)
	}
	defer gzReader.Close()

	tarReader := tar.NewReader(gzReader)
	extractedPaths := make([]string, 0)
	mainName := MainExecutableName()

	for {
		header, err := tarReader.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("read tar entry: %w", err)
		}

		cleanName := filepath.Base(filepath.Clean(header.Name))
		if cleanName == "." || cleanName == "/" || cleanName == ".placeholder" {
			continue
		}
		if header.Typeflag != tar.TypeReg && header.Typeflag != tar.TypeRegA {
			continue
		}

		// Windows 下将 sing-box 规整为 sing-box.exe
		targetFileName := cleanName
		if runtime.GOOS == "windows" && cleanName == "sing-box" {
			targetFileName = mainName
		}
		targetPath := filepath.Join(destDir, targetFileName)

		// 写入隐藏临时文件并赋予可执行权限
		tmpFile, err := os.CreateTemp(destDir, fmt.Sprintf(".riri-extract-%s-*", targetFileName))
		if err != nil {
			return nil, fmt.Errorf("create temp extraction file for %s: %w", targetFileName, err)
		}
		tmpPath := tmpFile.Name()
		keep := false
		defer func(p string) {
			if !keep {
				_ = os.Remove(p)
			}
		}(tmpPath)

		if _, err := io.Copy(tmpFile, tarReader); err != nil {
			_ = tmpFile.Close()
			return nil, fmt.Errorf("write temp extraction file for %s: %w", targetFileName, err)
		}
		_ = tmpFile.Chmod(0o755)
		if err := tmpFile.Close(); err != nil {
			return nil, fmt.Errorf("close temp extraction file for %s: %w", targetFileName, err)
		}

		// 原子替换
		if err := atomicReplace(tmpPath, targetPath); err != nil {
			return nil, fmt.Errorf("replace %s: %w", targetFileName, err)
		}
		keep = true
		extractedPaths = append(extractedPaths, targetPath)
	}

	return extractedPaths, nil
}

func parseArchiveManifest(data []byte) (map[string]FileMeta, error) {
	if len(data) == 0 {
		return map[string]FileMeta{}, nil
	}
	gzReader, err := gzip.NewReader(bytes.NewReader(data))
	if err != nil {
		return nil, err
	}
	defer gzReader.Close()

	tarReader := tar.NewReader(gzReader)
	result := make(map[string]FileMeta)

	for {
		header, err := tarReader.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, err
		}
		cleanName := filepath.Base(filepath.Clean(header.Name))
		if cleanName == "." || cleanName == "/" || cleanName == ".placeholder" {
			continue
		}
		if header.Typeflag != tar.TypeReg && header.Typeflag != tar.TypeRegA {
			continue
		}

		hash := sha256.New()
		n, err := io.Copy(hash, tarReader)
		if err != nil {
			return nil, err
		}

		result[cleanName] = FileMeta{
			Name:   cleanName,
			Size:   n,
			SHA256: hex.EncodeToString(hash.Sum(nil)),
		}
	}
	return result, nil
}

func verifyFileChecksum(path string, expectedSHA string) (bool, error) {
	expectedSHA = strings.TrimSpace(strings.ToLower(expectedSHA))
	if expectedSHA == "" {
		return false, nil
	}
	file, err := os.Open(path)
	if err != nil {
		return false, err
	}
	defer file.Close()

	hash := sha256.New()
	if _, err := io.Copy(hash, file); err != nil {
		return false, err
	}
	actual := hex.EncodeToString(hash.Sum(nil))
	return strings.EqualFold(actual, expectedSHA), nil
}

func atomicReplace(source, target string) error {
	backupPath := target + ".riri-old"
	_ = os.Remove(backupPath)

	// 若目标文件已存在，先重命名为 backup
	if _, err := os.Stat(target); err == nil {
		if err := renameWithRetry(target, backupPath); err != nil {
			return err
		}
	}

	if err := renameWithRetry(source, target); err != nil {
		// 恢复备份
		if _, statErr := os.Stat(backupPath); statErr == nil {
			_ = renameWithRetry(backupPath, target)
		}
		return err
	}

	_ = os.Remove(backupPath)
	return nil
}

func renameWithRetry(source, target string) error {
	var err error
	for i := 0; i < 20; i++ {
		err = os.Rename(source, target)
		if err == nil {
			return nil
		}
		if runtime.GOOS == "windows" {
			time.Sleep(25 * time.Millisecond)
			continue
		}
		return err
	}
	return err
}
