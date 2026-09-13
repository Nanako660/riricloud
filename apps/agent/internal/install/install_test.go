package install

import (
	"context"
	"path/filepath"
	"testing"
)

func TestDownloadSingboxRejectsUnknownSource(t *testing.T) {
	err := downloadSingbox(context.Background(), Options{SingboxSource: "bogus"}, "wss://master.example.com/ws/agent", filepath.Join(t.TempDir(), "sing-box"))
	if err == nil {
		t.Fatal("expected unknown source to fail")
	}
}
