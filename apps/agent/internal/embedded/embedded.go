package embedded

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"crypto/sha256"
	_ "embed"
	"encoding/binary"
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
	// ErrInvalidExecutableFormat 当二进制文件头与目标平台/架构不匹配时返回。
	ErrInvalidExecutableFormat = errors.New("invalid executable binary format for platform")
)

const headerProbeSize = 256

type FileMeta struct {
	Name   string
	Size   int64
	SHA256 string
	Header []byte
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

// ValidateExecutableHeader 校验二进制头部魔数及架构是否匹配指定的 GOOS 与 GOARCH。
func ValidateExecutableHeader(header []byte, goos, goarch string) error {
	switch goos {
	case "linux":
		if len(header) < 20 || header[0] != 0x7f || header[1] != 'E' || header[2] != 'L' || header[3] != 'F' {
			return fmt.Errorf("%w: expected Linux ELF header for %s/%s", ErrInvalidExecutableFormat, goos, goarch)
		}
		var machine uint16
		switch header[5] {
		case 1:
			machine = binary.LittleEndian.Uint16(header[18:20])
		case 2:
			machine = binary.BigEndian.Uint16(header[18:20])
		default:
			return fmt.Errorf("%w: invalid ELF endianness %d", ErrInvalidExecutableFormat, header[5])
		}
		var expected uint16
		switch goarch {
		case "amd64":
			expected = 0x3e // EM_X86_64
		case "arm64":
			expected = 0xb7 // EM_AARCH64
		case "arm":
			expected = 0x28 // EM_ARM
		case "386":
			expected = 0x03 // EM_386
		default:
			return nil
		}
		if machine != expected {
			return fmt.Errorf("%w: ELF machine 0x%x does not match %s/%s (expected 0x%x)", ErrInvalidExecutableFormat, machine, goos, goarch, expected)
		}
		return nil

	case "darwin":
		if len(header) < 8 {
			return fmt.Errorf("%w: file too short for Darwin Mach-O (%s/%s)", ErrInvalidExecutableFormat, goos, goarch)
		}
		magicLE := binary.LittleEndian.Uint32(header[0:4])
		magicBE := binary.BigEndian.Uint32(header[0:4])
		if magicLE != 0xfeedfacf && magicBE != 0xfeedfacf {
			return fmt.Errorf("%w: expected 64-bit Mach-O header for %s/%s", ErrInvalidExecutableFormat, goos, goarch)
		}
		var cpuType uint32
		if magicLE == 0xfeedfacf {
			cpuType = binary.LittleEndian.Uint32(header[4:8])
		} else {
			cpuType = binary.BigEndian.Uint32(header[4:8])
		}
		var expected uint32
		switch goarch {
		case "amd64":
			expected = 0x01000007 // CPU_TYPE_X86_64
		case "arm64":
			expected = 0x0100000c // CPU_TYPE_ARM64
		default:
			return nil
		}
		if cpuType != expected {
			return fmt.Errorf("%w: Mach-O cpuType 0x%x does not match %s/%s (expected 0x%x)", ErrInvalidExecutableFormat, cpuType, goos, goarch, expected)
		}
		return nil

	case "windows":
		if len(header) < 2 || header[0] != 'M' || header[1] != 'Z' {
			return fmt.Errorf("%w: expected Windows PE (MZ) header for %s/%s", ErrInvalidExecutableFormat, goos, goarch)
		}
		if len(header) >= 0x40 {
			peOffset := int(binary.LittleEndian.Uint32(header[0x3c:0x40]))
			if peOffset < 0 {
				return fmt.Errorf("%w: invalid PE header offset %d", ErrInvalidExecutableFormat, peOffset)
			}
			if peOffset+6 <= len(header) {
				if header[peOffset] != 'P' || header[peOffset+1] != 'E' || header[peOffset+2] != 0 || header[peOffset+3] != 0 {
					return fmt.Errorf("%w: missing PE signature at offset 0x%x", ErrInvalidExecutableFormat, peOffset)
				}
				machine := binary.LittleEndian.Uint16(header[peOffset+4 : peOffset+6])
				var expected uint16
				switch goarch {
				case "amd64":
					expected = 0x8664 // IMAGE_FILE_MACHINE_AMD64
				case "arm64":
					expected = 0xaa64 // IMAGE_FILE_MACHINE_ARM64
				case "386":
					expected = 0x014c // IMAGE_FILE_MACHINE_I386
				default:
					return nil
				}
				if machine != expected {
					return fmt.Errorf("%w: PE machine 0x%x does not match %s/%s (expected 0x%x)", ErrInvalidExecutableFormat, machine, goos, goarch, expected)
				}
			}
		}
		return nil

	default:
		if len(header) == 0 {
			return fmt.Errorf("%w: empty binary", ErrInvalidExecutableFormat)
		}
		return nil
	}
}

// ValidateExecutableForCurrentPlatform 校验二进制头部是否匹配当前运行平台（runtime.GOOS/GOARCH）。
func ValidateExecutableForCurrentPlatform(header []byte) error {
	return ValidateExecutableHeader(header, runtime.GOOS, runtime.GOARCH)
}

// ValidateExecutableFile 读取磁盘文件头部并校验是否匹配当前运行平台。
func ValidateExecutableFile(path string) error {
	file, err := os.Open(path)
	if err != nil {
		return err
	}
	defer file.Close()

	buf := make([]byte, headerProbeSize)
	n, err := io.ReadFull(file, buf)
	if err != nil && !errors.Is(err, io.EOF) && !errors.Is(err, io.ErrUnexpectedEOF) {
		return err
	}
	if n == 0 {
		return fmt.Errorf("%w: empty file", ErrInvalidExecutableFormat)
	}
	return ValidateExecutableForCurrentPlatform(buf[:n])
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
	if item, ok := meta[mainName]; ok {
		return ValidateExecutableForCurrentPlatform(item.Header) == nil
	}
	// 兼容未带 .exe 后缀的情况
	if runtime.GOOS == "windows" {
		if item, ok := meta["sing-box"]; ok {
			return ValidateExecutableForCurrentPlatform(item.Header) == nil
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

	// 若内嵌归档中没有适用的 sing-box（例如开发态占位模式或内嵌归档格式与当前平台不匹配）
	if !HasEmbeddedKernel() {
		// 仅当本地目标文件已存在且为当前平台合法可执行二进制时才复用
		if info, statErr := os.Stat(mainTarget); statErr == nil && !info.IsDir() && info.Size() > 0 {
			if ValidateExecutableFile(mainTarget) == nil {
				return mainTarget, nil, false, nil
			}
		}
		return "", nil, false, ErrNoEmbeddedKernel
	}

	// 检查落盘文件是否齐全、SHA-256 与内嵌一致且主可执行文件格式合法
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
		if targetName == mainName && ValidateExecutableFile(targetPath) != nil {
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

		// 若为主可执行文件，在替换前强制校验二进制头匹配当前运行平台
		if targetFileName == mainName {
			if err := ValidateExecutableFile(tmpPath); err != nil {
				return nil, fmt.Errorf("validate extracted %s: %w", targetFileName, err)
			}
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

// BuildMockExecutableForPlatform 仅供单元测试生成匹配指定 GOOS/GOARCH 魔数头的模拟二进制内容。
func BuildMockExecutableForPlatform(goos, goarch, payload string) []byte {
	var header []byte
	switch goos {
	case "linux":
		header = make([]byte, 64)
		header[0] = 0x7f
		header[1] = 'E'
		header[2] = 'L'
		header[3] = 'F'
		header[4] = 2 // 64-bit
		header[5] = 1 // little-endian
		var machine uint16 = 0x3e
		switch goarch {
		case "arm64":
			machine = 0xb7
		case "arm":
			machine = 0x28
		case "386":
			machine = 0x03
		}
		binary.LittleEndian.PutUint16(header[18:20], machine)
	case "darwin":
		header = make([]byte, 32)
		binary.LittleEndian.PutUint32(header[0:4], 0xfeedfacf)
		var cpuType uint32 = 0x01000007
		if goarch == "arm64" {
			cpuType = 0x0100000c
		}
		binary.LittleEndian.PutUint32(header[4:8], cpuType)
	case "windows":
		header = make([]byte, 128)
		header[0] = 'M'
		header[1] = 'Z'
		binary.LittleEndian.PutUint32(header[0x3c:0x40], 0x40)
		header[0x40] = 'P'
		header[0x41] = 'E'
		header[0x42] = 0
		header[0x43] = 0
		var machine uint16 = 0x8664
		switch goarch {
		case "arm64":
			machine = 0xaa64
		case "386":
			machine = 0x014c
		}
		binary.LittleEndian.PutUint16(header[0x44:0x46], machine)
	default:
		header = []byte("MOCK")
	}
	return append(header, []byte(payload)...)
}

// BuildMockExecutableForCurrentPlatform 仅供单元测试生成匹配当前 runtime.GOOS/GOARCH 的模拟二进制内容。
func BuildMockExecutableForCurrentPlatform(payload string) []byte {
	return BuildMockExecutableForPlatform(runtime.GOOS, runtime.GOARCH, payload)
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

		var headBuf bytes.Buffer
		hash := sha256.New()
		n, err := io.Copy(io.MultiWriter(hash, &limitedBufferWriter{buf: &headBuf, limit: headerProbeSize}), tarReader)
		if err != nil {
			return nil, err
		}

		result[cleanName] = FileMeta{
			Name:   cleanName,
			Size:   n,
			SHA256: hex.EncodeToString(hash.Sum(nil)),
			Header: headBuf.Bytes(),
		}
	}
	return result, nil
}

type limitedBufferWriter struct {
	buf   *bytes.Buffer
	limit int
}

func (w *limitedBufferWriter) Write(p []byte) (int, error) {
	origLen := len(p)
	remaining := w.limit - w.buf.Len()
	if remaining > 0 {
		if len(p) > remaining {
			p = p[:remaining]
		}
		_, _ = w.buf.Write(p)
	}
	return origLen, nil
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
