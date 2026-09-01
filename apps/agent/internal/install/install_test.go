package install

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"context"
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
	content := []byte("sing-box-binary")
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
