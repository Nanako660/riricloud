package upgrade

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestDownloadAndVerify(t *testing.T) {
	payload := []byte("riri-agent-upgrade")
	sum := sha256.Sum256(payload)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write(payload)
	}))
	defer server.Close()

	path, err := DownloadAndVerify(context.Background(), server.URL, hex.EncodeToString(sum[:]), t.TempDir())
	if err != nil {
		t.Fatalf("DownloadAndVerify: %v", err)
	}
	got, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read downloaded file: %v", err)
	}
	if string(got) != string(payload) {
		t.Fatalf("payload = %q, want %q", got, payload)
	}
}

func TestDownloadRejectsChecksumMismatch(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte("bad"))
	}))
	defer server.Close()
	_, err := DownloadAndVerify(context.Background(), server.URL, "0000000000000000000000000000000000000000000000000000000000000000", t.TempDir())
	if err == nil {
		t.Fatal("expected checksum mismatch")
	}
}

func TestAtomicReplace(t *testing.T) {
	dir := t.TempDir()
	source := filepath.Join(dir, "source")
	target := filepath.Join(dir, "target")
	if err := os.WriteFile(source, []byte("new"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(target, []byte("old"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := AtomicReplace(source, target); err != nil {
		t.Fatalf("AtomicReplace: %v", err)
	}
	got, err := os.ReadFile(target)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != "new" {
		t.Fatalf("target = %q, want new", got)
	}
}

func TestCleanupStaleBackup(t *testing.T) {
	dir := t.TempDir()
	target := filepath.Join(dir, "riri-agent")
	backup := target + ".riri-old"
	if err := os.WriteFile(backup, []byte("old"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := CleanupStaleBackup(target); err != nil {
		t.Fatalf("CleanupStaleBackup: %v", err)
	}
	if _, err := os.Stat(backup); !os.IsNotExist(err) {
		t.Fatalf("backup still exists: %v", err)
	}
}

func TestAtomicReplaceWithBackupAndRestore(t *testing.T) {
	dir := t.TempDir()
	source := filepath.Join(dir, "source")
	target := filepath.Join(dir, "target")
	if err := os.WriteFile(source, []byte("new"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(target, []byte("old"), 0o600); err != nil {
		t.Fatal(err)
	}

	backup, err := AtomicReplaceWithBackup(source, target)
	if err != nil {
		t.Fatalf("AtomicReplaceWithBackup: %v", err)
	}
	if backup == "" {
		t.Fatal("expected a backup path")
	}
	if err := RestoreBackup(target, backup); err != nil {
		t.Fatalf("RestoreBackup: %v", err)
	}
	got, err := os.ReadFile(target)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != "old" {
		t.Fatalf("restored target = %q, want old", got)
	}
}
