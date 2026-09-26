package embedded

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"crypto/sha256"
	"encoding/hex"
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestPlaceholderArchive(t *testing.T) {
	c := ArchiveChecksum()
	if c == "" {
		t.Fatal("ArchiveChecksum returned empty string")
	}

	manifest, err := InspectArchive()
	if err != nil {
		t.Fatalf("InspectArchive failed on placeholder: %v", err)
	}

	// 占位归档不应判定为具有可用内核
	if HasEmbeddedKernel() {
		t.Fatalf("placeholder archive should not report HasEmbeddedKernel() = true")
	}

	// 如果目标文件也不存在，Ensure 应返回 ErrNoEmbeddedKernel
	tmpDir := t.TempDir()
	_, _, err = Ensure(tmpDir)
	if err != ErrNoEmbeddedKernel {
		t.Fatalf("expected ErrNoEmbeddedKernel, got %v", err)
	}

	// 如果本地手动创建了合法格式的 sing-box，Ensure 应能发现并直接复用
	mainPath := filepath.Join(tmpDir, MainExecutableName())
	if err := os.WriteFile(mainPath, BuildMockExecutableForCurrentPlatform("mock binary"), 0o755); err != nil {
		t.Fatal(err)
	}
	foundPath, aux, err := Ensure(tmpDir)
	if err != nil {
		t.Fatalf("Ensure failed with existing mock binary: %v", err)
	}
	if foundPath != mainPath {
		t.Fatalf("expected %s, got %s", mainPath, foundPath)
	}
	if len(aux) != 0 {
		t.Fatalf("expected 0 aux files, got %d", len(aux))
	}

	// 如果本地文件是异构平台二进制（例如 Linux 下的 Windows PE），占位模式下不应复用
	otherOS := "windows"
	if runtime.GOOS == "windows" {
		otherOS = "linux"
	}
	if err := os.WriteFile(mainPath, BuildMockExecutableForPlatform(otherOS, "amd64", "wrong-os"), 0o755); err != nil {
		t.Fatal(err)
	}
	if _, _, err := Ensure(tmpDir); err != ErrNoEmbeddedKernel {
		t.Fatalf("expected ErrNoEmbeddedKernel when local binary has wrong OS header, got %v", err)
	}
	_ = manifest
}

func createTestTarGz(files map[string][]byte) ([]byte, error) {
	var buf bytes.Buffer
	gw := gzip.NewWriter(&buf)
	tw := tar.NewWriter(gw)

	for name, content := range files {
		hdr := &tar.Header{
			Name:     name,
			Mode:     0o755,
			Size:     int64(len(content)),
			Typeflag: tar.TypeReg,
		}
		if err := tw.WriteHeader(hdr); err != nil {
			return nil, err
		}
		if _, err := tw.Write(content); err != nil {
			return nil, err
		}
	}

	if err := tw.Close(); err != nil {
		return nil, err
	}
	if err := gw.Close(); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func TestParseArchiveManifest(t *testing.T) {
	fakeBin := BuildMockExecutableForCurrentPlatform("fake-sing-box-bin")
	data, err := createTestTarGz(map[string][]byte{
		"sing-box":     fakeBin,
		"libcronet.so": []byte("fake-libcronet-data"),
		".placeholder": []byte(""),
	})
	if err != nil {
		t.Fatal(err)
	}

	meta, err := parseArchiveManifest(data)
	if err != nil {
		t.Fatalf("parseArchiveManifest failed: %v", err)
	}

	if _, ok := meta[".placeholder"]; ok {
		t.Fatal(".placeholder should be ignored")
	}

	singboxMeta, ok := meta["sing-box"]
	if !ok {
		t.Fatal("expected sing-box in manifest")
	}
	if singboxMeta.Size != int64(len(fakeBin)) {
		t.Errorf("size mismatch: got %d, expected %d", singboxMeta.Size, len(fakeBin))
	}
	expectedHash := sha256.Sum256(fakeBin)
	if singboxMeta.SHA256 != hex.EncodeToString(expectedHash[:]) {
		t.Errorf("hash mismatch: got %s, expected %s", singboxMeta.SHA256, hex.EncodeToString(expectedHash[:]))
	}

	cronetMeta, ok := meta["libcronet.so"]
	if !ok {
		t.Fatal("expected libcronet.so in manifest")
	}
	if cronetMeta.Size != int64(len("fake-libcronet-data")) {
		t.Errorf("size mismatch: got %d, expected %d", cronetMeta.Size, len("fake-libcronet-data"))
	}
}

func TestValidateExecutableHeaderCrossPlatform(t *testing.T) {
	platforms := []struct {
		goos   string
		goarch string
	}{
		{"linux", "amd64"},
		{"linux", "arm64"},
		{"darwin", "amd64"},
		{"darwin", "arm64"},
		{"windows", "amd64"},
	}

	for _, target := range platforms {
		bin := BuildMockExecutableForPlatform(target.goos, target.goarch, "payload")
		if err := ValidateExecutableHeader(bin, target.goos, target.goarch); err != nil {
			t.Fatalf("expected valid header for %s/%s, got error: %v", target.goos, target.goarch, err)
		}
		for _, other := range platforms {
			if other.goos == target.goos && other.goarch == target.goarch {
				continue
			}
			if err := ValidateExecutableHeader(bin, other.goos, other.goarch); err == nil {
				t.Fatalf("expected %s/%s binary to be rejected when validating for %s/%s", target.goos, target.goarch, other.goos, other.goarch)
			}
		}
	}
}

func TestEmbeddedRejectsMismatchedPlatformArchive(t *testing.T) {
	otherOS := "windows"
	if runtime.GOOS == "windows" {
		otherOS = "linux"
	}
	wrongBin := BuildMockExecutableForPlatform(otherOS, "amd64", "wrong-platform-singbox")
	archive, err := createTestTarGz(map[string][]byte{
		"sing-box": wrongBin,
	})
	if err != nil {
		t.Fatal(err)
	}
	restore := SetArchiveBytesForTest(archive)
	defer restore()

	if HasEmbeddedKernel() {
		t.Fatalf("expected HasEmbeddedKernel() = false when embedded binary is %s/amd64 on %s/%s", otherOS, runtime.GOOS, runtime.GOARCH)
	}
	if _, _, err := Ensure(t.TempDir()); err != ErrNoEmbeddedKernel {
		t.Fatalf("expected ErrNoEmbeddedKernel for mismatched embedded binary, got %v", err)
	}
}

func TestAtomicReplaceAndVerify(t *testing.T) {
	dir := t.TempDir()
	target := filepath.Join(dir, "binary")
	source := filepath.Join(dir, "tmp-binary")

	content1 := []byte("version 1")
	if err := os.WriteFile(source, content1, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := atomicReplace(source, target); err != nil {
		t.Fatalf("atomicReplace failed on new file: %v", err)
	}

	h1 := sha256.Sum256(content1)
	match, err := verifyFileChecksum(target, hex.EncodeToString(h1[:]))
	if err != nil || !match {
		t.Fatalf("verifyFileChecksum failed: match=%v, err=%v", match, err)
	}

	// 替换为 version 2
	content2 := []byte("version 2 payload")
	source2 := filepath.Join(dir, "tmp-binary-2")
	if err := os.WriteFile(source2, content2, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := atomicReplace(source2, target); err != nil {
		t.Fatalf("atomicReplace failed on overwrite: %v", err)
	}

	h2 := sha256.Sum256(content2)
	match2, err := verifyFileChecksum(target, hex.EncodeToString(h2[:]))
	if err != nil || !match2 {
		t.Fatalf("verifyFileChecksum failed for v2: match=%v, err=%v", match2, err)
	}
}

func TestMainExecutableName(t *testing.T) {
	name := MainExecutableName()
	if runtime.GOOS == "windows" {
		if name != "sing-box.exe" {
			t.Fatalf("expected sing-box.exe on windows, got %s", name)
		}
	} else {
		if name != "sing-box" {
			t.Fatalf("expected sing-box on %s, got %s", runtime.GOOS, name)
		}
	}
}
