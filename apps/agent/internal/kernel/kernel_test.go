package kernel

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"context"
	"github.com/Nanako660/riricloud/apps/agent/internal/embedded"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestFetchAddsAgentTokenHeader(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.Header.Get("X-Agent-Token") != "secret" {
			t.Error("expected AgentToken header")
		}
		_, err := response.Write([]byte("sing-box"))
		if err != nil {
			t.Error(err)
		}
	}))
	defer server.Close()

	body, err := fetch(context.Background(), server.URL, "secret")
	if err != nil {
		t.Fatalf("fetch: %v", err)
	}
	if string(body) != "sing-box" {
		t.Fatalf("unexpected body: %q", body)
	}
}

func TestWriteArchiveOrBinaryExtractsSingboxTarball(t *testing.T) {
	var archive bytes.Buffer
	gzipWriter := gzip.NewWriter(&archive)
	tarWriter := tar.NewWriter(gzipWriter)
	content := embedded.BuildMockExecutableForCurrentPlatform("sing-box-binary")
	name := "sing-box-1.14.0-" + runtime.GOOS + "-" + runtime.GOARCH + "/" + executableName("sing-box")
	if err := tarWriter.WriteHeader(&tar.Header{Name: name, Mode: 0o755, Size: int64(len(content))}); err != nil {
		t.Fatal(err)
	}
	if _, err := tarWriter.Write(content); err != nil {
		t.Fatal(err)
	}
	if err := tarWriter.Close(); err != nil {
		t.Fatal(err)
	}
	if err := gzipWriter.Close(); err != nil {
		t.Fatal(err)
	}

	destination := filepath.Join(t.TempDir(), executableName("sing-box"))
	if err := writeArchiveOrBinary(destination, archive.Bytes()); err != nil {
		t.Fatalf("writeArchiveOrBinary: %v", err)
	}
	actual, err := os.ReadFile(destination)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(actual, content) {
		t.Fatalf("unexpected extracted content: %q", actual)
	}
}

func TestMasterHTTPBaseRemovesWebSocketPath(t *testing.T) {
	if got := masterHTTPBase("wss://master.example.com/ws/agent"); got != "https://master.example.com" {
		t.Fatalf("unexpected base URL: %s", got)
	}
}

func TestEnsureSkipsExistingBinary(t *testing.T) {
	destination := filepath.Join(t.TempDir(), executableName("sing-box"))
	validKernel := embedded.BuildMockExecutableForCurrentPlatform("kernel")
	if err := os.WriteFile(destination, validKernel, 0o755); err != nil {
		t.Fatal(err)
	}
	downloaded, err := Ensure(context.Background(), Options{Destination: destination})
	if err != nil {
		t.Fatalf("Ensure: %v", err)
	}
	if downloaded {
		t.Fatal("expected existing kernel to skip download")
	}
}

func TestEnsureReplacesExistingMismatchedFormatBinary(t *testing.T) {
	otherOS := "windows"
	if runtime.GOOS == "windows" {
		otherOS = "linux"
	}
	corrupted := embedded.BuildMockExecutableForPlatform(otherOS, "amd64", "wrong-os-pe-on-linux")
	validPayload := embedded.BuildMockExecutableForCurrentPlatform("healed-sing-box-bin")

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(validPayload)
	}))
	defer server.Close()

	destination := filepath.Join(t.TempDir(), executableName("sing-box"))
	if err := os.WriteFile(destination, corrupted, 0o755); err != nil {
		t.Fatal(err)
	}

	downloaded, err := Ensure(context.Background(), Options{
		Destination: destination,
		Source:      "master",
		MasterURL:   server.URL,
	})
	if err != nil {
		t.Fatalf("Ensure self-heal failed: %v", err)
	}
	if !downloaded {
		t.Fatal("expected corrupted/wrong-OS on-disk binary to trigger re-download")
	}
	actual, err := os.ReadFile(destination)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(actual, validPayload) {
		t.Fatalf("expected healed binary on disk")
	}
}

func TestDownloadRejectsUnknownSource(t *testing.T) {
	destination := filepath.Join(t.TempDir(), executableName("sing-box"))
	if err := Download(context.Background(), Options{Source: "bogus", Destination: destination}); err == nil {
		t.Fatal("expected unknown source to fail")
	}
}

func TestNormalizeMirrors(t *testing.T) {
	got := normalizeMirrors([]string{"ghfast.top/", "https://gh-proxy.com", " ", ""})
	want := []string{"https://ghfast.top/", "https://gh-proxy.com/"}
	if len(got) != len(want) {
		t.Fatalf("unexpected length: got %v", got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("mirror[%d] = %q, want %q", i, got[i], want[i])
		}
	}
}

func TestEnsureUsesCustomURLWhenSpecified(t *testing.T) {
	customPayload := embedded.BuildMockExecutableForCurrentPlatform("custom-sing-box-bin")
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(customPayload)
	}))
	defer server.Close()

	destination := filepath.Join(t.TempDir(), executableName("sing-box"))
	downloaded, err := Ensure(context.Background(), Options{
		Destination: destination,
		URL:         server.URL,
	})
	if err != nil {
		t.Fatalf("Ensure: %v", err)
	}
	if !downloaded {
		t.Fatal("expected downloaded to be true")
	}
	content, err := os.ReadFile(destination)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(content, customPayload) {
		t.Fatalf("unexpected content")
	}
}
